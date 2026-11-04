import algosdk from 'algosdk';
import type { SignAndSendResult, WalletId } from './adapters/types.js';
import type { WalletScope } from './state/scope.svelte.js';

export type TransactionSigner = Readonly<{ address: string; walletId: WalletId }>;
export type SignOptions = Readonly<{ message?: string }>;
export type SubmissionGroupState = 'confirmed' | 'submitted-unconfirmed' | 'not-sent';
export type SubmissionGroupStatus = Readonly<{
	index: number;
	txIds: readonly string[];
	state: SubmissionGroupState;
}>;
export const SIGNER_API_VERSION = 1 as const;

export class SignerDisconnectedError extends Error {
	readonly name = 'SignerDisconnectedError';
	readonly code = 'SIGNER_DISCONNECTED';

	constructor(
		readonly address: string,
		readonly walletId: WalletId
	) {
		super(`Account ${address}: its wallet (${walletId}) is disconnected.`);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class SignerTransactionMismatchError extends Error {
	readonly name = 'SignerTransactionMismatchError';
	readonly code = 'SIGNER_TRANSACTION_MISMATCH';

	constructor(
		readonly sender: string,
		readonly address: string,
		readonly groupIndex: number,
		readonly transactionIndex: number
	) {
		super(`Transaction sender ${sender} does not match signer account ${address}.`);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class SignerWatchOnlyError extends Error {
	readonly name = 'SignerWatchOnlyError';
	readonly code = 'SIGNER_WATCH_ONLY';

	constructor(
		readonly address: string,
		readonly walletId: WalletId
	) {
		super(`Account ${address} is watch-only and cannot sign.`);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class SignerResultMismatchError extends Error {
	readonly name = 'SignerResultMismatchError';
	readonly code = 'SIGNER_RESULT_MISMATCH';

	constructor(
		readonly address: string,
		readonly walletId: WalletId,
		readonly index: number,
		readonly reason: 'count' | 'empty' | 'mismatch'
	) {
		super(
			`Wallet ${walletId} returned an unexpected signed transaction at position ${index} for account ${address}.`
		);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Every group's txIds are computed locally and can be looked up on chain.
 * A retry must re-check on chain every txId of every submitted-unconfirmed group
 * before re-signing, because that group may have landed. This includes a send
 * that errored without an algod rejection and a 400 "already in ledger" response.
 * A not-sent group was never attempted or algod definitely rejected the
 * transaction itself.
 */
export class SignerSubmissionError extends Error {
	readonly name = 'SignerSubmissionError';
	readonly code = 'SIGNER_SUBMISSION_FAILED';

	constructor(
		readonly groupIndex: number,
		readonly groups: readonly SubmissionGroupStatus[],
		readonly cause: unknown
	) {
		super(
			`Submission failed at group ${groupIndex}: ${cause instanceof Error ? cause.message : String(cause)}`
		);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

function classifySendFailure(cause: unknown): SubmissionGroupState {
	if (
		!(cause instanceof Error) ||
		typeof cause.message !== 'string' ||
		!('response' in cause) ||
		typeof cause.response !== 'object' ||
		cause.response === null ||
		!('status' in cause.response) ||
		cause.response.status !== 400 ||
		/already|in pool/i.test(cause.message)
	) {
		return 'submitted-unconfirmed';
	}
	return /overspend|signature|txn dead|outside of|below min|fee too small|malformed/i.test(
		cause.message
	)
		? 'not-sent'
		: 'submitted-unconfirmed';
}

const walletIds: readonly WalletId[] = [
	'pera',
	'defly',
	'kibisis',
	'lute',
	'walletconnect',
	'biatec',
	'voiwallet',
	'watch'
];

/** Sign with an explicit account in this scope, independently of UI selection. */
export function createSigning(
	scope: Pick<WalletScope, 'walletStore' | 'registry' | 'providerStore'>
): {
	signTransactions(
		groups: algosdk.Transaction[][],
		signer: TransactionSigner,
		options?: SignOptions
	): Promise<Uint8Array[]>;
	signAndSendTransactions(
		groups: algosdk.Transaction[][],
		signer: TransactionSigner,
		options?: SignOptions
	): Promise<SignAndSendResult>;
} {
	async function resolve(
		groups: algosdk.Transaction[][],
		signer: TransactionSigner,
		options: SignOptions | undefined,
		submit = false
	) {
		// Capture both fields before awaiting the wallet so caller mutations cannot change identity.
		const address = signer && typeof signer === 'object' ? signer.address : undefined;
		const walletId = signer && typeof signer === 'object' ? signer.walletId : undefined;
		if (
			typeof address !== 'string' ||
			!address ||
			!algosdk.isValidAddress(address) ||
			typeof walletId !== 'string' ||
			!walletIds.includes(walletId)
		) {
			throw new TypeError('An explicit signer { address, walletId } is required.');
		}

		if (
			!Array.isArray(groups) ||
			groups.length === 0 ||
			Array.from(groups).some((group) => !Array.isArray(group) || group.length === 0)
		) {
			throw new TypeError('At least one transaction is required.');
		}

		let snapshot: algosdk.Transaction[][];
		let txIds: string[];
		try {
			snapshot = groups.map((group) =>
				Array.from(group, (txn) => {
					// No instanceof check: a transaction built by another copy of algosdk is a valid
					// request, and decoding rejects anything that is not a well-formed transaction.
					return algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(txn));
				})
			);
			txIds = snapshot.flat().map((txn) => txn.txID());
		} catch {
			throw new TypeError('Invalid transaction in signing request.');
		}

		const algod = submit ? scope.providerStore.algodClient : null;
		if (submit && !algod) throw new Error('Algod client not available');

		const account = scope.walletStore.accounts.find(
			(account) => account.address === address && account.walletId === walletId
		);
		const adapter = scope.registry.getAdapter(walletId);
		if (!account || !adapter?.isConnected()) {
			throw new SignerDisconnectedError(address, walletId);
		}
		if (account.isWatch || adapter.isWatchOnly) {
			throw new SignerWatchOnlyError(address, walletId);
		}

		for (const [groupIndex, group] of snapshot.entries()) {
			for (const [transactionIndex, txn] of group.entries()) {
				const sender = algosdk.encodeAddress(txn.sender.publicKey);
				if (sender !== address) {
					throw new SignerTransactionMismatchError(sender, address, groupIndex, transactionIndex);
				}
			}
		}

		const signed = await adapter.signTransactions(snapshot, { message: options?.message });
		if (signed.length !== txIds.length) {
			throw new SignerResultMismatchError(
				address,
				walletId,
				Math.min(signed.length, txIds.length),
				'count'
			);
		}
		for (const [index, txId] of txIds.entries()) {
			const blob = signed[index];
			if (!blob || blob.length === 0) {
				throw new SignerResultMismatchError(address, walletId, index, 'empty');
			}
			let matches = false;
			try {
				matches = algosdk.decodeSignedTransaction(blob).txn.txID() === txId;
			} catch {
				// Undecodable results cannot be matched to the requested transaction.
			}
			if (!matches) {
				throw new SignerResultMismatchError(address, walletId, index, 'mismatch');
			}
		}
		return { signed, algod, snapshot };
	}

	return {
		async signTransactions(groups, signer, options) {
			return (await resolve(groups, signer, options)).signed;
		},
		async signAndSendTransactions(groups, signer, options) {
			const { signed, algod, snapshot } = await resolve(groups, signer, options, true);
			const txIds: string[] = [];
			const statuses: SubmissionGroupStatus[] = snapshot.map((group, index) => ({
				index,
				txIds: group.map((txn) => txn.txID()),
				state: 'not-sent'
			}));
			let confirmedRound = 0n;
			let offset = 0;
			for (const [groupIndex, group] of snapshot.entries()) {
				const blobs = signed.slice(offset, offset + group.length);
				offset += group.length;
				try {
					const { txid } = await algod!.sendRawTransaction(blobs).do();
					statuses[groupIndex] = {
						...statuses[groupIndex],
						state: 'submitted-unconfirmed'
					};
					const confirmation = await algosdk.waitForConfirmation(algod!, txid, 4);
					statuses[groupIndex] = { ...statuses[groupIndex], state: 'confirmed' };
					txIds.push(txid);
					confirmedRound = confirmation.confirmedRound ?? confirmedRound;
				} catch (cause) {
					if (statuses[groupIndex].state === 'not-sent') {
						statuses[groupIndex] = {
							...statuses[groupIndex],
							state: classifySendFailure(cause)
						};
					}
					throw new SignerSubmissionError(groupIndex, statuses, cause);
				}
			}
			return { txIds, confirmedRound };
		}
	};
}

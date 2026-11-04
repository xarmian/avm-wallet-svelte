import algosdk from 'algosdk';
import type { SignAndSendResult, WalletId } from './adapters/types.js';
import type { WalletScope } from './state/scope.svelte.js';

export type TransactionSigner = Readonly<{ address: string; walletId: WalletId }>;
export type SignOptions = Readonly<{ message?: string }>;
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

		for (const [groupIndex, group] of groups.entries()) {
			for (const [transactionIndex, txn] of group.entries()) {
				const sender = algosdk.encodeAddress(txn.sender.publicKey);
				if (sender !== address) {
					throw new SignerTransactionMismatchError(sender, address, groupIndex, transactionIndex);
				}
			}
		}

		const signed = await adapter.signTransactions(groups, { message: options?.message });
		const transactions = groups.flat();
		if (signed.length !== transactions.length) {
			throw new SignerResultMismatchError(
				address,
				walletId,
				Math.min(signed.length, transactions.length),
				'count'
			);
		}
		for (const [index, txn] of transactions.entries()) {
			const blob = signed[index];
			if (!blob || blob.length === 0) {
				throw new SignerResultMismatchError(address, walletId, index, 'empty');
			}
			let matches = false;
			try {
				matches = algosdk.decodeSignedTransaction(blob).txn.txID() === txn.txID();
			} catch {
				// Undecodable results cannot be matched to the requested transaction.
			}
			if (!matches) {
				throw new SignerResultMismatchError(address, walletId, index, 'mismatch');
			}
		}
		return { signed, algod };
	}

	return {
		async signTransactions(groups, signer, options) {
			return (await resolve(groups, signer, options)).signed;
		},
		async signAndSendTransactions(groups, signer, options) {
			const { signed, algod } = await resolve(groups, signer, options, true);
			const txIds: string[] = [];
			let confirmedRound = 0n;
			let offset = 0;
			for (const group of groups) {
				const blobs = signed.slice(offset, offset + group.length);
				offset += group.length;
				const { txid } = await algod!.sendRawTransaction(blobs).do();
				const confirmation = await algosdk.waitForConfirmation(algod!, txid, 4);
				txIds.push(txid);
				confirmedRound = confirmation.confirmedRound ?? confirmedRound;
			}
			return { txIds, confirmedRound };
		}
	};
}

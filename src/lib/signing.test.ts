import { beforeEach, describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import type { WalletAdapter, WalletId } from './adapters/types.js';
import { createWalletStore } from './state/wallet-store.svelte.js';
import { createWalletScope } from './state/scope.svelte.js';
import type { WalletScope } from './state/scope.svelte.js';
import {
	createSigning,
	SIGNER_API_VERSION,
	SignerDisconnectedError,
	SignerTransactionMismatchError,
	SignerWatchOnlyError,
	SignerResultMismatchError,
	SignerSubmissionError,
	type TransactionSigner
} from './signing.js';

const a = algosdk.generateAccount();
const b = algosdk.generateAccount();
const address = a.addr.toString();
const signer: TransactionSigner = { address, walletId: 'pera' };
let id = 0;
function payment(sender = a, amount = 1) {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: sender.addr,
		receiver: b.addr,
		amount,
		suggestedParams: {
			fee: 1000,
			minFee: 1000,
			flatFee: true,
			firstValid: 1,
			lastValid: 100,
			genesisHash: new Uint8Array(32),
			genesisID: 'test-v1'
		}
	});
}
function adapter(walletId: WalletId = 'pera') {
	return {
		id: walletId,
		name: walletId,
		icon: '',
		supportsAuth: false,
		isWatchOnly: false as boolean,
		initialize: vi.fn(),
		connect: vi.fn(),
		disconnect: vi.fn(),
		reconnect: vi.fn(),
		isConnected: vi.fn(() => true),
		signTransactions: vi.fn(async (groups: algosdk.Transaction[][]) =>
			groups.flat().map((txn) => txn.signTxn(a.sk))
		),
		signAndSendTransactions: vi.fn()
	} satisfies WalletAdapter;
}
function setup(hasAlgod = true) {
	const walletStore = createWalletStore(`signing-${++id}`);
	walletStore.addAccounts([{ ...signer, authenticated: false, isWatch: false }]);
	const pera = adapter();
	const defly = adapter('defly');
	const getAdapter = vi.fn((id: WalletId) =>
		id === 'pera' ? pera : id === 'defly' ? defly : undefined
	);
	const send = vi
		.fn()
		.mockResolvedValueOnce({ txid: 'tx1' })
		.mockResolvedValueOnce({ txid: 'tx2' });
	const pending = vi
		.fn()
		.mockResolvedValueOnce({ confirmedRound: 11n })
		.mockResolvedValueOnce({ confirmedRound: 12n });
	const algod = {
		sendRawTransaction: vi.fn((_blobs: Uint8Array[]) => ({ do: send })),
		status: vi.fn(() => ({ do: vi.fn().mockResolvedValue({ lastRound: 10n }) })),
		pendingTransactionInformation: vi.fn((_txid: string) => ({ do: pending })),
		statusAfterBlock: vi.fn(() => ({ do: vi.fn() }))
	};
	const input = {
		walletStore,
		registry: { getAdapter },
		providerStore: { algodClient: hasAlgod ? algod : null }
	} as unknown as Pick<WalletScope, 'walletStore' | 'registry' | 'providerStore'>;
	return {
		...createSigning(input),
		input,
		walletStore,
		pera,
		defly,
		getAdapter,
		algod,
		pending,
		send
	};
}
class AlgodHTTPError extends Error {
	readonly response;

	constructor(status: number, message: string) {
		const statusText = status === 400 ? 'Bad Request' : 'HTTP Error';
		super(`Network request error. Received status ${status} (${statusText}): ${message}`);
		this.response = {
			status,
			body: new TextEncoder().encode(JSON.stringify({ message })),
			headers: { 'content-type': 'application/json' }
		};
	}
}
function noDispatch(s: ReturnType<typeof setup>) {
	expect(s.pera.signTransactions).not.toHaveBeenCalled();
	expect(s.defly.signTransactions).not.toHaveBeenCalled();
	expect(s.pera.signAndSendTransactions).not.toHaveBeenCalled();
	expect(s.defly.signAndSendTransactions).not.toHaveBeenCalled();
}
beforeEach(() => localStorage.clear());

it('publishes signer API version 1', () => expect(SIGNER_API_VERSION).toBe(1));

for (const method of ['signTransactions', 'signAndSendTransactions'] as const) {
	describe(method, () => {
		it.each([
			['address only', { address }],
			['bare address', address],
			['Algod-like client', { sendRawTransaction: vi.fn() }],
			['null', null],
			['undefined', undefined],
			['invalid address', { ...signer, address: 'bad' }],
			['empty wallet', { ...signer, walletId: '' }],
			['unknown wallet', { ...signer, walletId: 'unknown' }]
		])('rejects an invalid explicit signer: %s', async (_label, invalid) => {
			const s = setup();
			let result: Promise<unknown> | undefined;
			expect(() => {
				result = s[method]([[payment()]], invalid as TransactionSigner);
			}).not.toThrow();
			await expect(result).rejects.toBeInstanceOf(TypeError);
			await expect(result).rejects.toThrow(
				new TypeError('An explicit signer { address, walletId } is required.')
			);
			noDispatch(s);
		});

		it('requires the exact address and wallet pair even when another wallet is connected', async () => {
			const s = setup();
			s.walletStore.addAccounts([
				{ address: b.addr.toString(), walletId: 'defly', authenticated: false, isWatch: false }
			]);
			await expect(s[method]([[payment()]], { address, walletId: 'defly' })).rejects.toBeInstanceOf(
				SignerDisconnectedError
			);
			noDispatch(s);
		});

		it('uses the explicit signer while another account is selected and preserves selection', async () => {
			const s = setup();
			const selected = {
				address: b.addr.toString(),
				walletId: 'defly' as const,
				authenticated: false,
				isWatch: false
			};
			s.walletStore.addAccounts([selected]);
			s.walletStore.selectAccount(selected);
			await s[method]([[payment()]], signer);
			expect(s.pera.signTransactions).toHaveBeenCalledTimes(1);
			expect(s.defly.signTransactions).not.toHaveBeenCalled();
			expect(s.walletStore.selectedAccount).toEqual(selected);
		});

		it('works without any selected account and never reads selection', async () => {
			const s = setup();
			const accounts = s.walletStore.accounts;
			s.walletStore.reset();
			// Keep real accounts while making any dependency on selection observable.
			Object.defineProperty(s.walletStore, 'accounts', { get: () => accounts });
			expect(s.walletStore.selectedAccount).toBeNull();
			Object.defineProperty(s.walletStore, 'selectedAccount', {
				get: () => {
					throw new Error('Selection must not be read');
				}
			});
			await s[method]([[payment()]], signer);
			expect(s.pera.signTransactions).toHaveBeenCalledTimes(1);
		});

		it.each(['absent pair', 'disconnected adapter', 'missing adapter'])(
			'rejects a disconnected signer: %s',
			async (kind) => {
				const s = setup();
				if (kind === 'absent pair') s.walletStore.reset();
				if (kind === 'disconnected adapter') s.pera.isConnected.mockReturnValue(false);
				if (kind === 'missing adapter') s.getAdapter.mockReturnValue(undefined);
				const error = await s[method]([[payment()]], signer).catch((e) => e);
				expect(error).toBeInstanceOf(SignerDisconnectedError);
				expect(error).toMatchObject({
					name: 'SignerDisconnectedError',
					code: 'SIGNER_DISCONNECTED',
					address,
					walletId: 'pera',
					message: `Account ${address}: its wallet (pera) is disconnected.`
				});
				noDispatch(s);
			}
		);

		it.each(['stored account', 'adapter'])(
			'rejects watch-only signing from the %s',
			async (kind) => {
				const s = setup();
				if (kind === 'stored account') s.walletStore.accounts[0].isWatch = true;
				else s.pera.isWatchOnly = true;
				const error = await s[method]([[payment()]], signer).catch((e) => e);
				expect(error).toBeInstanceOf(SignerWatchOnlyError);
				expect(error).toMatchObject({
					name: 'SignerWatchOnlyError',
					code: 'SIGNER_WATCH_ONLY',
					address,
					walletId: 'pera',
					message: `Account ${address} is watch-only and cannot sign.`
				});
				noDispatch(s);
			}
		);

		it.each([
			[0, 0],
			[1, 1]
		])(
			'rejects the whole request for a different sender at group %i index %i',
			async (groupIndex, transactionIndex) => {
				const s = setup();
				const groups = groupIndex === 0 ? [[payment(b)]] : [[payment()], [payment(), payment(b)]];
				const error = await s[method](groups, signer).catch((e) => e);
				expect(error).toBeInstanceOf(SignerTransactionMismatchError);
				expect(error).toMatchObject({
					name: 'SignerTransactionMismatchError',
					code: 'SIGNER_TRANSACTION_MISMATCH',
					sender: b.addr.toString(),
					address,
					groupIndex,
					transactionIndex,
					message: `Transaction sender ${b.addr} does not match signer account ${address}.`
				});
				noDispatch(s);
			}
		);

		it.each([
			{ groups: [] },
			{ groups: [[]] },
			{ groups: [[payment()], []] },
			{ groups: null },
			{ groups: {} },
			{ groups: [payment()] }
		])('rejects an empty or malformed request ($groups)', async ({ groups }) => {
			const s = setup();
			const result = s[method](groups as algosdk.Transaction[][], signer);
			await expect(result).rejects.toBeInstanceOf(TypeError);
			await expect(result).rejects.toThrow('At least one transaction is required.');
			noDispatch(s);
		});

		it.each([{}, null])('rejects a non-Transaction entry: %s', async (entry) => {
			const s = setup();
			const result = s[method]([[entry]] as unknown as algosdk.Transaction[][], signer);
			await expect(result).rejects.toThrow(
				new TypeError('Invalid transaction in signing request.')
			);
			noDispatch(s);
		});

		it('accepts a transaction built by another copy of algosdk', async () => {
			const s = setup();
			const txn = payment();
			const foreign = {
				getEncodingSchema: () => txn.getEncodingSchema(),
				toEncodingData: () => txn.toEncodingData()
			} as unknown as algosdk.Transaction;
			expect(foreign instanceof algosdk.Transaction).toBe(false);
			await expect(s[method]([[foreign]], signer)).resolves.toBeDefined();
			expect(s.pera.signTransactions).toHaveBeenCalledTimes(1);
		});

		it('rejects a transaction that cannot round trip through unsigned encoding', async () => {
			const s = setup();
			const txn = payment();
			txn.group = new Uint8Array(1);
			await expect(s[method]([[txn]], signer)).rejects.toThrow(
				new TypeError('Invalid transaction in signing request.')
			);
			noDispatch(s);
		});

		it('signs the original content when the caller transaction changes during signing', async () => {
			const s = setup();
			const txn = payment();
			const txId = txn.txID();
			const blob = txn.signTxn(a.sk);
			s.pera.signTransactions.mockImplementation(async () => {
				await Promise.resolve();
				(txn as { sender: algosdk.Address }).sender = b.addr;
				return [blob];
			});
			await s[method]([[txn]], signer);
			const received = s.pera.signTransactions.mock.calls[0][0][0][0];
			expect(received).not.toBe(txn);
			expect(received.sender.toString()).toBe(address);
			expect(received.txID()).toBe(txId);
		});

		it('rejects signed content matching a caller mutation after dispatch', async () => {
			const s = setup();
			const txn = payment();
			s.pera.signTransactions.mockImplementation(async () => {
				await Promise.resolve();
				(txn as { sender: algosdk.Address }).sender = b.addr;
				return [txn.signTxn(b.sk)];
			});
			const result = s[method]([[txn]], signer);
			await expect(result).rejects.toBeInstanceOf(SignerResultMismatchError);
			await expect(result).rejects.toMatchObject({ reason: 'mismatch', index: 0 });
			expect(s.algod.sendRawTransaction).not.toHaveBeenCalled();
		});

		it('preserves group IDs and transaction IDs in the dispatched snapshot', async () => {
			const s = setup();
			const group = algosdk.assignGroupID([payment(), payment(a, 2)]);
			const txIds = group.map((txn) => txn.txID());
			const groupId = group[0].group!.slice();
			await s[method]([group], signer);
			const received = s.pera.signTransactions.mock.calls[0][0][0];
			expect(received).not.toBe(group);
			for (const [index, txn] of received.entries()) {
				expect(txn).not.toBe(group[index]);
				expect(txn.group).toEqual(groupId);
				expect(txn.group).not.toBe(group[index].group);
				expect(txn.txID()).toBe(txIds[index]);
			}
		});

		it('passes only the message option to the explicit signer adapter', async () => {
			const s = setup();
			const groups = [[payment()]];
			await s[method](groups, signer, {
				message: 'm',
				authAddr: 'X',
				walletId: 'defly',
				address: 'B'
			} as { message: string });
			expect(s.pera.signTransactions).toHaveBeenCalledWith([[expect.any(algosdk.Transaction)]], {
				message: 'm'
			});
			expect(s.pera.signTransactions.mock.calls[0][0][0][0].txID()).toBe(groups[0][0].txID());
			expect(s.defly.signTransactions).not.toHaveBeenCalled();
		});

		it.each([
			['count', 1, 'fewer'],
			['count', 2, 'extra'],
			['empty', 1, 'empty'],
			['empty', 1, 'missing'],
			['mismatch', 1, 'different'],
			['mismatch', 1, 'undecodable']
		] as const)('rejects signed results with reason %s at %i (%s)', async (reason, index, kind) => {
			const s = setup();
			const groups = [[payment()], [payment(a, 2)]];
			const good = groups.flat().map((txn) => txn.signTxn(a.sk));
			const results = {
				fewer: [good[0]],
				extra: [...good, good[0]],
				empty: [good[0], new Uint8Array()],
				missing: [good[0], undefined as unknown as Uint8Array],
				different: [good[0], payment(a, 3).signTxn(a.sk)],
				undecodable: [good[0], new Uint8Array([1, 2, 3])]
			};
			s.pera.signTransactions.mockResolvedValue(results[kind]);
			const error = await s[method](groups, signer).catch((e) => e);
			expect(error).toBeInstanceOf(SignerResultMismatchError);
			expect(error).toMatchObject({
				name: 'SignerResultMismatchError',
				code: 'SIGNER_RESULT_MISMATCH',
				address,
				walletId: 'pera',
				reason,
				index,
				message: `Wallet pera returned an unexpected signed transaction at position ${index} for account ${address}.`
			});
			expect(s.algod.sendRawTransaction).not.toHaveBeenCalled();
		});

		it('rejects an account connected only in a different scope', async () => {
			const one = setup();
			const two = setup();
			two.walletStore.reset();
			await one[method]([[payment()]], signer);
			await expect(two[method]([[payment()]], signer)).rejects.toBeInstanceOf(
				SignerDisconnectedError
			);
			noDispatch(two);
		});

		it('snapshots signer fields before the adapter resolves', async () => {
			const s = setup();
			const mutable = { ...signer };
			const txn = payment();
			let resolve!: (blobs: Uint8Array[]) => void;
			s.pera.signTransactions.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				})
			);
			const result = s[method]([[txn]], mutable);
			mutable.address = b.addr.toString();
			mutable.walletId = 'defly';
			expect(s.getAdapter).toHaveBeenCalledWith('pera');
			expect(s.pera.signTransactions).toHaveBeenCalledWith([[expect.any(algosdk.Transaction)]], {
				message: undefined
			});
			expect(s.pera.signTransactions.mock.calls[0][0][0][0].txID()).toBe(txn.txID());
			expect(s.defly.signTransactions).not.toHaveBeenCalled();
			resolve([new Uint8Array()]);
			await expect(result).rejects.toMatchObject({ address, walletId: 'pera', reason: 'empty' });
		});
	});
}

it('returns the verified signed array unchanged', async () => {
	const s = setup();
	const groups = [[payment()]];
	const blobs = [groups[0][0].signTxn(a.sk)];
	s.pera.signTransactions.mockResolvedValue(blobs);
	expect(await s.signTransactions(groups, signer)).toBe(blobs);
});

it('submits and confirms two groups sequentially without using adapter submission', async () => {
	const s = setup();
	const groups = [[payment(), payment(a, 2)], [payment(a, 3)]];
	const blobs = groups.flat().map((txn) => txn.signTxn(a.sk));
	s.pera.signTransactions.mockResolvedValue(blobs);
	const order: string[] = [];
	s.send
		.mockReset()
		.mockImplementationOnce(async () => {
			order.push('send1');
			return { txid: 'tx1' };
		})
		.mockImplementationOnce(async () => {
			order.push('send2');
			return { txid: 'tx2' };
		});
	s.pending
		.mockReset()
		.mockImplementationOnce(async () => {
			order.push('confirm1');
			return { confirmedRound: 11n };
		})
		.mockImplementationOnce(async () => {
			order.push('confirm2');
			return { confirmedRound: 12n };
		});
	expect(await s.signAndSendTransactions(groups, signer)).toEqual({
		txIds: ['tx1', 'tx2'],
		confirmedRound: 12n
	});
	expect(s.algod.sendRawTransaction.mock.calls).toEqual([[blobs.slice(0, 2)], [blobs.slice(2)]]);
	expect(s.algod.pendingTransactionInformation.mock.calls).toEqual([['tx1'], ['tx2']]);
	expect(order).toEqual(['send1', 'confirm1', 'send2', 'confirm2']);
	expect(s.pera.signAndSendTransactions).not.toHaveBeenCalled();
});

it('reports an unconfirmed submission without submitting a later group', async () => {
	const s = setup();
	const error = new Error('Confirmation unavailable');
	s.algod.status.mockReturnValue({ do: vi.fn().mockRejectedValue(error) });
	const groups = [[payment()], [payment(a, 2)]];
	const result = s.signAndSendTransactions(groups, signer);
	await expect(result).rejects.toBeInstanceOf(SignerSubmissionError);
	await expect(result).rejects.toMatchObject({
		groupIndex: 0,
		cause: error,
		groups: [
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state: 'submitted-unconfirmed' },
			{ index: 1, txIds: groups[1].map((txn) => txn.txID()), state: 'not-sent' }
		]
	});
	expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(1);
	expect(s.pera.signAndSendTransactions).not.toHaveBeenCalled();
});

it('uses the four round confirmation limit', async () => {
	const s = setup();
	s.pending.mockReset().mockResolvedValue({ confirmedRound: 0n });
	await expect(s.signAndSendTransactions([[payment()]], signer)).rejects.toThrow(
		'Transaction not confirmed after 4 rounds'
	);
	expect(s.algod.statusAfterBlock).toHaveBeenCalledTimes(4);
});

it.each([
	['algod rejection', new AlgodHTTPError(400, 'overspend (account X, data {...})'), 'not-sent'],
	['network error', new TypeError('fetch failed'), 'submitted-unconfirmed']
] as const)(
	'records local txIds for every group when the first send fails: %s',
	async (_label, cause, state) => {
		const s = setup();
		const groups = [[payment(), payment(a, 2)], [payment(a, 3)], [payment(a, 4), payment(a, 5)]];
		s.send.mockReset().mockRejectedValue(cause);
		const error = await s.signAndSendTransactions(groups, signer).catch((error) => error);
		expect(error).toBeInstanceOf(SignerSubmissionError);
		expect(error.groupIndex).toBe(0);
		expect(error.cause).toBe(cause);
		expect(error.groups).toEqual([
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state },
			{ index: 1, txIds: groups[1].map((txn) => txn.txID()), state: 'not-sent' },
			{ index: 2, txIds: groups[2].map((txn) => txn.txID()), state: 'not-sent' }
		]);
		expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(1);
	}
);

it('rejects a missing algod client before signing', async () => {
	const s = setup(false);
	await expect(s.signAndSendTransactions([[payment()]], signer)).rejects.toThrow(
		'Algod client not available'
	);
	noDispatch(s);
});

it.each(['default', 'signing-scope-functions'])(
	'exposes signing methods through the %s scope',
	(scopeId) => {
		const scope = createWalletScope(scopeId);
		expect(scope.signTransactions).toBeTypeOf('function');
		expect(scope.signAndSendTransactions).toBeTypeOf('function');
	}
);

it('dispatches and submits the original group shape when caller arrays change', async () => {
	const s = setup();
	const groups = [[payment(), payment(a, 2)], [payment(a, 3)]];
	const txIds = groups.flat().map((txn) => txn.txID());
	const blobs = groups.flat().map((txn) => txn.signTxn(a.sk));
	s.pera.signTransactions.mockImplementation(async (received) => {
		await Promise.resolve();
		return received.flat().map((txn) => txn.signTxn(a.sk));
	});
	const result = s.signAndSendTransactions(groups, signer);
	groups[0] = [payment(a, 4)];
	groups.push([payment(a, 5)]);
	await expect(result).resolves.toEqual({ txIds: ['tx1', 'tx2'], confirmedRound: 12n });
	const received = s.pera.signTransactions.mock.calls[0][0];
	expect(received.map((group) => group.length)).toEqual([2, 1]);
	expect(received.flat().map((txn) => txn.txID())).toEqual(txIds);
	expect(s.algod.sendRawTransaction.mock.calls).toEqual([[blobs.slice(0, 2)], [blobs.slice(2)]]);
});

it('submits verified blobs per original group when caller transactions change during signing', async () => {
	const s = setup();
	const groups = [[payment(), payment(a, 2)], [payment(a, 3)]];
	const txIds = groups.flat().map((txn) => txn.txID());
	const blobs = groups.flat().map((txn) => txn.signTxn(a.sk));
	s.pera.signTransactions.mockImplementation(async () => {
		await Promise.resolve();
		for (const txn of groups.flat()) (txn as { sender: algosdk.Address }).sender = b.addr;
		return blobs;
	});
	await s.signAndSendTransactions(groups, signer);
	const received = s.pera.signTransactions.mock.calls[0][0];
	expect(received.flat().map((txn) => txn.sender.toString())).toEqual([address, address, address]);
	expect(received.flat().map((txn) => txn.txID())).toEqual(txIds);
	expect(s.algod.sendRawTransaction.mock.calls).toEqual([[blobs.slice(0, 2)], [blobs.slice(2)]]);
});

it('records confirmed and unsent groups when the second send fails', async () => {
	const s = setup();
	const cause = new Error('Node unavailable');
	s.send.mockReset().mockResolvedValueOnce({ txid: 'tx1' }).mockRejectedValueOnce(cause);
	const groups = [[payment()], [payment(a, 2)], [payment(a, 3)]];
	const result = s.signAndSendTransactions(groups, signer);
	await expect(result).rejects.toBeInstanceOf(SignerSubmissionError);
	const error = await result.catch((error) => error);
	expect(error).toMatchObject({
		name: 'SignerSubmissionError',
		code: 'SIGNER_SUBMISSION_FAILED',
		message: 'Submission failed at group 1: Node unavailable',
		groupIndex: 1,
		groups: [
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state: 'confirmed' },
			{ index: 1, txIds: groups[1].map((txn) => txn.txID()), state: 'submitted-unconfirmed' },
			{ index: 2, txIds: groups[2].map((txn) => txn.txID()), state: 'not-sent' }
		]
	});
	expect(error.cause).toBe(cause);
	expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(2);
	expect(s.algod.pendingTransactionInformation.mock.calls).toEqual([['tx1']]);
});

it('records the second group txId when its confirmation times out', async () => {
	const s = setup();
	s.pending
		.mockReset()
		.mockResolvedValueOnce({ confirmedRound: 11n })
		.mockResolvedValue({ confirmedRound: 0n });
	const groups = [[payment()], [payment(a, 2)], [payment(a, 3)]];
	const result = s.signAndSendTransactions(groups, signer);
	await expect(result).rejects.toBeInstanceOf(SignerSubmissionError);
	const error = await result.catch((error) => error);
	expect(error).toMatchObject({
		groupIndex: 1,
		groups: [
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state: 'confirmed' },
			{ index: 1, txIds: groups[1].map((txn) => txn.txID()), state: 'submitted-unconfirmed' },
			{ index: 2, txIds: groups[2].map((txn) => txn.txID()), state: 'not-sent' }
		]
	});
	expect(error.cause).toBeInstanceOf(Error);
	expect(error.cause.message).toBe('Transaction not confirmed after 4 rounds');
	expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(2);
	expect(s.algod.statusAfterBlock).toHaveBeenCalledTimes(4);
});

it('preserves a non-Error submission cause and includes it in the message', async () => {
	const s = setup();
	s.send.mockReset().mockRejectedValue('Node refused submission');
	const groups = [[payment()]];
	const result = s.signAndSendTransactions(groups, signer);
	await expect(result).rejects.toBeInstanceOf(SignerSubmissionError);
	await expect(result).rejects.toMatchObject({
		cause: 'Node refused submission',
		message: 'Submission failed at group 0: Node refused submission',
		groupIndex: 0,
		groups: [
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state: 'submitted-unconfirmed' }
		]
	});
});

it('preserves validation errors before submission', async () => {
	const s = setup();
	const result = s.signAndSendTransactions([[payment(b)]], signer);
	await expect(result).rejects.toBeInstanceOf(SignerTransactionMismatchError);
	await expect(result).rejects.not.toBeInstanceOf(SignerSubmissionError);
	expect(s.algod.sendRawTransaction).not.toHaveBeenCalled();
	noDispatch(s);
});

describe('classifies a rejected second send', () => {
	async function checkFailure(cause: unknown, state: 'not-sent' | 'submitted-unconfirmed') {
		const s = setup();
		const groups = [
			[payment(), payment(a, 2)],
			[payment(a, 3), payment(a, 4)],
			[payment(a, 5), payment(a, 6)]
		];
		s.send.mockReset().mockResolvedValueOnce({ txid: 'tx1' }).mockRejectedValueOnce(cause);
		const error = await s.signAndSendTransactions(groups, signer).catch((error) => error);
		expect(error).toBeInstanceOf(SignerSubmissionError);
		expect(error.groupIndex).toBe(1);
		expect(error.cause).toBe(cause);
		expect(error.groups).toEqual([
			{ index: 0, txIds: groups[0].map((txn) => txn.txID()), state: 'confirmed' },
			{ index: 1, txIds: groups[1].map((txn) => txn.txID()), state },
			{ index: 2, txIds: groups[2].map((txn) => txn.txID()), state: 'not-sent' }
		]);
		expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(2);
		expect(s.send).toHaveBeenCalledTimes(2);
		expect(s.algod.pendingTransactionInformation.mock.calls).toEqual([['tx1']]);
	}

	it.each([
		['network error', new TypeError('fetch failed')],
		['HTTP 503', new AlgodHTTPError(503, 'overspend')],
		['already in ledger', new AlgodHTTPError(400, 'transaction already in ledger')],
		['unrecognised message', new AlgodHTTPError(400, 'request could not be processed')],
		['rejection and already known', new AlgodHTTPError(400, 'overspend: already in ledger')],
		['non-Error string', 'Node refused submission'],
		['object without response', { message: 'overspend' }],
		['Error without response', new Error('overspend')],
		['non-Error with response', { message: 'overspend', response: { status: 400 } }],
		['non-numeric status', Object.assign(new Error('overspend'), { response: { status: '400' } })],
		['in pool', new AlgodHTTPError(400, 'transaction in pool')],
		['already known', new AlgodHTTPError(400, 'ALREADY received: invalid signature')]
	])('keeps an ambiguous send submitted-unconfirmed: %s', async (_label, cause) => {
		await checkFailure(cause, 'submitted-unconfirmed');
	});

	it.each([401, 403, 404, 408, 429])('keeps HTTP %i submitted-unconfirmed', async (status) => {
		await checkFailure(new AlgodHTTPError(status, 'overspend'), 'submitted-unconfirmed');
	});

	it.each([
		'overspend (account X, data {...})',
		'bad signature',
		'invalid signature',
		'missing signature',
		'malformed signature',
		'txn dead',
		'outside of valid rounds',
		'fee below min',
		'fee too small',
		'MALFORMED transaction'
	])('records an algod HTTP 400 transaction rejection as not-sent: %s', async (message) => {
		await checkFailure(new AlgodHTTPError(400, message), 'not-sent');
	});
});

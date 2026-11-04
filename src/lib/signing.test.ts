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
		isWatchOnly: false,
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
function setup() {
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
		providerStore: { algodClient: algod }
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

		it.each([[], [[]], [[payment()], []], null, {}, [payment()]])(
			'rejects an empty or malformed request (%j)',
			async (groups) => {
				const s = setup();
				await expect(s[method](groups as algosdk.Transaction[][], signer)).rejects.toThrow(
					new TypeError('At least one transaction is required.')
				);
				noDispatch(s);
			}
		);

		it('passes only the message option to the explicit signer adapter', async () => {
			const s = setup();
			const groups = [[payment()]];
			await s[method](groups, signer, {
				message: 'm',
				authAddr: 'X',
				walletId: 'defly',
				address: 'B'
			} as { message: string });
			expect(s.pera.signTransactions).toHaveBeenCalledWith(groups, { message: 'm' });
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
			expect(s.pera.signTransactions).toHaveBeenCalledWith([[txn]], { message: undefined });
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
		.mockImplementationOnce(async () => {
			order.push('send1');
			return { txid: 'tx1' };
		})
		.mockImplementationOnce(async () => {
			order.push('send2');
			return { txid: 'tx2' };
		});
	s.pending
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

it('propagates confirmation errors without submitting a later group', async () => {
	const s = setup();
	const error = new Error('Confirmation unavailable');
	s.algod.status.mockReturnValue({ do: vi.fn().mockRejectedValue(error) });
	await expect(s.signAndSendTransactions([[payment()], [payment(a, 2)]], signer)).rejects.toBe(
		error
	);
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

it('propagates submission errors without submitting a later group', async () => {
	const s = setup();
	const error = new Error('Submission failed');
	s.send.mockReset().mockRejectedValue(error);
	await expect(s.signAndSendTransactions([[payment()], [payment()]], signer)).rejects.toBe(error);
	expect(s.algod.sendRawTransaction).toHaveBeenCalledTimes(1);
});

it('rejects a missing algod client before signing', async () => {
	const s = setup();
	s.input.providerStore = { algodClient: null } as typeof s.input.providerStore;
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

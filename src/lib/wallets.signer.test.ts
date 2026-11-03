// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import { get } from 'svelte/store';
import * as signing from './wallets.js';
import {
	connectedWallets,
	selectedWallet,
	pickWallet,
	ProviderStore,
	setOnSelectHandler,
	setOnAddHandler
} from './store.js';

const providers = vi.hoisted(() => {
	const provider = (WalletName: string) => ({
		WalletName,
		connect: vi.fn(),
		disconnect: vi.fn(),
		initWallet: vi.fn(),
		getSessionAccounts: vi.fn<() => Promise<string[]>>(),
		hasActiveSession: vi.fn<() => Promise<boolean>>(),
		getSessionOwner: vi.fn<() => Promise<string | null>>(),
		signTransactions: vi.fn(),
		signAndSendTransactions: vi.fn()
	});
	return {
		PeraWallet: provider('PeraWallet'),
		DeflyWallet: provider('DeflyWallet'),
		Kibisis: provider('Kibisis'),
		LuteWallet: provider('LuteWallet'),
		WalletConnect: provider('WalletConnect')
	};
});
vi.mock('./perawallet.js', () => providers.PeraWallet);
vi.mock('./deflywallet.js', () => providers.DeflyWallet);
vi.mock('./kibisiswallet.js', () => providers.Kibisis);
vi.mock('./lutewallet.js', () => providers.LuteWallet);
vi.mock('./walletconnect.js', () => providers.WalletConnect);

type Signer = { address: string; app: string };
type Groups = algosdk.Transaction[][];
// Widen only at the test boundary to exercise legacy and malformed JS callers, including the red run.
const sign = signing.signTransactions as unknown as (
	groups: Groups,
	signer?: unknown
) => Promise<Uint8Array[]>;
const send = signing.signAndSendTransactions as unknown as (
	groups: Groups,
	signer?: unknown,
	client?: algosdk.Algodv2
) => Promise<boolean>;
const address = (byte: number) => algosdk.encodeAddress(new Uint8Array(32).fill(byte));
const A = { address: address(1), app: 'PeraWallet' };
const B = { address: address(2), app: 'DeflyWallet' };
const C = { address: address(3), app: 'PeraWallet' };
const signed = [new Uint8Array([1, 2, 3])];
const client = new algosdk.Algodv2('', 'https://example.com', '');
const explicitClient = new algosdk.Algodv2('', 'https://example.org', '');
const txn = (sender = A.address) =>
	algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		from: sender,
		to: A.address,
		amount: 1,
		suggestedParams: {
			fee: 1000,
			flatFee: true,
			firstRound: 1,
			lastRound: 100,
			genesisHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
			genesisID: 'testnet-v1.0'
		}
	});
const providerList = Object.values(providers);
let alertSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.resetAllMocks();
	setOnSelectHandler(() => {});
	setOnAddHandler(() => {});
	connectedWallets.reset();
	selectedWallet.reset();
	localStorage.clear();
	ProviderStore.set({ algodClient: client, indexerClient: undefined });
	connectedWallets.add([A, B]);
	pickWallet(B);
	for (const provider of providerList) {
		provider.getSessionAccounts.mockResolvedValue([A.address, B.address, C.address]);
		provider.signTransactions.mockResolvedValue(signed);
		provider.signAndSendTransactions.mockResolvedValue(true);
	}
	providers.WalletConnect.hasActiveSession.mockResolvedValue(true);
	providers.WalletConnect.getSessionOwner.mockResolvedValue('WalletConnect');
	alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});

function noProviderCalls() {
	for (const provider of providerList) {
		for (const fn of Object.values(provider)) {
			if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
		}
	}
	expect(alertSpy).not.toHaveBeenCalled();
	expect(get(selectedWallet)).toEqual(B);
}

function onlyProvider(app: keyof typeof providers, sending: boolean, groups: Groups, selected = B) {
	for (const [name, provider] of Object.entries(providers)) {
		if (name !== app) {
			for (const fn of Object.values(provider)) {
				if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
			}
			continue;
		}
		const called = sending ? provider.signAndSendTransactions : provider.signTransactions;
		const other = sending ? provider.signTransactions : provider.signAndSendTransactions;
		expect(called).toHaveBeenCalledTimes(1);
		expect(called).toHaveBeenCalledWith(...(sending ? [client, groups] : [groups]));
		expect(called.mock.calls[0][sending ? 1 : 0]).toBe(groups);
		expect(other).not.toHaveBeenCalled();
		if (app !== 'Kibisis') expect(provider.connect).not.toHaveBeenCalled();
	}
	expect(get(selectedWallet)).toEqual(selected);
}

async function disconnected(request: Promise<unknown>, signer: Signer) {
	const error = await request.catch((error: unknown) => error);
	expect(error).toBeInstanceOf(signing.SignerDisconnectedError);
	expect(error).toMatchObject({
		name: 'SignerDisconnectedError',
		code: 'SIGNER_DISCONNECTED',
		address: signer.address,
		app: signer.app,
		message: `Account ${signer.address}: its wallet (${signer.app}) is disconnected.`
	});
}

for (const [name, call, sending] of [
	['signTransactions', sign, false],
	['signAndSendTransactions', send, true]
] as const) {
	describe(name, () => {
		it('L1 routes the captured A/Pera after picking B, preserving groups and result', async () => {
			pickWallet(A);
			const captured = { ...get(selectedWallet)! };
			pickWallet(B);
			const groups = [[txn()], [txn()]];
			const originalBytes = groups.map((group) => group.map(algosdk.encodeUnsignedTransaction));
			expect(await call(groups, captured)).toBe(sending ? true : signed);
			expect(groups.map((group) => group.map(algosdk.encodeUnsignedTransaction))).toEqual(originalBytes);
			onlyProvider('PeraWallet', sending, groups);
		});

		it('L2 routes the captured app after picking the same address in Defly', async () => {
			const captured = { ...A };
			const sameAddress = { ...A, app: 'DeflyWallet' };
			connectedWallets.add([sameAddress]);
			pickWallet(sameAddress);
			const groups = [[txn()]];
			await call(groups, captured);
			onlyProvider('PeraWallet', sending, groups, sameAddress);
		});

		it.each(['address and app decoys', 'same app different address'])(
			'L3 disconnected captured pair stops with SignerDisconnectedError: %s',
			async (decoys) => {
				pickWallet(A);
				const captured = { ...get(selectedWallet)! };
				pickWallet(B);
				connectedWallets.remove(A.app);
				connectedWallets.add(
					decoys === 'address and app decoys' ? [{ ...A, app: B.app }, C] : [C],
					{ select: false }
				);
				await disconnected(call([[txn()]], captured), captured);
				noProviderCalls();
			}
		);

		it.each([undefined, client])(
			'L4 rejects omitted or legacy client signer %s',
			async (signer) => {
				await expect(call([[txn()]], signer)).rejects.toEqual(
					new TypeError('An explicit signer { address, app } is required.')
				);
				noProviderCalls();
			}
		);

		it.each([[[txn()], [txn(), txn(B.address)]], [[txn(), txn(B.address)]]])(
			'L5 rejects every mismatched sender before any provider',
			async (...groups) => {
				const error = await call(groups, A).catch((error: unknown) => error);
				expect(error).toBeInstanceOf(signing.SignerTransactionMismatchError);
				expect(error).toMatchObject({
					name: 'SignerTransactionMismatchError',
					code: 'SIGNER_TRANSACTION_MISMATCH',
					sender: B.address,
					address: A.address,
					groupIndex: groups.length - 1,
					transactionIndex: 1,
					message: `Transaction sender ${B.address} does not match signer account ${A.address}.`
				});
				noProviderCalls();
				const valid = [[txn()], [txn()]];
				await call(valid, A);
				onlyProvider('PeraWallet', sending, valid);
			}
		);

		it.each([
			null,
			{},
			{ address: '', app: A.app },
			{ address: A.address, app: '' },
			{ address: 'invalid', app: A.app },
			{ address: 1, app: A.app },
			{ address: A.address, app: 1 }
		])('L7 rejects malformed signer %s', async (signer) => {
			await expect(call([[txn()]], signer)).rejects.toEqual(
				new TypeError('An explicit signer { address, app } is required.')
			);
			noProviderCalls();
		});

		it('L7 rejects connected Watch without its alert adapter', async () => {
			const watch = { ...A, app: 'Watch' };
			connectedWallets.add([watch], { select: false });
			await expect(call([[txn()]], watch)).rejects.toEqual(
				new Error('Watched accounts do not support signing transactions')
			);
			noProviderCalls();
		});

		it.each([[], [[]], [[txn()], []]])(
			'L7 rejects empty transaction groups %s',
			async (...groups) => {
				await expect(call(groups, A)).rejects.toEqual(
					new TypeError('At least one transaction is required.')
				);
				noProviderCalls();
			}
		);

		it('L7 rejects invalid transaction objects before provider dispatch', async () => {
			await expect(call([[{} as algosdk.Transaction]], A)).rejects.toBeInstanceOf(TypeError);
			noProviderCalls();
		});

		it('rejects unknown connected apps after sender validation', async () => {
			const signer = { ...A, app: 'unknown' };
			connectedWallets.add([signer], { select: false });
			await expect(call([[txn()]], signer)).rejects.toEqual(new Error('Wallet not found'));
			noProviderCalls();
		});

		it('validates signer, groups, registry pair, senders, then adapter in order', async () => {
			await expect(call([], undefined)).rejects.toEqual(
				new TypeError('An explicit signer { address, app } is required.')
			);
			const absent = { ...C, app: 'unknown' };
			await expect(call([], absent)).rejects.toEqual(
				new TypeError('At least one transaction is required.')
			);
			await disconnected(call([[txn(B.address)]], absent), absent);
			connectedWallets.add([absent], { select: false });
			await expect(call([[txn(B.address)]], absent)).rejects.toBeInstanceOf(
				signing.SignerTransactionMismatchError
			);
			noProviderCalls();
		});

		it('snapshots signer before awaiting session ownership', async () => {
			const signer = { ...A };
			providers.PeraWallet.getSessionAccounts.mockImplementationOnce(async () => {
				signer.address = B.address;
				signer.app = B.app;
				return [A.address];
			});
			const groups = [[txn()]];
			await call(groups, signer);
			onlyProvider('PeraWallet', sending, groups);
		});

		for (const app of ['BiatecWallet', 'VoiWallet', 'WalletConnect']) {
			it.each(['other owner', 'inactive', 'missing account', 'no accounts'])(
				`L8 ${app} rejects session %s with SignerDisconnectedError without reconnect`,
				async (state) => {
					const signer = { ...A, app };
					connectedWallets.add([signer], { select: false });
					providers.WalletConnect.getSessionOwner.mockResolvedValue(
						state === 'other owner' ? (app === 'VoiWallet' ? 'BiatecWallet' : 'VoiWallet') : app
					);
					providers.WalletConnect.hasActiveSession.mockResolvedValue(state !== 'inactive');
					providers.WalletConnect.getSessionAccounts.mockResolvedValue(
						state === 'no accounts' ? [] : [state === 'missing account' ? B.address : A.address]
					);
					await disconnected(call([[txn()]], signer), signer);
					for (const provider of providerList) {
						expect(provider.connect).not.toHaveBeenCalled();
						expect(provider.signTransactions).not.toHaveBeenCalled();
						expect(provider.signAndSendTransactions).not.toHaveBeenCalled();
					}
					expect(get(selectedWallet)).toEqual(B);
				}
			);

			it(`L8 ${app} signs with matching session owner and account`, async () => {
				const signer = { ...A, app };
				connectedWallets.add([signer], { select: false });
				providers.WalletConnect.getSessionOwner.mockResolvedValue(app);
				const groups = [[txn()]];
				await call(groups, signer);
				onlyProvider('WalletConnect', sending, groups);
			});
		}

		for (const app of ['PeraWallet', 'DeflyWallet'] as const) {
			it.each([[[]], [[B.address]]])(
				`L9 ${app} rejects absent session account with SignerDisconnectedError: %s`,
				async (accounts) => {
					const signer = { ...A, app };
					connectedWallets.add([signer], { select: false });
					providers[app].getSessionAccounts.mockResolvedValue(accounts);
					await disconnected(call([[txn()]], signer), signer);
					for (const provider of providerList) {
						expect(provider.connect).not.toHaveBeenCalled();
						expect(provider.signTransactions).not.toHaveBeenCalled();
						expect(provider.signAndSendTransactions).not.toHaveBeenCalled();
					}
				}
			);
			it(`L9 ${app} signs with matching non-prompting session account`, async () => {
				const signer = { ...A, app };
				connectedWallets.add([signer], { select: false });
				const groups = [[txn()]];
				await call(groups, signer);
				onlyProvider(app, sending, groups);
			});
		}

		for (const app of ['LuteWallet', 'Kibisis'] as const) {
			it(`L10 ${app} routes only the exact captured app`, async () => {
				const signer = { ...A, app };
				connectedWallets.add(
					[signer, { ...A, app: app === 'Kibisis' ? 'LuteWallet' : 'Kibisis' }],
					{ select: false }
				);
				const groups = [[txn()]];
				await call(groups, signer);
				onlyProvider(app, sending, groups);
			});
			it(`L10 ${app} rejects sender mismatch before the provider`, async () => {
				const signer = { ...A, app };
				connectedWallets.add([signer], { select: false });
				await expect(call([[txn(B.address)]], signer)).rejects.toBeInstanceOf(
					signing.SignerTransactionMismatchError
				);
				noProviderCalls();
			});
			it(`L10 ${app} propagates provider refusal without retry or selection change`, async () => {
				const signer = { ...A, app };
				connectedWallets.add([signer], { select: false });
				const refusal = new Error(`${app} refused`);
				providers[app][
					sending ? 'signAndSendTransactions' : 'signTransactions'
				].mockRejectedValueOnce(refusal);
				const groups = [[txn()]];
				await expect(call(groups, signer)).rejects.toBe(refusal);
				onlyProvider(app, sending, groups);
			});
		}
	});
}

it.each([true, false])('L6 third client wins and boolean %s passes through', async (result) => {
	providers.PeraWallet.signAndSendTransactions.mockResolvedValue(result);
	expect(await send([[txn()]], A, explicitClient)).toBe(result);
	expect(providers.PeraWallet.signAndSendTransactions.mock.calls[0][0]).toBe(explicitClient);
	expect(providers.PeraWallet.connect).not.toHaveBeenCalled();
});
it('L6 omitted client uses ProviderStore', async () => {
	await send([[txn()]], A);
	expect(providers.PeraWallet.signAndSendTransactions.mock.calls[0][0]).toBe(client);
});

it('exports the explicit signer capability', () => {
	expect(signing.SIGNER_API_VERSION).toBe(1);
});

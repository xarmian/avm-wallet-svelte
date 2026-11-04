import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import { signTransactions, signAndSendTransactions } from './default-signing.js';
import { SignerDisconnectedError } from './signing.js';
import { createWalletScope, registerScope, unregisterScope } from './state/scope.svelte.js';
import { walletStore } from './state/wallet-store.svelte.js';
import { providerStore } from './state/provider-store.svelte.js';
import { registry } from './adapters/registry.js';
import type { WalletAdapter } from './adapters/types.js';

const account = algosdk.generateAccount();
const signer = { address: account.addr.toString(), walletId: 'pera' as const };
const connected = { ...signer, authenticated: false, isWatch: false };
const otherScopeId = 'default-signing-isolation';
function payment() {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: signer.address,
		receiver: signer.address,
		amount: 0,
		suggestedParams: { fee: 1000, minFee: 1000, flatFee: true, firstValid: 1, lastValid: 100 }
	});
}
function fakeAdapter() {
	return {
		id: 'pera',
		name: 'Pera',
		icon: '',
		supportsAuth: false,
		isWatchOnly: false,
		initialize: vi.fn(),
		connect: vi.fn(),
		disconnect: vi.fn(),
		reconnect: vi.fn(),
		isConnected: vi.fn(() => true),
		signTransactions: vi.fn(async (groups: algosdk.Transaction[][]) =>
			groups.flat().map((txn) => txn.signTxn(account.sk))
		),
		signAndSendTransactions: vi.fn()
	} satisfies WalletAdapter;
}
beforeEach(() => {
	localStorage.clear();
	walletStore.reset();
	// Submission needs an Algod client before account resolution.
	vi.spyOn(providerStore, 'algodClient', 'get').mockReturnValue({} as algosdk.Algodv2);
});
afterEach(() => {
	walletStore.reset();
	unregisterScope(otherScopeId);
	vi.restoreAllMocks();
	localStorage.clear();
});

it('exports both default-scope aliases as functions', () => {
	expect(signTransactions).toBeTypeOf('function');
	expect(signAndSendTransactions).toBeTypeOf('function');
});
for (const [name, sign] of Object.entries({ signTransactions, signAndSendTransactions })) {
	describe(name, () => {
		it('rejects an account connected only in another scope without calling an adapter', async () => {
			const other = createWalletScope(otherScopeId);
			other.walletStore.addAccounts([connected]);
			registerScope(other);
			const adapter = fakeAdapter();
			vi.spyOn(registry, 'getAdapter').mockReturnValue(adapter);
			vi.spyOn(other.registry, 'getAdapter').mockReturnValue(adapter);
			await expect(sign([[payment()]], signer)).rejects.toBeInstanceOf(SignerDisconnectedError);
			expect(adapter.signTransactions).not.toHaveBeenCalled();
			expect(adapter.signAndSendTransactions).not.toHaveBeenCalled();
		});
		it('reaches the default scope adapter for its connected account', async () => {
			walletStore.addAccounts([connected]);
			const adapter = fakeAdapter();
			const reached = new Error('default adapter reached');
			adapter.signTransactions.mockRejectedValueOnce(reached);
			const lookup = vi.spyOn(registry, 'getAdapter').mockReturnValue(adapter);
			await expect(sign([[payment()]], signer, { message: 'Confirm' })).rejects.toBe(reached);
			expect(lookup).toHaveBeenCalledWith('pera');
			expect(adapter.signTransactions).toHaveBeenCalledOnce();
			expect(adapter.signTransactions).toHaveBeenCalledWith(expect.any(Array), {
				message: 'Confirm'
			});
		});
	});
}

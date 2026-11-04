import { beforeEach, expect, it } from 'vitest';
import { createWalletStore } from './wallet-store.svelte.js';
import type { ConnectedAccount } from './types.js';

const account = (
	address: string,
	walletId: ConnectedAccount['walletId'] = 'pera'
): ConnectedAccount => ({
	address,
	walletId,
	authenticated: false,
	isWatch: false
});
beforeEach(() => localStorage.clear());

it('only auto-selects when nothing is selected and preserves a user selection on add', () => {
	const store = createWalletStore('selection-add');
	const a = account('A');
	const b = account('B');
	store.addAccounts([a, b]);
	expect(store.selectedAccount).toEqual(a);
	store.selectAccount(b);
	store.addAccounts([account('C')]);
	expect(store.selectedAccount).toEqual(b);
});

it('restores the persisted selection pair and preserves it on add', () => {
	const accounts = [account('A'), account('A', 'defly')];
	localStorage.setItem(
		'avm-wallet-state-selection-restore',
		JSON.stringify({
			accounts,
			selectedAddress: 'A',
			selectedWalletId: 'defly'
		})
	);
	const store = createWalletStore('selection-restore');
	expect(store.selectedAccount).toEqual(accounts[1]);
	store.addAccounts([account('C')]);
	expect(store.selectedAccount).toEqual(accounts[1]);
});

it('keeps selection when a different address is removed', () => {
	const store = createWalletStore('selection-remove-other');
	const b = account('B');
	store.addAccounts([account('A'), b]);
	store.selectAccount(b);
	store.removeAccount('pera', 'A');
	expect(store.selectedAccount).toEqual(b);
});

it('keeps the selected pair when the same address in another wallet is removed', () => {
	const store = createWalletStore('selection-remove-pair');
	const selected = account('A', 'defly');
	store.addAccounts([account('C'), account('A'), selected]);
	store.selectAccount(selected);
	store.removeAccount('pera', 'A');
	expect(store.selectedAccount).toEqual(selected);
});

it('falls back to the first remaining account, then null, when the selected pair is removed', () => {
	const store = createWalletStore('selection-fallback');
	const a = account('A');
	store.addAccounts([a, account('B', 'defly')]);
	store.selectAccount(store.accounts[1]);
	store.removeAccount('defly');
	expect(store.selectedAccount).toEqual(a);
	store.removeAccount('pera', 'A');
	expect(store.selectedAccount).toBeNull();
});

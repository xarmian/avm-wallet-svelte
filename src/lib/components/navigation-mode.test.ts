import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Algodv2 } from 'algosdk';
import type { ConnectedAccount } from '../state/types.js';
import { createPeraAdapter } from '../adapters/pera.js';
import { createWalletScope, registerScope } from '../state/scope.svelte.js';
import Web3Wallet from './Web3Wallet.svelte';

const x: ConnectedAccount = {
	address: 'XXXXXX1234567890XXXX',
	name: 'Account X',
	walletId: 'pera',
	authenticated: false,
	isWatch: false
};
const y: ConnectedAccount = { ...x, address: 'YYYYYY1234567890YYYY', name: 'Account Y' };
const watch: ConnectedAccount = {
	...x,
	address: 'WWWWWW1234567890WWWW',
	name: 'Watched account',
	walletId: 'watch',
	isWatch: true
};
let id = 0;

beforeEach(() => localStorage.clear());
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function setup(accounts: ConnectedAccount[] = [x, y]) {
	const scope = createWalletScope(`navigation-${++id}`);
	registerScope(scope);
	scope.walletStore.addAccounts(accounts);
	vi.spyOn(scope.providerStore, 'initialize').mockResolvedValue();
	vi.spyOn(scope.registry, 'initialize').mockResolvedValue();
	vi.spyOn(scope.registry, 'reconnectAll').mockResolvedValue(new Map());
	vi.spyOn(scope.registry, 'getWalletInfo').mockReturnValue([
		{ id: 'pera', name: 'Pera', icon: '', isWatchOnly: false, supportsAuth: false },
		{ id: 'watch', name: 'Watch', icon: '', isWatchOnly: true, supportsAuth: false }
	]);
	const onAccountPicked = vi.fn();
	return {
		scope,
		props: { scope: scope.scopeId, algodClient: {} as Algodv2, onAccountPicked }
	};
}

function expectCurrent(row: HTMLElement, current: boolean) {
	expect(row.getAttribute('aria-selected')).toBe(String(current));
	expect(row.classList.contains('account-row--selected')).toBe(current);
	expect(row.getAttribute('aria-current')).toBe(current ? 'true' : null);
}

it('keeps the default trigger, row marking, and select-before-pick order', async () => {
	const { scope, props } = setup([x, y, watch]);
	props.onAccountPicked.mockImplementation((account) => {
		expect(scope.walletStore.selectedAccount).toEqual(account);
	});
	const view = render(Web3Wallet, { props });
	await fireEvent.click(view.getByRole('button', { name: 'Account X' }));
	expect(view.getByRole('option', { selected: true }).textContent).toContain('Account X');
	expect(view.queryByText('Watch only')).toBeNull();
	await fireEvent.click(view.getByRole('button', { name: 'Select account Account Y' }));
	expect(props.onAccountPicked).toHaveBeenCalledTimes(1);
	expect(props.onAccountPicked).toHaveBeenCalledWith(y);
	expect(view.getByRole('button', { name: 'Account Y' })).toBeTruthy();
});

it.each([null, undefined])(
	'ignores store selection with a %s current account in navigation mode',
	async (currentAccount) => {
		const { props } = setup();
		const view = render(Web3Wallet, {
			props: { ...props, accountMode: 'navigation', currentAccount }
		});
		await fireEvent.click(view.getByRole('button', { name: 'Your accounts' }));
		for (const row of view.getAllByRole('option')) expectCurrent(row, false);
	}
);

it.each(['dropdown', 'modal'] as const)(
	'shows and marks the supplied account and names the %s Your accounts',
	async (displayMode) => {
		const { scope, props } = setup();
		const view = render(Web3Wallet, {
			props: { ...props, accountMode: 'navigation', currentAccount: y, displayMode }
		});
		await fireEvent.click(view.getByRole('button', { name: 'Account Y' }));
		expect(view.getByRole('dialog', { name: 'Your accounts' })).toBeTruthy();
		expect(view.getByRole('listbox', { name: 'Your accounts' })).toBeTruthy();
		if (displayMode === 'modal') {
			expect(view.getByRole('heading', { name: 'Your accounts' })).toBeTruthy();
		}
		const rows = view.getAllByRole('option');
		expectCurrent(rows[0], false);
		expectCurrent(rows[1], true);
		expect(scope.walletStore.selectedAccount).toEqual(x);
	}
);

it('matches both wallet and address and reacts when the current account changes', async () => {
	const sameAddress: ConnectedAccount = { ...y, walletId: 'defly', name: 'Account Y via Defly' };
	const { props } = setup([x, y, sameAddress]);
	const view = render(Web3Wallet, {
		props: { ...props, accountMode: 'navigation', currentAccount: sameAddress }
	});
	await fireEvent.click(view.getByRole('button', { name: sameAddress.name }));
	const rows = view.getAllByRole('option');
	expectCurrent(rows[0], false);
	expectCurrent(rows[1], false);
	expectCurrent(rows[2], true);
	await view.rerender({ currentAccount: { address: y.address, walletId: y.walletId } });
	expectCurrent(rows[1], true);
	expectCurrent(rows[2], false);
	await view.rerender({ currentAccount: { address: y.address, walletId: 'lute' } });
	expect(view.getByRole('button', { name: 'Your accounts' })).toBeTruthy();
	for (const row of rows) expectCurrent(row, false);
});

it('uses a connected short address and falls back after the current entry is removed', async () => {
	const unnamed = { ...y, name: undefined };
	const { scope, props } = setup([x, unnamed]);
	const view = render(Web3Wallet, {
		props: { ...props, accountMode: 'navigation', currentAccount: unnamed }
	});
	expect(view.getByRole('button', { name: 'YYYYYY...YYYY' })).toBeTruthy();
	scope.walletStore.removeAccount(y.walletId, y.address);
	await tick();
	expect(view.getByRole('button', { name: 'Your accounts' })).toBeTruthy();
	expect(props.onAccountPicked).not.toHaveBeenCalled();
});

it.each(['dropdown', 'modal'] as const)(
	'emits one row pick without selecting in the %s',
	async (displayMode) => {
		const { scope, props } = setup();
		const select = vi.spyOn(scope.walletStore, 'selectAccount');
		props.onAccountPicked.mockImplementation(() => {
			expect(scope.walletStore.selectedAccount).toEqual(x);
		});
		const view = render(Web3Wallet, {
			props: { ...props, accountMode: 'navigation', currentAccount: y, displayMode }
		});
		await fireEvent.click(view.getByRole('button', { name: 'Account Y' }));
		await fireEvent.click(view.getByRole('button', { name: 'Select account Account Y' }));
		expect(props.onAccountPicked).toHaveBeenCalledTimes(1);
		expect(props.onAccountPicked).toHaveBeenCalledWith(y);
		expect(select).not.toHaveBeenCalled();
		expect(scope.walletStore.selectedAccount).toEqual(x);
		expect(view.queryByRole('dialog')).toBeNull();
	}
);

it('labels a watch-only row and allows picking it as a navigation target', async () => {
	const { scope, props } = setup([x, watch]);
	const view = render(Web3Wallet, {
		props: { ...props, accountMode: 'navigation', currentAccount: watch }
	});
	await fireEvent.click(view.getByRole('button', { name: watch.name }));
	const row = view.getAllByRole('option')[1];
	expect(within(row).getByText('Watch only')).toBeTruthy();
	expectCurrent(row, true);
	await fireEvent.click(within(row).getByRole('button'));
	expect(props.onAccountPicked).toHaveBeenCalledTimes(1);
	expect(props.onAccountPicked).toHaveBeenCalledWith(watch);
	expect(scope.walletStore.selectedAccount).toEqual(x);
});

it.each(['dropdown', 'modal'] as const)(
	'emits the first Add Account result without selecting it in the %s',
	async (displayMode) => {
		const { scope, props } = setup();
		const select = vi.spyOn(scope.walletStore, 'selectAccount');
		const connect = vi.fn().mockResolvedValue([
			{ address: 'NEW', name: 'New account' },
			{ address: 'SECOND', name: 'Second account' }
		]);
		const adapter = createPeraAdapter();
		vi.spyOn(adapter, 'connect').mockImplementation(connect);
		vi.spyOn(scope.registry, 'getAdapter').mockReturnValue(adapter);
		const view = render(Web3Wallet, {
			props: { ...props, accountMode: 'navigation', currentAccount: y, displayMode }
		});
		await fireEvent.click(view.getByRole('button', { name: 'Account Y' }));
		await fireEvent.click(view.getByRole('button', { name: 'Add Account' }));
		await fireEvent.click(view.getByRole('button', { name: /Pera/ }));
		await waitFor(() => expect(props.onAccountPicked).toHaveBeenCalledTimes(1));
		expect(props.onAccountPicked).toHaveBeenCalledWith({
			...x,
			address: 'NEW',
			name: 'New account',
			networkId: ''
		});
		expect(connect).toHaveBeenCalledTimes(1);
		expect(select).not.toHaveBeenCalled();
		expect(scope.walletStore.selectedAccount).toEqual(x);
		expect(scope.walletStore.accounts).toHaveLength(4);
	}
);

it('keeps Add Account available when empty and allows the store to auto-select on add', async () => {
	const { scope, props } = setup([]);
	const select = vi.spyOn(scope.walletStore, 'selectAccount');
	const adapter = createPeraAdapter();
	vi.spyOn(adapter, 'connect').mockResolvedValue([{ address: y.address, name: y.name }]);
	vi.spyOn(scope.registry, 'getAdapter').mockReturnValue(adapter);
	const view = render(Web3Wallet, { props: { ...props, accountMode: 'navigation' } });
	await fireEvent.click(view.getByRole('button', { name: 'Your accounts' }));
	expect(view.getByText('No accounts connected')).toBeTruthy();
	await fireEvent.click(view.getByRole('button', { name: 'Add Account' }));
	await fireEvent.click(view.getByRole('button', { name: /Pera/ }));
	await waitFor(() => expect(props.onAccountPicked).toHaveBeenCalledTimes(1));
	expect(select).not.toHaveBeenCalled();
	expect(scope.walletStore.selectedAccount).toMatchObject(y);
	expect(view.getByRole('button', { name: 'Your accounts' })).toBeTruthy();
});

it('keeps restored sessions and passive add, selection, and removal silent', async () => {
	const { scope, props } = setup([]);
	vi.mocked(scope.registry.reconnectAll).mockResolvedValue(
		new Map([['pera', [{ address: x.address, name: x.name }]]])
	);
	const view = render(Web3Wallet, { props: { ...props, accountMode: 'navigation' } });
	await waitFor(() => expect(scope.walletStore.initialized).toBe(true));
	expect(scope.walletStore.selectedAccount).toMatchObject(x);
	scope.walletStore.addAccounts([y]);
	await tick();
	scope.walletStore.selectAccount(y);
	await tick();
	scope.walletStore.removeAccount(y.walletId, y.address);
	await tick();
	expect(scope.walletStore.selectedAccount).toMatchObject(x);
	scope.walletStore.removeAccount(x.walletId, x.address);
	scope.walletStore.addAccounts([watch]);
	await tick();
	expect(scope.walletStore.selectedAccount).toEqual(watch);
	expect(props.onAccountPicked).not.toHaveBeenCalled();
	expect(view.getByRole('button', { name: 'Your accounts' })).toBeTruthy();
});

it('does not emit a pick when a saved selection is restored', async () => {
	const scopeId = `navigation-${id + 1}`;
	localStorage.setItem(
		`avm-wallet-state-${scopeId}`,
		JSON.stringify({ accounts: [x], selectedAddress: x.address, selectedWalletId: x.walletId })
	);
	const { scope, props } = setup([]);
	render(Web3Wallet, { props: { ...props, accountMode: 'navigation' } });
	await waitFor(() => expect(scope.walletStore.initialized).toBe(true));
	expect(scope.walletStore.selectedAccount).toEqual(x);
	expect(props.onAccountPicked).not.toHaveBeenCalled();
});

it('keeps row buttons focusable for keyboard activation and closes on Escape', async () => {
	const { scope, props } = setup();
	const view = render(Web3Wallet, {
		props: { ...props, accountMode: 'navigation', currentAccount: y }
	});
	await fireEvent.click(view.getByRole('button', { name: 'Account Y' }));
	const button = view.getByRole('button', { name: 'Select account Account Y' });
	button.focus();
	expect(document.activeElement).toBe(button);
	expect(button.tabIndex).toBe(0);
	// Native buttons dispatch a click with detail 0 for keyboard activation.
	await fireEvent.click(button, { detail: 0 });
	expect(props.onAccountPicked).toHaveBeenCalledTimes(1);
	expect(props.onAccountPicked).toHaveBeenCalledWith(y);
	expect(scope.walletStore.selectedAccount).toEqual(x);
	await fireEvent.click(view.getByRole('button', { name: 'Account Y' }));
	await fireEvent.keyDown(window, { key: 'Escape' });
	expect(view.queryByRole('dialog')).toBeNull();
	expect(props.onAccountPicked).toHaveBeenCalledTimes(1);
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AccountSelector from './AccountSelector.svelte';
import AddAccountView from './AddAccountView.svelte';
import Web3Wallet from './Web3Wallet.svelte';
import { createWalletScope, SCOPE_CONTEXT_KEY } from '../state/scope.svelte.js';
import type { ConnectedAccount } from '../state/types.js';
import type { Algodv2 } from 'algosdk';
import type { WalletAccount, WalletAdapter } from '../adapters/types.js';

const a: ConnectedAccount = {
	address: 'A',
	name: 'Account A',
	walletId: 'pera',
	authenticated: false,
	isWatch: false
};
const b: ConnectedAccount = { ...a, address: 'B', name: 'Account B' };
let id = 0;
beforeEach(() => localStorage.clear());
afterEach(cleanup);
function setup() {
	const scope = createWalletScope(`pick-${++id}`);
	vi.spyOn(scope.registry, 'getWalletInfo').mockReturnValue([
		{ id: 'pera', name: 'Pera', icon: '', isWatchOnly: false, supportsAuth: false }
	]);
	return { scope, context: new Map([[SCOPE_CONTEXT_KEY, scope]]), onAccountPicked: vi.fn() };
}

function fakeAdapter(accounts: WalletAccount[]) {
	return {
		id: 'pera',
		name: 'Pera',
		icon: '',
		supportsAuth: false,
		isWatchOnly: false,
		initialize: vi.fn().mockResolvedValue(undefined),
		connect: vi.fn().mockResolvedValue(accounts),
		disconnect: vi.fn().mockResolvedValue(undefined),
		reconnect: vi.fn().mockResolvedValue(null),
		isConnected: vi.fn(() => true),
		signTransactions: vi.fn().mockResolvedValue([]),
		signAndSendTransactions: vi.fn().mockResolvedValue({ txIds: [], confirmedRound: 0n })
	} satisfies WalletAdapter;
}

it('fires once immediately after an account row is selected', async () => {
	const { scope, context, onAccountPicked } = setup();
	scope.walletStore.addAccounts([a, b]);
	onAccountPicked.mockImplementation((account) =>
		expect(scope.walletStore.selectedAccount).toEqual(account)
	);
	const onClose = vi.fn();
	const view = render(AccountSelector, { context, props: { onAccountPicked, onClose } });
	await fireEvent.click(view.getByRole('button', { name: 'Select account Account B' }));
	expect(onAccountPicked).toHaveBeenCalledTimes(1);
	expect(onAccountPicked).toHaveBeenCalledWith(b);
	expect(onClose).toHaveBeenCalledTimes(1);
});

it('does not fire for auto-selection, programmatic selection, or removal', async () => {
	const { scope, context, onAccountPicked } = setup();
	render(AccountSelector, { context, props: { onAccountPicked } });
	scope.walletStore.addAccounts([a, b]);
	await tick();
	scope.walletStore.selectAccount(b);
	await tick();
	scope.walletStore.removeAccount('pera', 'B');
	await tick();
	expect(onAccountPicked).not.toHaveBeenCalled();
});

it('does not fire for a restored selection', async () => {
	const scopeId = `pick-restored-${++id}`;
	localStorage.setItem(
		`avm-wallet-state-${scopeId}`,
		JSON.stringify({
			accounts: [a],
			selectedAddress: a.address,
			selectedWalletId: a.walletId
		})
	);
	const scope = createWalletScope(scopeId);
	const onAccountPicked = vi.fn();
	render(AccountSelector, {
		context: new Map([[SCOPE_CONTEXT_KEY, scope]]),
		props: { onAccountPicked }
	});
	await tick();
	expect(scope.walletStore.selectedAccount).toEqual(a);
	expect(onAccountPicked).not.toHaveBeenCalled();
});

it('fires once with the first connected account after connecting', async () => {
	const { scope, context, onAccountPicked } = setup();
	const adapter = fakeAdapter([
		{ address: a.address, name: a.name },
		{ address: b.address, name: b.name }
	]);
	vi.spyOn(scope.registry, 'getAdapter').mockReturnValue(adapter);
	onAccountPicked.mockImplementation((account) =>
		expect(scope.walletStore.selectedAccount).toEqual(account)
	);
	const view = render(AddAccountView, { context, props: { onAccountPicked } });
	await fireEvent.click(view.getByRole('button', { name: /Pera/ }));
	await waitFor(() => expect(onAccountPicked).toHaveBeenCalledTimes(1));
	expect(onAccountPicked).toHaveBeenCalledWith({ ...a, networkId: '' });
	expect(adapter.connect).toHaveBeenCalledTimes(1);
});

it.each(['dropdown', 'modal'] as const)(
	'passes the pick signal through both %s views',
	async (displayMode) => {
		const { scope, onAccountPicked } = setup();
		// Register the scope so Web3Wallet uses these stores and adapters.
		const { registerScope } = await import('../state/scope.svelte.js');
		registerScope(scope);
		vi.spyOn(scope.providerStore, 'initialize').mockResolvedValue();
		vi.spyOn(scope.registry, 'initialize').mockResolvedValue();
		vi.spyOn(scope.registry, 'reconnectAll').mockResolvedValue(new Map());
		vi.spyOn(scope.registry, 'getAdapter').mockReturnValue(
			fakeAdapter([{ address: 'C', name: 'Account C' }])
		);
		scope.walletStore.addAccounts([a, b]);
		const view = render(Web3Wallet, {
			props: { scope: scope.scopeId, algodClient: {} as Algodv2, displayMode, onAccountPicked }
		});
		await fireEvent.click(view.getByRole('button', { name: /Account A/ }));
		await fireEvent.click(view.getByRole('button', { name: 'Select account Account B' }));
		expect(onAccountPicked).toHaveBeenCalledTimes(1);
		expect(onAccountPicked).toHaveBeenCalledWith(b);
		await fireEvent.click(view.getByRole('button', { name: /Account B/ }));
		await fireEvent.click(view.getByRole('button', { name: /Add Account/i }));
		await fireEvent.click(view.getByRole('button', { name: /Pera/ }));
		await waitFor(() => expect(onAccountPicked).toHaveBeenCalledTimes(2));
		expect(onAccountPicked.mock.calls[1][0]).toMatchObject({ address: 'C', walletId: 'pera' });
	}
);

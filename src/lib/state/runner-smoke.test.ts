import { expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { createWalletStore } from './wallet-store.svelte.js';
import { SCOPE_CONTEXT_KEY } from './scope.svelte.js';
import AccountRow from '../components/AccountRow.svelte';

it('runs a rune store under jsdom', () => {
	const store = createWalletStore('smoke');
	store.addAccounts([
		{ address: 'A', walletId: 'pera', authenticated: false, isWatch: false },
		{ address: 'B', walletId: 'pera', authenticated: false, isWatch: false }
	]);
	expect(store.selectedAccount?.address).toBe('A');
});

it('renders a svelte component with a scope context', () => {
	const scope = { registry: { getWalletInfo: () => [], getAdapter: () => undefined } };
	const { container } = render(AccountRow, {
		props: {
			account: { address: 'ADDR', walletId: 'pera', authenticated: false, isWatch: false },
			isSelected: false,
			onSelect: () => {}
		},
		context: new Map([[SCOPE_CONTEXT_KEY, scope]])
	});
	expect(container.querySelector('button')).not.toBeNull();
});

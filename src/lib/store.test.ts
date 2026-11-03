// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { connectedWallets, selectedWallet, setOnSelectHandler, pickWallet } from './store.js';

const A = { address: 'AAAA', app: 'WalletConnect' };
const B = { address: 'BBBB', app: 'WalletConnect' };
const C = { address: 'CCCC', app: 'WalletConnect' };

beforeEach(() => {
	setOnSelectHandler(() => {});
	connectedWallets.reset();
	selectedWallet.reset();
	localStorage.clear();
});

describe('connectedWallets.add', () => {
	it('selects the first added wallet on a user connect (default, unchanged)', () => {
		connectedWallets.add([A, B]);
		expect(get(selectedWallet)).toEqual(A);
	});

	it('restore (select: false) keeps a user-made selection that is still in the list', () => {
		connectedWallets.add([A, B, C]);
		selectedWallet.set(C);
		connectedWallets.add([A, B, C], { select: false });
		expect(get(selectedWallet)).toEqual(C);
	});

	it('restore falls back to the first restored wallet only when the selection is not in the list', () => {
		selectedWallet.set({ address: 'ZZZZ', app: 'Pera' });
		connectedWallets.add([A, B], { select: false });
		expect(get(selectedWallet)).toEqual(A);
	});

	it('restore with no prior selection selects the first restored wallet', () => {
		connectedWallets.add([A, B], { select: false });
		expect(get(selectedWallet)).toEqual(A);
	});
});

describe('connectedWallets.set', () => {
	it('keeps a user-made selection that is still in the new list', () => {
		connectedWallets.add([A, B, C]);
		selectedWallet.set(B);
		connectedWallets.set([A, B, C]);
		expect(get(selectedWallet)).toEqual(B);
	});

	it('falls back to the first only when the selection is not in the new list', () => {
		connectedWallets.add([A, B, C]);
		selectedWallet.set(B);
		connectedWallets.set([A, C]);
		expect(get(selectedWallet)).toEqual(A);
	});
});

describe('select handler (pick event)', () => {
	it('fires for a user connect with the wallet that became selected', () => {
		const handler = vi.fn();
		setOnSelectHandler(handler);
		connectedWallets.add([A, B]);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(A);
	});

	it('does not fire for a restore', () => {
		const handler = vi.fn();
		setOnSelectHandler(handler);
		connectedWallets.add([A, B], { select: false });
		expect(handler).not.toHaveBeenCalled();
	});

	it('does not fire for set(), remove() or update() writes', () => {
		connectedWallets.add([A, B, C], { select: false });
		const handler = vi.fn();
		setOnSelectHandler(handler);
		connectedWallets.set([A, B, C]);
		connectedWallets.remove('WalletConnect', A.address);
		connectedWallets.update((w) => w);
		expect(handler).not.toHaveBeenCalled();
	});

	it('fires for a picker pick (pickWallet) and selects that wallet', () => {
		connectedWallets.add([A, B, C], { select: false });
		const handler = vi.fn();
		setOnSelectHandler(handler);
		pickWallet(B);
		expect(get(selectedWallet)).toEqual(B);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(B);
	});

	it('does not fire for a plain selectedWallet.set (the library write path)', () => {
		const handler = vi.fn();
		setOnSelectHandler(handler);
		selectedWallet.set(B);
		expect(handler).not.toHaveBeenCalled();
	});
});

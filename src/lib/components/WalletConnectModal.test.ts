import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import WalletConnectModal from './WalletConnectModal.svelte';
import { createWalletScope, SCOPE_CONTEXT_KEY } from '../state/scope.svelte.js';

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));

const URI = 'wc:0123abcd@2?relay-protocol=irn&symKey=ff00';
let id = 0;

function setup() {
	const scope = createWalletScope(`wc-modal-${++id}`);
	const context = new Map([[SCOPE_CONTEXT_KEY, scope]]);
	return { scope, view: render(WalletConnectModal, { context }) };
}

beforeEach(() => {
	vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it('offers an Open in wallet button that opens the connection URI in this window', async () => {
	const { scope, view } = setup();
	scope.uiStore.showWalletConnectModal(URI, 'Voi Wallet');
	await tick();

	await fireEvent.click(view.getByRole('button', { name: 'Open in wallet' }));

	expect(window.open).toHaveBeenCalledTimes(1);
	expect(window.open).toHaveBeenCalledWith(URI, '_self');
});

it('keeps the QR code and copy link beside the Open button', async () => {
	const { scope, view } = setup();
	scope.uiStore.showWalletConnectModal(URI, 'Voi Wallet');
	await tick();

	expect(view.container.querySelector('canvas')).not.toBeNull();
	expect(view.getByRole('button', { name: 'Copy connection URI' })).toBeTruthy();
	expect(view.getByRole('button', { name: 'Open in wallet' })).toBeTruthy();
});

it('shows no Open button while the modal is closed', async () => {
	const { view } = setup();
	expect(view.queryByRole('button', { name: 'Open in wallet' })).toBeNull();
});

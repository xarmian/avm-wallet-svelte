import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import type { Algodv2 } from 'algosdk';
import Web3Wallet from './Web3Wallet.svelte';
import { createWalletScope, registerScope } from '../state/scope.svelte.js';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

let scopeId = 0;
function setup() {
	const scope = createWalletScope(`dropdown-alignment-${++scopeId}`);
	registerScope(scope);
	vi.spyOn(scope.providerStore, 'initialize').mockResolvedValue();
	vi.spyOn(scope.registry, 'initialize').mockResolvedValue();
	vi.spyOn(scope.registry, 'reconnectAll').mockResolvedValue(new Map());
	return { scope: scope.scopeId, algodClient: {} as Algodv2 };
}

it('measures after opening, aligns at the right edge, and remeasures on reopening', async () => {
	const props = setup();
	let left = window.innerWidth - 180;
	const measure = vi
		.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
		.mockImplementation(function (this: HTMLElement) {
			return {
				left,
				right: left + 180,
				width: this.classList.contains('avm-wallet__dropdown') ? 280 : 180,
				top: 0,
				bottom: 40,
				height: 40,
				x: left,
				y: 0,
				toJSON: () => ({})
			};
		});
	const view = render(Web3Wallet, { props });
	expect(measure).not.toHaveBeenCalled();
	const trigger = view.getByRole('button', { name: /Select Account/ });
	await fireEvent.click(trigger);
	expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(true);
	await fireEvent.click(trigger);
	left = 16;
	await fireEvent.click(trigger);
	expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(false);
});

it.each(['start', 'end'] as const)(
	'honors explicit %s alignment without measuring',
	async (dropdownAlign) => {
		const props = setup();
		const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
		const view = render(Web3Wallet, { props: { ...props, dropdownAlign } });
		await fireEvent.click(view.getByRole('button', { name: /Select Account/ }));
		expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown')).toBe(true);
		expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(
			dropdownAlign === 'end'
		);
		expect(measure).not.toHaveBeenCalled();
	}
);

function rect(left: number, width: number) {
	return {
		left,
		right: left + width,
		width,
		top: 0,
		bottom: 40,
		height: 40,
		x: left,
		y: 0,
		toJSON: () => ({})
	};
}

it('decides by the container the panel is positioned against, not the first child', async () => {
	const props = setup();
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
		this: HTMLElement
	) {
		if (this.classList.contains('avm-wallet__dropdown')) return rect(0, 280);
		// The container sits at the right edge; its first child (a hidden or offset element) reports far left.
		if (this.classList.contains('avm-wallet')) return rect(window.innerWidth - 180, 180);
		return rect(16, 180);
	});
	const view = render(Web3Wallet, { props });
	await fireEvent.click(view.getByRole('button', { name: /Select Account/ }));
	expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(true);
});

it('re-measures when the window is resized while the dropdown is open', async () => {
	const props = setup();
	let left = 16;
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
		this: HTMLElement
	) {
		return rect(left, this.classList.contains('avm-wallet__dropdown') ? 280 : 180);
	});
	const view = render(Web3Wallet, { props });
	await fireEvent.click(view.getByRole('button', { name: /Select Account/ }));
	expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(false);
	// The layout narrows: the trigger now sits at the right edge.
	left = window.innerWidth - 180;
	await fireEvent(window, new Event('resize'));
	expect(view.getByRole('dialog').classList.contains('avm-wallet__dropdown--end')).toBe(true);
});

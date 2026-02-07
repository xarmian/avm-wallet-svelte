<script lang="ts">
	import type { WalletId } from '../adapters/types.js';
	import type { WalletInfo } from '../adapters/registry.js';

	import { getContext } from 'svelte';
	import { SCOPE_CONTEXT_KEY, type WalletScope } from '../state/scope.svelte.js';

	import WalletProviderRow from './WalletProviderRow.svelte';

	const { walletStore, providerStore, registry } = getContext<WalletScope>(SCOPE_CONTEXT_KEY);

	interface Props {
		autoSignIn?: boolean;
		onBack?: () => void;
		onClose?: () => void;
	}

	let { autoSignIn = false, onBack, onClose }: Props = $props();

	// Get available wallets from registry
	const wallets = $derived(registry.getWalletInfo());

	// Track connection state per wallet
	let connectingWallet = $state<WalletId | null>(null);
	let walletErrors = $state<Partial<Record<WalletId, string>>>({});

	function handleBack() {
		onBack?.();
	}

	async function handleConnect(wallet: WalletInfo) {
		if (connectingWallet) return;

		connectingWallet = wallet.id;
		walletErrors = { ...walletErrors, [wallet.id]: '' };

		try {
			const adapter = registry.getAdapter(wallet.id);
			if (!adapter) {
				throw new Error(`Wallet adapter not found: ${wallet.id}`);
			}

			// Connect to wallet
			const accounts = await adapter.connect();

			if (accounts.length === 0) {
				throw new Error('No accounts returned from wallet');
			}

			// Convert to connected accounts
			const connectedAccounts = accounts.map((a) => ({
				address: a.address,
				walletId: wallet.id,
				authenticated: false,
				name: a.name,
				isWatch: wallet.isWatchOnly,
				networkId: providerStore.genesisId
			}));

			// Add accounts to store
			walletStore.addAccounts(connectedAccounts);

			// Auto sign-in if enabled and wallet supports it
			if (autoSignIn && adapter.authenticate && !wallet.isWatchOnly) {
				try {
					// Sign in the first account
					const firstAccount = connectedAccounts[0];
					const token = await adapter.authenticate(firstAccount.address);
					walletStore.setAuthenticated(wallet.id, firstAccount.address, token);
				} catch (signInError) {
					// Sign-in failed, but account is still connected
					console.debug('Auto sign-in failed:', signInError);
				}
			}

			// Select the first new account
			walletStore.selectAccount(connectedAccounts[0]);

			// Close the dropdown (account is selected)
			onClose?.();
		} catch (error) {
			console.error(`Failed to connect to ${wallet.name}:`, error);
			walletErrors = {
				...walletErrors,
				[wallet.id]: error instanceof Error ? error.message : 'Connection failed'
			};
		} finally {
			connectingWallet = null;
		}
	}
</script>

<div class="add-account">
	<header class="add-account__header">
		<button
			type="button"
			class="add-account__back"
			onclick={handleBack}
			aria-label="Back to account selector"
		>
			<svg viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
		<h2 class="add-account__title">Add Account</h2>
	</header>

	<div class="add-account__list">
		{#each wallets as wallet (wallet.id)}
			<WalletProviderRow
				{wallet}
				connecting={connectingWallet === wallet.id}
				error={walletErrors[wallet.id] || null}
				onConnect={() => handleConnect(wallet)}
			/>
		{/each}

		{#if wallets.length === 0}
			<div class="add-account__empty">
				<p>No wallets available</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.add-account {
		display: flex;
		flex-direction: column;
	}

	.add-account__header {
		display: flex;
		align-items: center;
		gap: var(--avm-spacing-sm);
		padding: var(--avm-spacing-sm) var(--avm-spacing-md);
		border-bottom: 1px solid rgb(var(--avm-border-color));
	}

	.add-account__back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--avm-radius-sm);
		color: rgb(var(--avm-text-secondary));
		cursor: pointer;
		transition: all var(--avm-transition-fast);
	}

	.add-account__back:hover {
		background-color: rgb(var(--avm-bg-hover));
		color: rgb(var(--avm-text-primary));
	}

	.add-account__back svg {
		width: 16px;
		height: 16px;
	}

	.add-account__title {
		margin: 0;
		font-size: var(--avm-font-size-sm);
		font-weight: var(--avm-font-weight-semibold);
		color: rgb(var(--avm-text-primary));
	}

	.add-account__list {
		display: flex;
		flex-direction: column;
		padding: var(--avm-spacing-xs);
		max-height: 320px;
		overflow-y: auto;
	}

	.add-account__empty {
		padding: var(--avm-spacing-xl);
		text-align: center;
		color: rgb(var(--avm-text-tertiary));
		font-size: var(--avm-font-size-sm);
	}

	.add-account__empty p {
		margin: 0;
	}
</style>

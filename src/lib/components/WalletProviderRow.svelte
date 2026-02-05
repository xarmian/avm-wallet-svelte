<script lang="ts">
	import type { WalletInfo } from '../adapters/registry.js';

	interface Props {
		wallet: WalletInfo;
		connecting?: boolean;
		error?: string | null;
		onConnect: () => void;
	}

	let { wallet, connecting = false, error = null, onConnect }: Props = $props();
</script>

<button
	type="button"
	class="wallet-provider"
	class:wallet-provider--connecting={connecting}
	class:wallet-provider--error={!!error}
	onclick={onConnect}
	disabled={connecting}
>
	<span class="wallet-provider__icon">
		<img src={wallet.icon} alt="" width="32" height="32" />
	</span>

	<span class="wallet-provider__info">
		<span class="wallet-provider__name">{wallet.name}</span>
		{#if error}
			<span class="wallet-provider__error">{error}</span>
		{:else if connecting}
			<span class="wallet-provider__status">Connecting...</span>
		{/if}
	</span>

	<span class="wallet-provider__arrow">
		{#if connecting}
			<svg class="wallet-provider__spinner" viewBox="0 0 24 24" fill="none">
				<circle
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray="31.4 31.4"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
					clip-rule="evenodd"
				/>
			</svg>
		{/if}
	</span>
</button>

<style>
	.wallet-provider {
		display: flex;
		align-items: center;
		gap: var(--avm-spacing-sm);
		width: 100%;
		padding: var(--avm-spacing-sm) var(--avm-spacing-md);
		background: none;
		border: none;
		border-radius: var(--avm-radius-md);
		cursor: pointer;
		text-align: left;
		transition: background-color var(--avm-transition-fast);
	}

	.wallet-provider:hover:not(:disabled) {
		background-color: rgb(var(--avm-bg-hover));
	}

	.wallet-provider:disabled {
		cursor: wait;
	}

	.wallet-provider--connecting {
		opacity: 0.8;
	}

	.wallet-provider__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	.wallet-provider__icon img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: var(--avm-radius-sm);
	}

	.wallet-provider__info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.wallet-provider__name {
		font-size: var(--avm-font-size-sm);
		font-weight: var(--avm-font-weight-medium);
		color: rgb(var(--avm-text-primary));
	}

	.wallet-provider__status {
		font-size: 11px;
		color: rgb(var(--avm-text-tertiary));
	}

	.wallet-provider__error {
		font-size: 11px;
		color: rgb(var(--avm-color-error));
	}

	.wallet-provider__arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: rgb(var(--avm-text-tertiary));
	}

	.wallet-provider__arrow svg {
		width: 16px;
		height: 16px;
	}

	.wallet-provider__spinner {
		animation: spin 1s linear infinite;
		color: rgb(var(--avm-color-primary));
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>

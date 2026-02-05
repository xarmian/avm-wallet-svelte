<script lang="ts">
	import type { ConnectedAccount } from '../state/types.js';

	import { registry } from '../adapters/index.js';

	interface Props {
		account: ConnectedAccount;
		isSelected: boolean;
		showSignInStatus?: boolean;
		showSignInButton?: boolean;
		onSelect: () => void;
		onSignIn?: () => void;
		onSignOut?: () => void;
		signingIn?: boolean;
	}

	let {
		account,
		isSelected,
		showSignInStatus = false,
		showSignInButton = false,
		onSelect,
		onSignIn,
		onSignOut,
		signingIn = false
	}: Props = $props();

	// Get wallet info for the icon
	const walletInfo = $derived(registry.getWalletInfo().find((w) => w.id === account.walletId));

	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

<div
	class="account-row"
	class:account-row--selected={isSelected}
	role="option"
	aria-selected={isSelected}
>
	<button
		type="button"
		class="account-row__select"
		onclick={onSelect}
		aria-label={`Select account ${account.name || formatAddress(account.address)}`}
	>
		<!-- Radio indicator -->
		<span class="account-row__radio" class:account-row__radio--checked={isSelected}>
			{#if isSelected}
				<span class="account-row__radio-dot"></span>
			{/if}
		</span>

		<!-- Account info -->
		<span class="account-row__info">
			<span class="account-row__address">
				{account.name || formatAddress(account.address)}
			</span>
			{#if showSignInStatus && !account.isWatch}
				<span
					class="account-row__status"
					class:account-row__status--signed-in={account.authenticated}
				>
					{account.authenticated ? 'Signed in' : 'Not signed in'}
				</span>
			{/if}
		</span>

		<!-- Wallet badge -->
		<span class="account-row__wallet">
			{#if walletInfo?.icon}
				<img src={walletInfo.icon} alt="" class="account-row__wallet-icon" width="16" height="16" />
			{/if}
		</span>
	</button>

	<!-- Sign in/out button -->
	{#if showSignInButton && !account.isWatch}
		<div class="account-row__actions">
			{#if account.authenticated}
				<button
					type="button"
					class="account-row__action account-row__action--signout"
					onclick={onSignOut}
				>
					Sign out
				</button>
			{:else}
				<button
					type="button"
					class="account-row__action account-row__action--signin"
					onclick={onSignIn}
					disabled={signingIn}
				>
					{signingIn ? '...' : 'Sign in'}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.account-row {
		display: flex;
		align-items: center;
		gap: var(--avm-spacing-xs);
		padding: var(--avm-spacing-xs);
		border-radius: var(--avm-radius-md);
		transition: background-color var(--avm-transition-fast);
	}

	.account-row:hover {
		background-color: rgb(var(--avm-bg-hover));
	}

	.account-row--selected {
		background-color: rgb(var(--avm-color-primary) / 0.08);
	}

	.account-row--selected:hover {
		background-color: rgb(var(--avm-color-primary) / 0.12);
	}

	.account-row__select {
		display: flex;
		align-items: center;
		gap: var(--avm-spacing-sm);
		flex: 1;
		min-width: 0;
		padding: var(--avm-spacing-sm);
		background: none;
		border: none;
		border-radius: var(--avm-radius-sm);
		cursor: pointer;
		text-align: left;
	}

	.account-row__radio {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border: 1.5px solid rgb(var(--avm-border-color));
		border-radius: 50%;
		flex-shrink: 0;
		transition: all var(--avm-transition-fast);
	}

	.account-row__radio--checked {
		border-color: rgb(var(--avm-color-primary));
		background-color: rgb(var(--avm-color-primary));
	}

	.account-row__radio-dot {
		width: 6px;
		height: 6px;
		background-color: white;
		border-radius: 50%;
	}

	.account-row__info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		gap: 2px;
	}

	.account-row__address {
		font-family: var(--avm-font-mono);
		font-size: var(--avm-font-size-sm);
		font-weight: var(--avm-font-weight-medium);
		color: rgb(var(--avm-text-primary));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-row__status {
		font-size: 11px;
		color: rgb(var(--avm-text-tertiary));
	}

	.account-row__status--signed-in {
		color: rgb(var(--avm-color-success));
	}

	.account-row__wallet {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.account-row__wallet-icon {
		width: 16px;
		height: 16px;
		object-fit: contain;
		opacity: 0.6;
	}

	.account-row__actions {
		flex-shrink: 0;
		padding-right: var(--avm-spacing-xs);
	}

	.account-row__action {
		padding: 4px 8px;
		font-size: 11px;
		font-weight: var(--avm-font-weight-medium);
		border: none;
		border-radius: var(--avm-radius-sm);
		cursor: pointer;
		transition: all var(--avm-transition-fast);
	}

	.account-row__action--signin {
		background-color: rgb(var(--avm-color-primary));
		color: white;
	}

	.account-row__action--signin:hover:not(:disabled) {
		background-color: rgb(var(--avm-color-primary-hover));
	}

	.account-row__action--signin:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.account-row__action--signout {
		background-color: transparent;
		color: rgb(var(--avm-text-secondary));
	}

	.account-row__action--signout:hover {
		background-color: rgb(var(--avm-bg-hover));
		color: rgb(var(--avm-text-primary));
	}
</style>

<script lang="ts">
	import WalletSelectButton from './WalletSelectButton.svelte';
	import { wallets } from './wallets.js';

	export let showAuthButtons: boolean = false;
	export let availableWallets: string[];
	export let modalType: string = 'dropdown';
	export let allowWatchAccounts: boolean = false;

	const filteredWallets = wallets.filter((wallet) => wallet.name !== 'Watch');
</script>

<div class="space-y-1">
	{#each filteredWallets as wallet}
		{#if availableWallets.includes(wallet.name)}
			<div class="wallet-item">
				<WalletSelectButton walletName={wallet.name} showAuthButton={showAuthButtons} {modalType} />
			</div>
		{/if}
	{/each}
	{#if allowWatchAccounts}
		<div class="wallet-item">
			<WalletSelectButton walletName="Watch" showAuthButton={false} {modalType} />
		</div>
	{/if}
</div>

<style lang="postcss">
	.wallet-item {
		@apply py-0.5;
	}
</style>

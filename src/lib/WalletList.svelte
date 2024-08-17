<script lang="ts">
    import WalletSelectButton from './WalletSelectButton.svelte';
    import { wallets } from './wallets.js';

    export let showAuthButtons: boolean = false;
    export let availableWallets: string[];
    export let modalType: string = 'dropdown'; // modal, dropdown
</script>
{#each wallets as wallet}
    {#if availableWallets.includes(wallet.name)}
        <div class="p-1">
            <WalletSelectButton walletName={wallet.name} showAuthButton={showAuthButtons} {modalType}/>
        </div>
    {/if}
{/each}
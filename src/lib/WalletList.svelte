<script lang="ts">
    import WalletSelectButton from './WalletSelectButton.svelte';
    import { wallets } from './wallets.js';

    export let showAuthButtons: boolean = false;
</script>
{#each wallets as wallet}
    <div class="p-1">
        <WalletSelectButton walletName={wallet.name} showAuthButton={showAuthButtons}/>
    </div>
{/each}
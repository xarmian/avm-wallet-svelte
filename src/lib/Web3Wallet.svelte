<script lang="ts">
    import WalletList from './WalletList.svelte';
    import { selectedWallet, showWalletList, ProviderStore } from './store.js';
    import { onMount } from 'svelte';
    import type { Algodv2, Indexer } from 'algosdk';
    import { Wallets } from './wallets.js';

    export let algodClient: Algodv2 | undefined = undefined;
    export let indexerClient: Indexer | undefined = undefined;
    export let walletListClass: string = 'bg-gray-100 dark:bg-gray-600';
    export let showAuthButtons: boolean = false;
    export let availableWallets: string[] = Object.values(Wallets);

    const closeWalletList = (event: any) => {
        if (!event.target.closest('.wallet-list')) {
            showWalletList.set(false);
        }
    };

    onMount(() => {
        ProviderStore.set({ algodClient, indexerClient });

        window.addEventListener('click', closeWalletList);
        return () => {
            window.removeEventListener('click', closeWalletList);
        };
    });

    const showWalletListHandler = () => {
        showWalletList.set(!$showWalletList);
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="flex flex-col relative" on:click|stopPropagation>
    <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg" on:click={showWalletListHandler}>
        {#if $selectedWallet?.address}
            {$selectedWallet.address.slice(0, 6)}...{$selectedWallet.address.slice(-6)}
        {:else}
            Connect Wallet
        {/if}
    </button>
    {#if $showWalletList}
        <div class="walletListBox absolute right-0 w-72 z-50 {walletListClass}">
            <WalletList showAuthButtons={showAuthButtons} availableWallets={availableWallets} />
        </div>
    {/if}
</div>
<style>
    .walletListBox {
        top: 2.5rem;
        padding: 1.0rem;
        border-radius:1rem;
        border-top-right-radius: 0;
        border: 1px solid #000;
        width: 18rem;
    }
</style>
<script lang="ts">
    import WalletList from './WalletList.svelte';
    import { selectedWallet, showWalletList, ProviderStore, connectedWallets as connectedWalletStore } from './store.js';
    import { onMount } from 'svelte';
    import type { Algodv2, Indexer } from 'algosdk';
    import { wallets, Wallets, verifyToken } from './wallets.js';
    import Cookies from 'js-cookie';

    export let algodClient: Algodv2 | undefined = undefined;
    export let indexerClient: Indexer | undefined = undefined;
    export let walletListClass: string = 'bg-gray-100 dark:bg-gray-600 dark:text-gray-100';
    export let showAuthButtons: boolean = false;
    export let availableWallets: string[] = Object.values(Wallets);
    export let showAuthenticated: boolean = true;

    let showAuthModal = false;
    let walletAuthError = '';

    const closeWalletList = (event: any) => {
        if (!event.target.closest('.wallet-list')) {
            showWalletList.set(false);
        }
    };

    onMount(() => {
        ProviderStore.set({ algodClient, indexerClient });
        validateWallets();

        window.addEventListener('click', closeWalletList);
        return () => {
            window.removeEventListener('click', closeWalletList);
        };
    });

    const validateWallets = async () => {
        const walletsToTest = $connectedWalletStore.filter((w) => w.auth === true)
        for (const w of walletsToTest) {
            try {
                // get token from cookie avm-wallet-token-<address>
                const token = Cookies.get(`avm-wallet-token-${w.address}`);
                if (token) {
                    if (await verifyToken(w.address, token)) continue;
                }
            }
            catch (e) {
                console.error('Invalid authe token for wallet ', w.address);
            }

            // update auth property from wallet with address "w.address" and app "w.app" in connectedWalletStore using update method
            connectedWalletStore.update((wallets) => {
                return wallets.map((wallet) => {
                    if (wallet.app === w.app && wallet.address === w.address) {
                        wallet.auth = false;
                    }
                    return wallet;
                });
            });
        }
    };

    const authenticateSelectedWallet = async () => {
        const sWallet = $selectedWallet;
        if (sWallet) {
            const wallet = wallets.find((w) => w.name === sWallet.app);
            if (wallet && wallet.authenticate) {
            walletAuthError = '';
            showAuthModal = true;

            try {
                await wallet.authenticate(sWallet.address);
                showAuthModal = false;
            }
            catch (e: any) {
                console.error('err',e);
                walletAuthError = e.message;
            }
            }
            else {
                throw new Error(`Wallet ${sWallet.app} not found`);
            }
        }
    };

    const showWalletListHandler = () => {
        showWalletList.set(!$showWalletList);
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="flex flex-col relative" on:click|stopPropagation>
    <button class="flex justify-between items-center bg-blue-500 hover:bg-blue-700 text-white text-sm font-bold py-0 h-10 px-4 rounded shadow-lg" on:click={showWalletListHandler}>
        <span class="text-center flex-grow ml-8">
            {#if $selectedWallet?.address}
                <div>
                    {$selectedWallet.address.slice(0, 6)}...{$selectedWallet.address.slice(-6)}
                </div>
                {#if showAuthButtons && showAuthenticated}
                    {#if $selectedWallet.auth}
                        <div class="text-green-300"> Authenticated</div>
                    {:else}
                        <div class="text-yellow-400" on:click|stopPropagation={() => authenticateSelectedWallet()}> Click to Authenticate</div>
                    {/if}
                {/if}
            {:else}
                Connect Wallet
            {/if}
        </span>
        {#if !$showWalletList}
            <svg class="h-6 w-6 ml-2" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" />
            </svg>
        {:else}
            <svg class="h-6 w-6 inline-block ml-2" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M19 14l-5-5-5 5z" />
            </svg>
        {/if}
    </button>
    {#if $showWalletList}
        <div class="walletListBox absolute right-0 w-72 z-50 {walletListClass}">
            <WalletList showAuthButtons={showAuthButtons} availableWallets={availableWallets} />
        </div>
    {/if}
</div>
{#if showAuthModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
    <div class="bg-white dark:bg-gray-500 p-4 rounded-lg relative">
      <h2 class="text-lg font-bold">Authenticate Wallet</h2>
      <p>A zero-cost transaction has been sent to your wallet for signing.</p>
      <p>This transaction will not be broadcast to the network and has no cost.</p>
      <p>Please sign the transaction to authenticate.</p>
      {#if walletAuthError == ''}
        <div class="flex justify-center">
          <div class="spinner"></div>
        </div>
      {:else}
        <p class="text-red-600 flex justify-center m-4">{walletAuthError}</p>
      {/if}
      <button class="absolute top-0 right-0 p-2" on:click={() => showAuthModal = false}>X</button>
      <button class="absolute bottom-0 right-0 p-2" on:click={() => showAuthModal = false}>Cancel</button>
    </div>
  </div>
{/if}
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
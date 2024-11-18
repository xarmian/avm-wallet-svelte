<script lang="ts">
    import WalletList from './WalletList.svelte';
    import { selectedWallet, showWalletList, ProviderStore, connectedWallets as connectedWalletStore, wcProjectStore } from './store.js';
    import { onMount } from 'svelte';
    import type { Algodv2, Indexer } from 'algosdk';
    import { wallets, Wallets, verifyToken } from './wallets.js';
    import Cookies from 'js-cookie';

    export let algodClient: Algodv2 | undefined = undefined;
    export let indexerClient: Indexer | undefined = undefined;
    export let walletListClass: string = 'bg-white dark:bg-gray-600 dark:text-gray-100';
    export let showAuthButtons: boolean = false;
    export let availableWallets: string[] = Object.values(Wallets);
    export let showAuthenticated: boolean = true;
    export let connectButtonType: 'static' | 'wallet' = 'wallet';
    export let modalType: 'modal' | 'dropdown' = 'dropdown';
    export let wcProject: { projectId: string, projectName: string, projectDescription: string, projectUrl: string, projectIcons: string[] } = { projectId: '', projectName: '', projectDescription: '', projectUrl: '', projectIcons: [] };
    export let allowWatchAccounts: boolean = false;

    let showAuthModal = false;
    let walletAuthError = '';

    const closeWalletList = (event: any) => {
        if (!event.target.closest('.wallet-list')) {
            showWalletList.set(false);
        }
    };

    wcProjectStore.set(wcProject);
 
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

    const handleKeydown = (event: KeyboardEvent, callback: () => void) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            callback();
        }
    };
</script>

<div class="flex flex-col relative dark:text-white wallet-container">
    <div 
        class="flex justify-between items-center bg-blue-500 hover:bg-blue-700 text-white text-sm font-bold py-0 h-10 px-4 rounded shadow-lg cursor-pointer" 
        on:click|stopPropagation={showWalletListHandler}
        on:keydown={(e) => handleKeydown(e, () => closeWalletList(e))}
        role="button"
        tabindex="0"
    >
        <span class="text-center flex-grow mx-8">
            {#if $selectedWallet?.address && connectButtonType === 'wallet'}
                <div class="flex items-center">
                    <div>{$selectedWallet.address.slice(0, 6)}...{$selectedWallet.address.slice(-6)}</div>
                    {#if modalType === 'dropdown'}
                    <i class="fa fa-caret-down ml-2"></i>
                    {/if}
                </div>
                {#if $selectedWallet.app === Wallets.WATCH}
                    <div class="text-red-300 text-xs"> Watch Account</div>
                {:else if showAuthButtons && showAuthenticated}
                    {#if $selectedWallet.auth}
                        <div class="text-green-300 text-xs"> Authenticated</div>
                    {:else if $selectedWallet.app !== Wallets.WATCH}
                        <div 
                            class="text-yellow-400 text-xs cursor-pointer" 
                            on:click|stopPropagation={() => authenticateSelectedWallet()}
                            on:keydown={(e) => handleKeydown(e, authenticateSelectedWallet)}
                            role="button"
                            tabindex="0"
                        > 
                            Click to Authenticate
                        </div>
                    {/if}
                {/if}
            {:else}
                Connect Wallet
            {/if}
        </span>
        {#if connectButtonType === 'wallet'}
            {#if !$showWalletList}
                <svg class="h-6 w-6 ml-2" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5z" />
                </svg>
            {:else}
                <svg class="h-6 w-6 inline-block ml-2" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M19 14l-5-5-5 5z" />
                </svg>
            {/if}
        {/if}
    </div>

    {#if $showWalletList}
        {#if modalType === 'dropdown'}
            <div class="walletListBox absolute right-0 w-72 z-50 {walletListClass}">
                <WalletList showAuthButtons={showAuthButtons} availableWallets={availableWallets} {allowWatchAccounts} />
            </div>
        {:else}
            <div class="fixed inset-0 flex items-center justify-center z-50">
                <div 
                    class="fixed inset-0 bg-black opacity-50" 
                    on:keydown={(e) => handleKeydown(e, () => closeWalletList(e))}
                    role="button"
                    tabindex="0"
                ></div>
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-lg mx-auto z-10">
                    <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Wallet List</h2>
                        <div 
                            class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none cursor-pointer" 
                            on:keydown={(e) => handleKeydown(e, () => closeWalletList(e))}
                            role="button"
                            tabindex="0"
                        >
                            <i class="fa fa-close p-2 border border-black rounded-md"></i>
                        </div>
                    </div>
                    <div class="p-4">
                        <WalletList showAuthButtons={showAuthButtons} availableWallets={availableWallets} {modalType} />
                    </div>
                </div>
            </div>
        {/if}
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
<script lang="ts">
    import WalletList from './WalletList.svelte';
    import { selectedWallet, showWalletList, ProviderStore, connectedWallets as connectedWalletStore, wcProjectStore, authModalStore } from './store.js';
    import { onMount } from 'svelte';
    import type { Algodv2, Indexer } from 'algosdk';
    import { verifyToken, wallets, Wallets } from './wallets.js';
    import Cookies from 'js-cookie';
    import AuthModal from './AuthModal.svelte';

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

    wcProjectStore.set(wcProject);
 
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
        const walletsToTest = $connectedWalletStore.filter((w) => w.auth === true);
        for (const w of walletsToTest) {
            try {
                const token = Cookies.get(`avm-wallet-token-${w.address}`);
                if (token && await verifyToken(w.address, token)) {
                    continue;
                }
            } catch (e) {
                console.error('Invalid auth token for wallet ', w.address);
            }

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
                authModalStore.set({ show: true, error: '', address: sWallet.address });

                try {
                    await wallet.authenticate(sWallet.address);
                    authModalStore.set({ show: false, error: '', address: '' });
                }
                catch (e: any) {
                    console.error('err',e);
                    authModalStore.update(state => ({ ...state, error: e.message }));
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

<AuthModal />

<div class="flex flex-col relative dark:text-white wallet-container">
    <div 
        class="flex items-center justify-between bg-blue-500 hover:bg-blue-700 text-white text-sm font-bold py-0 h-10 px-4 rounded shadow-lg cursor-pointer" 
        on:click|stopPropagation={showWalletListHandler}
        on:keydown={(e) => handleKeydown(e, () => closeWalletList(e))}
        role="button"
        tabindex="0"
    >
        <span class="flex-grow text-center ml-8">
            {#if $selectedWallet?.address && connectButtonType === 'wallet'}
                <div>
                    {$selectedWallet.address.slice(0, 6)}...{$selectedWallet.address.slice(-6)}
                </div>
                {#if $selectedWallet.app === Wallets.WATCH}
                    <div class="text-red-300 text-xs"> Watch Account</div>
                {:else if showAuthButtons && showAuthenticated}
                    {#if $connectedWalletStore.find((w) => w.address === $selectedWallet.address && w.app === $selectedWallet.app)?.auth}
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
            <svg class="h-6 w-6 ml-2" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                {#if !$showWalletList}
                    <path d="M7 10l5 5 5-5z" />
                {:else}
                    <path d="M19 14l-5-5-5 5z" />
                {/if}
            </svg>
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
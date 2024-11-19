<script lang="ts">
  import type { Wallet, WalletConnectionResult } from './wallets.js';
  import { wallets } from './wallets.js';
  import { selectedWallet as selectedWalletStore, connectedWallets as connectedWalletStore, showWalletList, authModalStore } from './store.js';
  import Cookies from 'js-cookie';
  import AuthModal from './AuthModal.svelte';

  export let walletName: string;
  export let showAuthButton: boolean = false;
  export let modalType: string = 'dropdown'; // modal, dropdown

  const wallet: Wallet | undefined = wallets.find(w => w.name === walletName);

  let showAccountList = false;

  const connectWallet = async () => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (!wallet) {
      throw new Error(`Wallet ${walletName} not found`);
    }
    await wallet.connect();
    showAccountList = true;
  };

  const disconnectWallet = async (walletAddress?: string) => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet && wallet.disconnect) {
      wallet.disconnect(walletAddress);
    }
    else {
      throw new Error(`Wallet ${walletName} not found`);
    }
  };

  const selectDefaultWallet = async (addr: string) => {
    selectedWalletStore.set({ app: walletName, address: addr });
    if (modalType != 'modal') {
      showWalletList.set(false);
    }
  };

  const authenticateWallet = async (addr: string) => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet && wallet.authenticate) {
      authModalStore.set({ show: true, error: '', address: addr });
      selectDefaultWallet(addr);

      try {
        await wallet.authenticate(addr);
        authModalStore.set({ show: false, error: '', address: '' });

        if (modalType == 'modal') {
          //showWalletList.set(false);
        }
      }
      catch (e: any) {
        console.error('err',e);
        authModalStore.update(state => ({ ...state, error: e.message }));
      }
    }
    else {
      throw new Error(`Wallet ${walletName} not found`);
    }
  };

  const logoutWallet = async (app: string, addr: string) => {
    // change auth property from wallet with address "addr" and app "app" in connectedWalletStore using update method, delete auth Cookie
    Cookies.remove(`avm-wallet-token-${addr}`);
    connectedWalletStore.update((wallets) => {
      return wallets.map((w) => {
        if (w.app === app && w.address === addr) {
          w.auth = false;
        }
        return w;
      });
    });

  };

</script>

{#if wallet}
  <div class="flex flex-col">
    <div class="flex items-center justify-between p-1 rounded-lg">
      <div class="flex items-center">
        <img src="{wallet.icon}" alt="{wallet.name} icon" class="w-6 h-6 mr-2">
        <span class="font-medium text-sm">{wallet.name}</span>
      </div>
      <div>
        {#if walletName == 'Watch'}
          <button class="px-2 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 dark:bg-green-700 dark:hover:bg-green-800 transition-colors duration-200" on:click="{connectWallet}">
            Add Watch
          </button>
        {:else}
          {#if $connectedWalletStore.filter((w) => w.app === walletName).length > 0 && modalType == 'dropdown'}
            <button class="px-2 py-1 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 dark:bg-red-700 dark:hover:bg-red-800 transition-colors duration-200" on:click={() => disconnectWallet()}>
              Disconnect
            </button>
          {:else}
            <button class="px-2 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 dark:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200" on:click="{connectWallet}">
              Connect
            </button>
          {/if}
        {/if}
      </div>
    </div>
    {#if modalType == 'dropdown' && $connectedWalletStore.filter((w) => w.app === walletName).length > 0}
      <div class="ml-8 mt-1">
        {#each $connectedWalletStore.filter((w) => w.app === walletName) as connectedWallet}
          {#if connectedWallet.address}
            <div class="flex items-center justify-between text-sm">
              <button class="flex-grow text-left truncate rounded-md hover:bg-gray-100 p-2 dark:hover:bg-gray-700 transition-colors duration-200 {$selectedWalletStore?.app == connectedWallet.app && $selectedWalletStore?.address == connectedWallet.address ? 'font-bold':''}" on:click={() => selectDefaultWallet(connectedWallet.address)}>
                {connectedWallet.address.slice(0, 10)}...{connectedWallet.address.slice(-10)}
              </button>
              <div class="flex items-center">
                {#if connectedWallet.watch}
                  <button aria-label="Remove wallet" class="text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200 ml-2" on:click={() => disconnectWallet(connectedWallet.address)}>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                  </button>
                {:else if showAuthButton}
                  {#if connectedWallet.auth}
                    <button class="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200 ml-2" on:click={() => logoutWallet(connectedWallet.app, connectedWallet.address)}>
                      Logout
                    </button>
                  {:else}
                    <button class="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200 ml-2" on:click={() => authenticateWallet(connectedWallet.address)}>
                      Login
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
      {:else if showAccountList && $connectedWalletStore.filter((w) => w.app === walletName).length > 0}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="fixed inset-0 bg-black flex items-center justify-center">
        <div class="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-xl mx-auto z-10">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Account</h2>
            <button aria-label="Close" class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none" on:click={() => showAccountList = false}>
              <i class="fa fa-close p-2 border border-black rounded-md">
            </button>
          </div>
          <div class="p-4 pb-1">Click each account to authenticate</div>
        
          <div class="flex flex-col m-3">
            {#each $connectedWalletStore.filter((w) => w.app === walletName) as connectedWallet}
              {#if connectedWallet.address}
                <button class="flex justify-between p-2 my-1 rounded w-full hover:bg-slate-200 dark:hover:bg-slate-500 bg-slate-100 dark:bg-slate-600" on:click={() => authenticateWallet(connectedWallet.address)}>
                  {connectedWallet.address.slice(0, 8)}...{connectedWallet.address.slice(-8)}
                  <span class="text-xs {connectedWallet.auth ? 'text-green-500' : 'text-red-500'}">
                    {connectedWallet.auth ? 'Authenticated' : 'Not Authenticated'}
                  </span>
                </button>
              {/if}
            {/each}
          </div>
          {#if walletName != 'Kibisis'}
          <button class="place-self-center px-4 py-1 my-1 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 dark:bg-red-700 dark:hover:bg-red-800" on:click={() => disconnectWallet()}>
            Reset Wallet
          </button>
          {:else}
          <div class="p-2 text-center text-xs">
              To change accounts, go to Kibisis Settings->Sessions->Voirewards, and click Manage
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<AuthModal />

<style>
button {
  display: flex;
}
</style>
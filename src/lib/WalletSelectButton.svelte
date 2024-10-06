<script lang="ts">
  import type { Wallet, WalletConnectionResult } from './wallets.js';
  import { wallets } from './wallets.js';
  import { selectedWallet as selectedWalletStore, connectedWallets as connectedWalletStore, showWalletList } from './store.js';
  import Cookies from 'js-cookie';

  export let walletName: string;
  export let showAuthButton: boolean = false;
  export let modalType: string = 'dropdown'; // modal, dropdown
  let showAuthModal = false;
  let walletAuthError = '';
  let showAccountList = false;

  const wallet: Wallet | undefined = wallets.find(w => w.name === walletName);

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
      console.log(wallet);
      walletAuthError = '';
      showAuthModal = true;

      try {
        await wallet.authenticate(addr);
        showAuthModal = false;

        if (modalType == 'modal') {
          //showWalletList.set(false);
        }
      }
      catch (e: any) {
        console.error('err',e);
        walletAuthError = e.message;
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
    <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200">
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
            <div class="flex items-center justify-between py-1 text-sm">
              <button class="flex-grow text-left truncate {$selectedWalletStore?.app == connectedWallet.app && $selectedWalletStore?.address == connectedWallet.address ? 'font-bold':''}" on:click={() => selectDefaultWallet(connectedWallet.address)}>
                {connectedWallet.address.slice(0, 6)}...{connectedWallet.address.slice(-4)}
              </button>
              <div class="flex items-center">
                {#if connectedWallet.watch}
                  <button class="text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200 ml-2" on:click={() => disconnectWallet(connectedWallet.address)}>
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
    {/if}
  </div>
{/if}
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
  .wallet-icon {
    width: 28px;
    height: 28px;
    margin-right: 8px;
    vertical-align: middle;
  }
  button {
    display: flex;
  }
  .walletAddress:hover {
    background-color: rgba(255,255,255,0.1);
  }
  .walletAddress.selected {
    background-color: rgba(0, 255, 0, 0.3) !important;
  }
  .walletAddress.selected:dark {
    background-color: rgba(255,255,255,0.2) !important;
  }
  .spinner {
  border: 16px solid #f3f3f3;
  border-top: 16px solid #3498db;
  border-radius: 50%;
  width: 120px;
  height: 120px;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
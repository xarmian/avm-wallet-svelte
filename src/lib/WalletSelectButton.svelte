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

  const disconnectWallet = async () => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet && wallet.disconnect) {
      wallet.disconnect();
    }
    else {
      throw new Error(`Wallet ${walletName} not found`);
    }
  };

  const selectDefaultWallet = async (addr: string) => {
    selectedWalletStore.set({ app: walletName, address: addr });
    //showWalletList.set(false);
  };

  const authenticateWallet = async (addr: string) => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet && wallet.authenticate) {
      console.log(wallet);
      walletAuthError = '';
      showAuthModal = true;

      try {
        console.log('a');
        await wallet.authenticate(addr);
        console.log('b');
        showAuthModal = false;

        if (modalType == 'modal') {
          showWalletList.set(false);
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
  <div class="flex justify-between">
    <div>
      <img src="{wallet.icon}" alt="{wallet.name} icon" class="wallet-icon inline"> {wallet.name}
    </div>
    <div>
      {#if $connectedWalletStore.filter((w) => w.app === walletName).length > 0 && modalType == 'dropdown'}
        <button class="px-4 py-1 my-1 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 dark:bg-red-700 dark:hover:bg-red-800" on:click="{disconnectWallet}">
          Disconnect
        </button>
      {:else}
        <button class="px-4 py-1 my-1 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 dark:bg-blue-700 dark:hover:bg-blue-800" on:click="{connectWallet}">
          Connect
        </button>
      {/if}
    </div>
  </div>
  {#if modalType == 'dropdown'}
    <div class="flex flex-col">
      {#each $connectedWalletStore.filter((w) => w.app === walletName) as connectedWallet}
        {#if connectedWallet.address}
          <div class="flex flex-row w-full justify-between">
            <button class="walletAddress p-2 rounded {$selectedWalletStore?.app == connectedWallet.app && $selectedWalletStore?.address == connectedWallet.address ? 'selected':''}" on:click={() => selectDefaultWallet(connectedWallet.address)}>
              {connectedWallet.address.slice(0, 8)}...{connectedWallet.address.slice(-8)}
            </button>
            {#if showAuthButton}
              {#if connectedWallet.auth}
                <button class="p-2 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline" on:click={() => logoutWallet(connectedWallet.app, connectedWallet.address)}>
                  logout
                </button>
              {:else}
                <button class="p-2 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline" on:click={() => authenticateWallet(connectedWallet.address)}>
                  login
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {:else if showAccountList}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="fixed inset-0 bg-black flex items-center justify-center" on:click={() => showAccountList = false}>
      <div class="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-lg mx-auto z-10">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Account</h2>
          <button class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none" on:click={() => showAccountList = false}>
            <i class="fa fa-close p-2 border border-black rounded-md">
          </button>
        </div>
      
        <div class="bg-white dark:bg-gray-500 p-4 rounded-lg relative">
          {#each $connectedWalletStore.filter((w) => w.app === walletName) as connectedWallet}
            {#if connectedWallet.address}
              <button class="p-2 rounded w-full hover:bg-slate-200" on:click={() => authenticateWallet(connectedWallet.address)}>
                {connectedWallet.address.slice(0, 8)}...{connectedWallet.address.slice(-8)}
              </button>
            {/if}
          {/each}
        </div>
        <button class="place-self-center px-4 py-1 my-1 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 dark:bg-red-700 dark:hover:bg-red-800" on:click="{disconnectWallet}">
          Reset Wallet
        </button>
      </div>
    </div>
  {/if}
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


<script lang="ts">
  import type { Wallet, WalletConnectionResult } from './wallets.js';
  import { wallets } from './wallets.js';
  import { selectedWallet as selectedWalletStore, connectedWallets as connectedWalletStore, showWalletList } from './store.js';

  export let walletName: string;
  export let showAuthButton: boolean = false;
  const wallet: Wallet | undefined = wallets.find(w => w.name === walletName);

  const connectWallet = async () => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (!wallet) {
      throw new Error(`Wallet ${walletName} not found`);
    }
    await wallet.connect();
    showWalletList.set(false);
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
    showWalletList.set(false);
  };

  const authenticateWallet = async (addr: string) => {
    const wallet = wallets.find((w) => w.name === walletName);
    if (wallet && wallet.authenticate) {
      wallet.authenticate(addr);
    }
    else {
      throw new Error(`Wallet ${walletName} not found`);
    }
  };

  const logoutWallet = async (app: string, addr: string) => {
    // remove token property from wallet with address "addr" and app "app" in connectedWalletStore using update method
    connectedWalletStore.update((wallets) => {
      return wallets.map((w) => {
        if (w.app === app && w.address === addr) {
          delete w.token;
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
      {#if $connectedWalletStore.filter((w) => w.app === walletName).length > 0}
        <button on:click="{disconnectWallet}">
          Disconnect
        </button>
      {:else}
        <button on:click="{connectWallet}">
          Connect
        </button>
      {/if}
    </div>
  </div>
  <div class="flex flex-col">
    {#each $connectedWalletStore.filter((w) => w.app === walletName) as connectedWallet}
      {#if connectedWallet.address}
        <div class="flex flex-row w-full justify-between">
          <button class="walletAddress p-2 {$selectedWalletStore?.app == connectedWallet.app && $selectedWalletStore?.address == connectedWallet.address ? 'selected':''}" on:click={() => selectDefaultWallet(connectedWallet.address)}>
            {connectedWallet.address.slice(0, 8)}...{connectedWallet.address.slice(-8)}
          </button>
          {#if showAuthButton}
            {#if connectedWallet.token}
              <button class="p-2 text-blue-600 hover:text-blue-500 underline" on:click={() => logoutWallet(connectedWallet.app, connectedWallet.address)}>
                logout
              </button>
            {:else}
              <button class="p-2 text-blue-600 hover:text-blue-500 underline" on:click={() => authenticateWallet(connectedWallet.address)}>
                auth
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    {/each}
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
    background-color: rgba(255,255,255,0.2) !important;
  }
</style>


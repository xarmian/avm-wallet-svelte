<script lang="ts">
  import type { Snippet } from "svelte";
  import type { WalletInfo } from "../adapters/registry.js";
  import type { WalletId } from "../adapters/types.js";

  import { registry } from "../adapters/index.js";
  import { walletStore } from "../state/wallet-store.svelte.js";
  import { uiStore } from "../state/ui-store.svelte.js";

  interface Props {
    wallet: WalletInfo;
    walletIcon?: Snippet<[{ walletId: WalletId }]>;
  }

  let { wallet, walletIcon }: Props = $props();

  // Check if this wallet has any connected accounts
  const isConnected = $derived(walletStore.accounts.some((a) => a.walletId === wallet.id));

  // Loading state
  let connecting = $state(false);
  let error = $state<string | null>(null);

  async function handleConnect() {
    if (connecting) return;

    connecting = true;
    error = null;

    try {
      const adapter = registry.getAdapter(wallet.id);
      if (!adapter) {
        throw new Error(`Wallet adapter not found: ${wallet.id}`);
      }

      const accounts = await adapter.connect();

      // Add accounts to store
      const connectedAccounts = accounts.map((a) => ({
        address: a.address,
        walletId: wallet.id,
        authenticated: !!walletStore.getToken(a.address),
        name: a.name,
        isWatch: wallet.isWatchOnly,
      }));

      walletStore.addAccounts(connectedAccounts);

      // Close wallet list if we connected successfully
      if (connectedAccounts.length > 0) {
        uiStore.closeWalletList();
      }
    } catch (e) {
      console.error(`Failed to connect to ${wallet.name}:`, e);
      error = e instanceof Error ? e.message : "Connection failed";
    } finally {
      connecting = false;
    }
  }

  async function handleDisconnect() {
    try {
      const adapter = registry.getAdapter(wallet.id);
      if (adapter) {
        await adapter.disconnect();
      }
      walletStore.removeAccount(wallet.id);
    } catch (e) {
      console.error(`Failed to disconnect from ${wallet.name}:`, e);
    }
  }
</script>

<div class="avm-wallet-item">
  <button
    type="button"
    class="avm-wallet-item-button"
    onclick={isConnected ? handleDisconnect : handleConnect}
    disabled={connecting}
  >
    <span class="avm-wallet-item-icon">
      {#if walletIcon}
        {@render walletIcon({ walletId: wallet.id })}
      {:else}
        <img src={wallet.icon} alt="" width="32" height="32" />
      {/if}
    </span>

    <span class="avm-wallet-item-info">
      <span class="avm-wallet-item-name">{wallet.name}</span>
      {#if error}
        <span class="avm-wallet-item-error">{error}</span>
      {:else if connecting}
        <span class="avm-wallet-item-status">Connecting...</span>
      {:else if isConnected}
        <span class="avm-wallet-item-status avm-wallet-item-status--connected">Connected</span>
      {/if}
    </span>

    <span class="avm-wallet-item-action">
      {#if isConnected}
        <span class="avm-wallet-item-disconnect">Disconnect</span>
      {:else}
        <svg class="avm-wallet-item-arrow" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clip-rule="evenodd"
          />
        </svg>
      {/if}
    </span>
  </button>
</div>

<style>
  .avm-wallet-item {
    padding: var(--avm-spacing-xs);
  }

  .avm-wallet-item-button {
    display: flex;
    align-items: center;
    gap: var(--avm-spacing-sm);
    width: 100%;
    min-height: var(--avm-wallet-item-height);
    padding: var(--avm-spacing-sm) var(--avm-spacing-md);
    background: none;
    border: none;
    border-radius: var(--avm-radius-md);
    cursor: pointer;
    transition: background-color var(--avm-transition-fast);
    text-align: left;
  }

  .avm-wallet-item-button:hover:not(:disabled) {
    background-color: rgb(var(--avm-bg-hover));
  }

  .avm-wallet-item-button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .avm-wallet-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--avm-wallet-icon-size);
    height: var(--avm-wallet-icon-size);
    flex-shrink: 0;
  }

  .avm-wallet-item-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: var(--avm-radius-sm);
  }

  .avm-wallet-item-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .avm-wallet-item-name {
    font-size: var(--avm-font-size-sm);
    font-weight: var(--avm-font-weight-medium);
    color: rgb(var(--avm-text-primary));
  }

  .avm-wallet-item-status {
    font-size: var(--avm-font-size-xs);
    color: rgb(var(--avm-text-tertiary));
  }

  .avm-wallet-item-status--connected {
    color: rgb(var(--avm-color-success));
  }

  .avm-wallet-item-error {
    font-size: var(--avm-font-size-xs);
    color: rgb(var(--avm-color-error));
  }

  .avm-wallet-item-action {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .avm-wallet-item-arrow {
    width: 1.25rem;
    height: 1.25rem;
    color: rgb(var(--avm-text-tertiary));
  }

  .avm-wallet-item-disconnect {
    font-size: var(--avm-font-size-xs);
    color: rgb(var(--avm-color-error));
    font-weight: var(--avm-font-weight-medium);
  }
</style>

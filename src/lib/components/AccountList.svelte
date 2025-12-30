<script lang="ts">
  import type { WalletId } from "../adapters/types.js";
  import type { ConnectedAccount } from "../state/types.js";

  import { registry } from "../adapters/index.js";
  import { walletStore } from "../state/wallet-store.svelte.js";
  import { uiStore } from "../state/ui-store.svelte.js";

  interface Props {
    accounts: ConnectedAccount[];
    walletId: WalletId;
    showAuthButtons?: boolean;
  }

  let { accounts, walletId, showAuthButtons = false }: Props = $props();

  // Currently selected account
  const selectedAccount = $derived(walletStore.selectedAccount);

  // Loading states
  let authenticatingAddress = $state<string | null>(null);

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function handleSelect(account: ConnectedAccount) {
    walletStore.selectAccount(account);
    uiStore.closeWalletList();
  }

  async function handleAuthenticate(account: ConnectedAccount) {
    if (authenticatingAddress) return;

    authenticatingAddress = account.address;

    try {
      const adapter = registry.getAdapter(walletId);
      if (!adapter) {
        throw new Error(`Wallet adapter not found: ${walletId}`);
      }

      if (!adapter.authenticate) {
        throw new Error(`Wallet does not support authentication`);
      }

      const token = await adapter.authenticate(account.address);
      walletStore.setAuthenticated(walletId, account.address, token);
    } catch (e) {
      console.error("Authentication failed:", e);
      uiStore.setAuthError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      authenticatingAddress = null;
    }
  }

  function handleLogout(account: ConnectedAccount) {
    walletStore.logout(walletId, account.address);
  }
</script>

<div class="avm-account-list">
  {#each accounts as account (account.address)}
    {@const isSelected =
      selectedAccount?.address === account.address && selectedAccount?.walletId === account.walletId}
    {@const isAuthenticating = authenticatingAddress === account.address}

    <div class="avm-account-item" class:avm-account-item--selected={isSelected}>
      <button
        type="button"
        class="avm-account-select"
        onclick={() => handleSelect(account)}
        aria-pressed={isSelected}
      >
        <span class="avm-account-address">
          {account.name || formatAddress(account.address)}
        </span>
        {#if isSelected}
          <svg class="avm-account-check" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clip-rule="evenodd"
            />
          </svg>
        {/if}
      </button>

      {#if showAuthButtons && !account.isWatch}
        <div class="avm-account-actions">
          {#if account.authenticated}
            <button
              type="button"
              class="avm-account-action avm-account-action--logout"
              onclick={() => handleLogout(account)}
            >
              Logout
            </button>
          {:else}
            <button
              type="button"
              class="avm-account-action avm-account-action--auth"
              onclick={() => handleAuthenticate(account)}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? "..." : "Authenticate"}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .avm-account-list {
    padding: 0 var(--avm-spacing-sm) var(--avm-spacing-sm);
  }

  .avm-account-item {
    display: flex;
    align-items: center;
    gap: var(--avm-spacing-sm);
    padding: var(--avm-spacing-xs);
    margin-left: calc(var(--avm-wallet-icon-size) + var(--avm-spacing-md));
    border-radius: var(--avm-radius-md);
  }

  .avm-account-item--selected {
    background-color: rgb(var(--avm-color-primary) / 0.1);
  }

  .avm-account-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    min-width: 0;
    padding: var(--avm-spacing-xs) var(--avm-spacing-sm);
    background: none;
    border: none;
    border-radius: var(--avm-radius-sm);
    cursor: pointer;
    text-align: left;
  }

  .avm-account-select:hover {
    background-color: rgb(var(--avm-bg-hover));
  }

  .avm-account-address {
    font-family: var(--avm-address-font);
    font-size: var(--avm-font-size-xs);
    color: rgb(var(--avm-text-secondary));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avm-account-check {
    width: 1rem;
    height: 1rem;
    color: rgb(var(--avm-color-primary));
    flex-shrink: 0;
  }

  .avm-account-actions {
    flex-shrink: 0;
  }

  .avm-account-action {
    padding: var(--avm-spacing-xs) var(--avm-spacing-sm);
    font-size: var(--avm-font-size-xs);
    font-weight: var(--avm-font-weight-medium);
    border: none;
    border-radius: var(--avm-radius-sm);
    cursor: pointer;
    transition: background-color var(--avm-transition-fast);
  }

  .avm-account-action--auth {
    background-color: rgb(var(--avm-color-primary));
    color: rgb(var(--avm-text-inverse));
  }

  .avm-account-action--auth:hover:not(:disabled) {
    background-color: rgb(var(--avm-color-primary-hover));
  }

  .avm-account-action--auth:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .avm-account-action--logout {
    background-color: rgb(var(--avm-color-error) / 0.1);
    color: rgb(var(--avm-color-error));
  }

  .avm-account-action--logout:hover {
    background-color: rgb(var(--avm-color-error) / 0.2);
  }
</style>

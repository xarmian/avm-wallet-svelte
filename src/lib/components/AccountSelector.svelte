<script lang="ts">
  import { walletStore } from "../state/wallet-store.svelte.js";
  import { uiStore } from "../state/ui-store.svelte.js";
  import { registry } from "../adapters/index.js";
  import type { ConnectedAccount } from "../state/types.js";

  import AccountRow from "./AccountRow.svelte";

  interface Props {
    showSignInStatus?: boolean;
    showSignInButton?: boolean;
    autoSignIn?: boolean;
    onAddAccount?: () => void;
    onClose?: () => void;
  }

  let {
    showSignInStatus = false,
    showSignInButton = false,
    autoSignIn = false,
    onAddAccount,
    onClose,
  }: Props = $props();

  // Get accounts and selection from store
  const accounts = $derived(walletStore.accounts);
  const selectedAccount = $derived(walletStore.selectedAccount);

  // Group accounts by wallet
  const accountsByWallet = $derived(() => {
    const grouped = new Map<string, { walletId: string; walletName: string; icon?: string; accounts: typeof accounts }>();

    for (const account of accounts) {
      if (!grouped.has(account.walletId)) {
        const walletInfo = registry.getWalletInfo().find((w) => w.id === account.walletId);
        grouped.set(account.walletId, {
          walletId: account.walletId,
          walletName: walletInfo?.name || account.walletId,
          icon: walletInfo?.icon,
          accounts: [],
        });
      }
      grouped.get(account.walletId)!.accounts.push(account);
    }

    return Array.from(grouped.values());
  });

  // Track which account is being signed in
  let signingInAddress = $state<string | null>(null);

  function handleSelect(account: ConnectedAccount) {
    walletStore.selectAccount(account);
    onClose?.();
  }

  async function handleSignIn(account: ConnectedAccount) {
    if (signingInAddress) return;

    signingInAddress = account.address;

    try {
      const adapter = registry.getAdapter(account.walletId);
      if (!adapter?.authenticate) {
        throw new Error("Wallet does not support authentication");
      }

      const token = await adapter.authenticate(account.address);
      walletStore.setAuthenticated(account.walletId, account.address, token);
    } catch (error) {
      console.error("Sign-in failed:", error);
      uiStore.setAuthError(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      signingInAddress = null;
    }
  }

  function handleSignOut(account: ConnectedAccount) {
    walletStore.logout(account.walletId, account.address);
  }

  async function handleDisconnect(account: ConnectedAccount) {
    try {
      const adapter = registry.getAdapter(account.walletId);
      if (adapter) {
        await adapter.disconnect();
      }
      // Remove all accounts from this wallet (no address = remove all)
      walletStore.removeAccount(account.walletId);
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  }

  function handleAddAccount(event: MouseEvent) {
    event.stopPropagation();
    onAddAccount?.();
  }
</script>

<div class="account-selector">
  {#if accounts.length > 0}
    <div class="account-selector__list" role="listbox" aria-label="Connected accounts">
      {#each accountsByWallet() as wallet (wallet.walletId)}
        <div class="account-selector__wallet-group">
          <div class="account-selector__wallet-header">
            <div class="account-selector__wallet-info">
              {#if wallet.icon}
                <img src={wallet.icon} alt="" class="account-selector__wallet-icon" />
              {/if}
              <span class="account-selector__wallet-name">{wallet.walletName}</span>
            </div>
            <button
              type="button"
              class="account-selector__disconnect"
              onclick={(e) => { e.stopPropagation(); handleDisconnect(wallet.accounts[0]); }}
              title="Disconnect from {wallet.walletName}"
            >
              Disconnect
            </button>
          </div>
          {#each wallet.accounts as account (account.address)}
            <AccountRow
              {account}
              isSelected={selectedAccount?.address === account.address &&
                selectedAccount?.walletId === account.walletId}
              {showSignInStatus}
              {showSignInButton}
              signingIn={signingInAddress === account.address}
              onSelect={() => handleSelect(account)}
              onSignIn={() => handleSignIn(account)}
              onSignOut={() => handleSignOut(account)}
            />
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <div class="account-selector__empty">
      <p class="account-selector__empty-text">No accounts connected</p>
      <p class="account-selector__empty-hint">Add an account to get started</p>
    </div>
  {/if}

  <div class="account-selector__footer">
    <button type="button" class="account-selector__add" onclick={handleAddAccount}>
      <svg
        class="account-selector__add-icon"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
        />
      </svg>
      Add Account
    </button>
  </div>
</div>

<style>
  .account-selector {
    display: flex;
    flex-direction: column;
  }

  .account-selector__list {
    display: flex;
    flex-direction: column;
    padding: var(--avm-spacing-xs);
    max-height: 320px;
    overflow-y: auto;
  }

  .account-selector__wallet-group {
    margin-bottom: var(--avm-spacing-xs);
  }

  .account-selector__wallet-group:last-child {
    margin-bottom: 0;
  }

  .account-selector__wallet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--avm-spacing-xs) var(--avm-spacing-sm);
    border-bottom: 1px solid rgb(var(--avm-border-color));
    margin-bottom: var(--avm-spacing-xs);
  }

  .account-selector__wallet-info {
    display: flex;
    align-items: center;
    gap: var(--avm-spacing-xs);
  }

  .account-selector__wallet-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .account-selector__wallet-name {
    font-size: var(--avm-font-size-xs);
    font-weight: var(--avm-font-weight-semibold);
    color: rgb(var(--avm-text-secondary));
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .account-selector__disconnect {
    padding: 2px 8px;
    font-size: 11px;
    font-weight: var(--avm-font-weight-medium);
    color: rgb(var(--avm-text-tertiary));
    background: none;
    border: none;
    border-radius: var(--avm-radius-sm);
    cursor: pointer;
    transition: all var(--avm-transition-fast);
  }

  .account-selector__disconnect:hover {
    color: rgb(var(--avm-color-error));
    background-color: rgb(var(--avm-color-error) / 0.1);
  }

  .account-selector__empty {
    padding: var(--avm-spacing-xl) var(--avm-spacing-md);
    text-align: center;
  }

  .account-selector__empty-text {
    margin: 0;
    font-size: var(--avm-font-size-sm);
    font-weight: var(--avm-font-weight-medium);
    color: rgb(var(--avm-text-primary));
  }

  .account-selector__empty-hint {
    margin: var(--avm-spacing-xs) 0 0;
    font-size: var(--avm-font-size-xs);
    color: rgb(var(--avm-text-tertiary));
  }

  .account-selector__footer {
    padding: var(--avm-spacing-xs);
    border-top: 1px solid rgb(var(--avm-border-color));
  }

  .account-selector__add {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--avm-spacing-xs);
    width: 100%;
    padding: var(--avm-spacing-sm) var(--avm-spacing-md);
    background-color: rgb(var(--avm-color-primary));
    border: none;
    border-radius: var(--avm-radius-md);
    font-size: var(--avm-font-size-sm);
    font-weight: var(--avm-font-weight-medium);
    color: rgb(var(--avm-text-inverse));
    cursor: pointer;
    transition: all var(--avm-transition-fast);
  }

  .account-selector__add:hover {
    background-color: rgb(var(--avm-color-primary-hover));
  }

  .account-selector__add-icon {
    width: 16px;
    height: 16px;
  }
</style>

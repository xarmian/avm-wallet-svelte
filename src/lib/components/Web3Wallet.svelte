<script lang="ts">
  import type { Algodv2, Indexer } from "algosdk";
  import type { Snippet } from "svelte";
  import type { WalletId, WalletConnectConfig } from "../adapters/types.js";
  import type { ConnectedAccount } from "../state/types.js";

  import { onMount, onDestroy } from "svelte";
  import { walletStore } from "../state/wallet-store.svelte.js";
  import { uiStore } from "../state/ui-store.svelte.js";
  import { providerStore } from "../state/provider-store.svelte.js";
  import { registry, onWalletConnectModal } from "../adapters/index.js";

  import AccountSelector from "./AccountSelector.svelte";
  import AddAccountView from "./AddAccountView.svelte";
  import AuthModal from "./AuthModal.svelte";
  import WalletConnectModal from "./WalletConnectModal.svelte";

  // Props interface
  interface Props {
    /** Algorand node client (required) */
    algodClient: Algodv2;
    /** Indexer client (optional) */
    indexerClient?: Indexer;
    /** Which wallets to enable */
    enabledWallets?: WalletId[];
    /** Allow watch-only accounts */
    allowWatchAccounts?: boolean;
    /** Display mode: dropdown or modal */
    displayMode?: "dropdown" | "modal";
    /** WalletConnect project configuration */
    wcConfig?: WalletConnectConfig;
    /** Additional CSS classes for the container */
    class?: string;

    /** Auto sign-in after connecting */
    autoSignIn?: boolean;
    /** Show sign-in button on accounts */
    showSignInButton?: boolean;
    /** Show sign-in status indicator */
    showSignInStatus?: boolean;

    /** Custom trigger button content */
    trigger?: Snippet<
      [
        {
          selectedAccount: ConnectedAccount | null;
          toggle: () => void;
          isOpen: boolean;
        },
      ]
    >;
  }

  let {
    algodClient,
    indexerClient,
    enabledWallets = ["pera", "defly", "kibisis", "lute", "walletconnect", "biatec", "voiwallet"],
    allowWatchAccounts = false,
    displayMode = "dropdown",
    wcConfig,
    class: className = "",
    autoSignIn = false,
    showSignInButton = false,
    showSignInStatus = true,
    trigger,
  }: Props = $props();

  // Local state
  let containerRef = $state<HTMLElement | null>(null);
  let initError = $state<string | null>(null);
  let wcUnsubscribe: (() => void) | null = null;
  let uiUnsubscribe: (() => void) | null = null;

  // UI state - uses global uiStore for external control
  let showList = $state(false);
  let currentView = $state<"selector" | "add-account">("selector");

  // Sync with global uiStore for external control (e.g., uiStore.openWalletList())
  $effect(() => {
    if (uiStore.showWalletList && !showList) {
      showList = true;
      currentView = "selector";
    }
  });

  // Initialize on mount
  onMount(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("click", handleClickOutside);
    }
    initializeWallet();
  });

  async function initializeWallet() {
    try {
      // Initialize provider store
      await providerStore.initialize(algodClient, indexerClient, wcConfig);

      // Determine which wallets to enable
      const walletsToEnable = allowWatchAccounts
        ? [...enabledWallets, "watch" as WalletId]
        : enabledWallets;

      // Initialize wallet registry
      await registry.initialize(
        {
          algodClient,
          genesisHash: providerStore.genesisHash,
          genesisId: providerStore.genesisId,
          chainId: providerStore.chainId,
        },
        walletsToEnable,
        wcConfig
      );

      // Set up WalletConnect modal handler
      wcUnsubscribe = onWalletConnectModal((event) => {
        if (event.type === "show") {
          uiStore.showWalletConnectModal(event.uri, event.walletName);
        } else {
          uiStore.closeWalletConnectModal();
        }
      });

      // Try to reconnect existing sessions
      const restored = await registry.reconnectAll();
      for (const [walletId, accounts] of restored) {
        const connectedAccounts = accounts.map((a) => ({
          address: a.address,
          walletId,
          authenticated: !!walletStore.getToken(a.address),
          name: a.name,
          isWatch: walletId === "watch",
        }));
        walletStore.addAccounts(connectedAccounts);
      }

      walletStore.setInitialized(true);
    } catch (error) {
      console.error("Failed to initialize Web3Wallet:", error);
      initError = error instanceof Error ? error.message : "Failed to initialize";
    }
  }

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("click", handleClickOutside);
    }
    wcUnsubscribe?.();
  });

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      closeList();
    }
  }

  function toggleWalletList() {
    showList = !showList;
    if (showList) {
      currentView = "selector";
    }
  }

  function openAddAccount() {
    currentView = "add-account";
  }

  function closeList() {
    showList = false;
    currentView = "selector";
    // Also close global state if it was opened externally
    if (uiStore.showWalletList) {
      uiStore.closeWalletList();
    }
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeList();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Auth Modal -->
<AuthModal />

<!-- WalletConnect QR Modal -->
<WalletConnectModal />

<div bind:this={containerRef} class="avm-wallet {className}">
  <!-- Trigger Button -->
  {#if trigger}
    {@render trigger({
      selectedAccount: walletStore.selectedAccount,
      toggle: toggleWalletList,
      isOpen: showList,
    })}
  {:else}
    <button
      type="button"
      class="avm-wallet__trigger"
      onclick={toggleWalletList}
      aria-expanded={showList}
      aria-haspopup="listbox"
    >
      {#if initError}
        <span class="avm-wallet__error">Error</span>
      {:else if walletStore.selectedAccount}
        <span class="avm-wallet__account">
          {walletStore.selectedAccount.name || formatAddress(walletStore.selectedAccount.address)}
        </span>
      {:else}
        <span class="avm-wallet__placeholder">Select Account</span>
      {/if}

      <svg
        class="avm-wallet__chevron"
        class:avm-wallet__chevron--open={showList}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  {/if}

  <!-- Dropdown/Modal Content -->
  {#if showList}
    {#if displayMode === "dropdown"}
      <div class="avm-wallet__dropdown" role="dialog" aria-label="Account selector">
        {#if currentView === "selector"}
          <AccountSelector
            {showSignInStatus}
            {showSignInButton}
            {autoSignIn}
            onAddAccount={openAddAccount}
            onClose={closeList}
          />
        {:else if currentView === "add-account"}
          <AddAccountView {autoSignIn} onBack={() => (currentView = "selector")} onClose={closeList} />
        {/if}
      </div>
    {:else}
      <!-- Modal mode -->
      <div
        class="avm-wallet__backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Account selector"
        onclick={() => closeList()}
        onkeydown={(e) => e.key === "Escape" && closeList()}
      >
        <div
          class="avm-wallet__modal"
          onclick={(e) => e.stopPropagation()}
          role="document"
        >
          {#if currentView === "selector"}
            <header class="avm-wallet__modal-header">
              <h2 class="avm-wallet__modal-title">Select Account</h2>
              <button
                type="button"
                class="avm-wallet__modal-close"
                onclick={() => closeList()}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>
            <div class="avm-wallet__modal-body">
              <AccountSelector
                {showSignInStatus}
                {showSignInButton}
                {autoSignIn}
                onAddAccount={openAddAccount}
                onClose={closeList}
              />
            </div>
          {:else if currentView === "add-account"}
            <div class="avm-wallet__modal-body avm-wallet__modal-body--no-header">
              <AddAccountView {autoSignIn} onBack={() => (currentView = "selector")} onClose={closeList} />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .avm-wallet {
    position: relative;
    font-family: var(--avm-font-family);
    font-size: var(--avm-font-size-sm);
  }

  /* Trigger Button */
  .avm-wallet__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--avm-spacing-sm);
    min-width: 180px;
    padding: 10px 14px;
    background-color: rgb(var(--avm-bg-primary));
    color: rgb(var(--avm-text-primary));
    font-size: var(--avm-font-size-sm);
    font-weight: var(--avm-font-weight-medium);
    border: 1px solid rgb(var(--avm-border-color));
    border-radius: var(--avm-radius-md);
    cursor: pointer;
    transition: all var(--avm-transition-fast);
  }

  .avm-wallet__trigger:hover {
    border-color: rgb(var(--avm-text-tertiary));
  }

  .avm-wallet__trigger:focus-visible {
    outline: 2px solid rgb(var(--avm-color-primary));
    outline-offset: 2px;
  }

  .avm-wallet__account {
    font-family: var(--avm-font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avm-wallet__placeholder {
    color: rgb(var(--avm-text-secondary));
  }

  .avm-wallet__error {
    color: rgb(var(--avm-color-error));
  }

  .avm-wallet__chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: rgb(var(--avm-text-tertiary));
    transition: transform var(--avm-transition-fast);
  }

  .avm-wallet__chevron--open {
    transform: rotate(180deg);
  }

  /* Dropdown */
  .avm-wallet__dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 280px;
    max-width: 360px;
    background-color: rgb(var(--avm-bg-primary));
    border: 1px solid rgb(var(--avm-border-color));
    border-radius: var(--avm-radius-lg);
    box-shadow: var(--avm-shadow-lg);
    z-index: var(--avm-z-dropdown);
    overflow: hidden;
  }

  /* Modal Backdrop */
  .avm-wallet__backdrop {
    position: fixed;
    inset: 0;
    background-color: rgb(var(--avm-bg-overlay) / var(--avm-bg-overlay-opacity));
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--avm-z-modal-backdrop);
  }

  /* Modal */
  .avm-wallet__modal {
    width: 340px;
    max-width: calc(100vw - 32px);
    background-color: rgb(var(--avm-bg-primary));
    border-radius: var(--avm-radius-xl);
    box-shadow: var(--avm-shadow-xl);
    z-index: var(--avm-z-modal);
    overflow: hidden;
  }

  .avm-wallet__modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--avm-spacing-md);
    border-bottom: 1px solid rgb(var(--avm-border-color));
  }

  .avm-wallet__modal-title {
    margin: 0;
    font-size: var(--avm-font-size-base);
    font-weight: var(--avm-font-weight-semibold);
    color: rgb(var(--avm-text-primary));
  }

  .avm-wallet__modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--avm-radius-sm);
    color: rgb(var(--avm-text-secondary));
    cursor: pointer;
    transition: all var(--avm-transition-fast);
  }

  .avm-wallet__modal-close:hover {
    background-color: rgb(var(--avm-bg-hover));
    color: rgb(var(--avm-text-primary));
  }

  .avm-wallet__modal-close svg {
    width: 16px;
    height: 16px;
  }

  .avm-wallet__modal-body {
    max-height: 60vh;
    overflow-y: auto;
  }

  .avm-wallet__modal-body--no-header {
    max-height: calc(60vh + 60px);
  }
</style>

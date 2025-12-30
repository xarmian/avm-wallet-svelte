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

  import WalletList from "./WalletList.svelte";
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
    /** Show authentication buttons */
    showAuthButtons?: boolean;
    /** Show authentication status badge */
    showAuthenticated?: boolean;
    /** Allow watch-only accounts */
    allowWatchAccounts?: boolean;
    /** Display mode: dropdown or modal */
    displayMode?: "dropdown" | "modal";
    /** Button style: shows connected wallet or static text */
    buttonStyle?: "wallet" | "static";
    /** WalletConnect project configuration */
    wcConfig?: WalletConnectConfig;
    /** Additional CSS classes for the container */
    class?: string;

    /** Custom button content */
    button?: Snippet<
      [
        {
          selectedAccount: ConnectedAccount | null;
          toggle: () => void;
          isOpen: boolean;
        },
      ]
    >;

    /** Custom wallet icon renderer */
    walletIcon?: Snippet<[{ walletId: WalletId }]>;
  }

  let {
    algodClient,
    indexerClient,
    enabledWallets = ["pera", "defly", "kibisis", "lute", "walletconnect"],
    showAuthButtons = false,
    showAuthenticated = true,
    allowWatchAccounts = false,
    displayMode = "dropdown",
    buttonStyle = "wallet",
    wcConfig,
    class: className = "",
    button,
    walletIcon,
  }: Props = $props();

  // Local state
  let containerRef = $state<HTMLElement | null>(null);
  let initError = $state<string | null>(null);
  let wcUnsubscribe: (() => void) | null = null;

  // Derived state from stores
  const selectedAccount = $derived(walletStore.selectedAccount);
  const showList = $derived(uiStore.showWalletList);

  // Initialize on mount
  onMount(() => {
    // Add click-outside listener
    document.addEventListener("click", handleClickOutside);

    // Run async initialization
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
    document.removeEventListener("click", handleClickOutside);
    wcUnsubscribe?.();
  });

  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      uiStore.closeWalletList();
    }
  }

  function toggleWalletList() {
    uiStore.toggleWalletList();
  }

  function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      uiStore.closeWalletList();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Auth Modal -->
<AuthModal />

<!-- WalletConnect QR Modal -->
<WalletConnectModal />

<div bind:this={containerRef} class="avm-wallet {className}">
  {#if button}
    {@render button({
      selectedAccount,
      toggle: toggleWalletList,
      isOpen: showList,
    })}
  {:else}
    <button
      type="button"
      class="avm-wallet-button"
      onclick={toggleWalletList}
      aria-expanded={showList}
      aria-haspopup="listbox"
    >
      {#if initError}
        <span class="avm-wallet-error">Error: {initError}</span>
      {:else if selectedAccount && buttonStyle === "wallet"}
        <span class="avm-wallet-account">
          <span class="avm-wallet-address">
            {selectedAccount.name || formatAddress(selectedAccount.address)}
          </span>
          {#if selectedAccount.isWatch}
            <span class="avm-wallet-badge avm-wallet-badge--watch">Watch</span>
          {:else if showAuthButtons && showAuthenticated}
            {#if selectedAccount.authenticated}
              <span class="avm-wallet-badge avm-wallet-badge--auth">Authenticated</span>
            {:else}
              <span class="avm-wallet-badge avm-wallet-badge--unauth">Not Authenticated</span>
            {/if}
          {/if}
        </span>
      {:else}
        <span class="avm-wallet-connect-text">Connect Wallet</span>
      {/if}

      {#if buttonStyle === "wallet"}
        <svg class="avm-wallet-chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          {#if showList}
            <path
              fill-rule="evenodd"
              d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
              clip-rule="evenodd"
            />
          {:else}
            <path
              fill-rule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clip-rule="evenodd"
            />
          {/if}
        </svg>
      {/if}
    </button>
  {/if}

  {#if showList}
    {#if displayMode === "dropdown"}
      <div class="avm-wallet-dropdown" role="listbox">
        <WalletList {showAuthButtons} {walletIcon} />
      </div>
    {:else}
      <!-- Modal mode -->
      <div
        class="avm-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Select Wallet"
        onclick={() => uiStore.closeWalletList()}
        onkeydown={(e) => e.key === "Escape" && uiStore.closeWalletList()}
      >
        <div class="avm-modal" onclick={(e) => e.stopPropagation()} role="document">
          <header class="avm-modal-header">
            <h2 class="avm-modal-title">Select Wallet</h2>
            <button
              type="button"
              class="avm-modal-close"
              onclick={() => uiStore.closeWalletList()}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div class="avm-modal-body">
            <WalletList {showAuthButtons} {walletIcon} />
          </div>
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

  .avm-wallet-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--avm-spacing-sm);
    width: 100%;
    min-height: var(--avm-btn-height);
    padding: var(--avm-btn-padding-y) var(--avm-btn-padding-x);
    background-color: rgb(var(--avm-color-primary));
    color: rgb(var(--avm-text-inverse));
    font-size: var(--avm-btn-font-size);
    font-weight: var(--avm-btn-font-weight);
    border: none;
    border-radius: var(--avm-btn-radius);
    cursor: pointer;
    transition:
      background-color var(--avm-transition-normal) var(--avm-transition-timing),
      box-shadow var(--avm-transition-normal) var(--avm-transition-timing);
    box-shadow: var(--avm-shadow-sm);
  }

  .avm-wallet-button:hover {
    background-color: rgb(var(--avm-color-primary-hover));
  }

  .avm-wallet-button:focus-visible {
    outline: 2px solid rgb(var(--avm-border-focus));
    outline-offset: 2px;
  }

  .avm-wallet-account {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
  }

  .avm-wallet-address {
    font-family: var(--avm-address-font);
  }

  .avm-wallet-badge {
    font-size: var(--avm-font-size-xs);
    font-weight: var(--avm-font-weight-normal);
    opacity: 0.9;
  }

  .avm-wallet-badge--watch {
    color: rgb(var(--avm-color-warning));
  }

  .avm-wallet-badge--auth {
    color: rgb(var(--avm-color-success) / 0.9);
  }

  .avm-wallet-badge--unauth {
    color: rgb(255 255 255 / 0.7);
  }

  .avm-wallet-error {
    color: rgb(var(--avm-color-error));
  }

  .avm-wallet-chevron {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
  }

  .avm-wallet-dropdown {
    position: absolute;
    top: calc(100% + var(--avm-spacing-xs));
    right: 0;
    width: var(--avm-wallet-list-width);
    max-height: var(--avm-wallet-list-max-height);
    overflow-y: auto;
    background-color: rgb(var(--avm-bg-primary));
    border: 1px solid rgb(var(--avm-border-color));
    border-radius: var(--avm-radius-lg);
    box-shadow: var(--avm-shadow-lg);
    z-index: var(--avm-z-dropdown);
  }

  .avm-modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgb(var(--avm-bg-overlay) / var(--avm-bg-overlay-opacity));
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--avm-z-modal-backdrop);
  }

  .avm-modal {
    width: var(--avm-modal-width);
    max-width: var(--avm-modal-max-width);
    background-color: rgb(var(--avm-bg-primary));
    border-radius: var(--avm-radius-xl);
    box-shadow: var(--avm-shadow-xl);
    z-index: var(--avm-z-modal);
  }

  .avm-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--avm-spacing-md);
    border-bottom: 1px solid rgb(var(--avm-border-color));
  }

  .avm-modal-title {
    margin: 0;
    font-size: var(--avm-font-size-lg);
    font-weight: var(--avm-font-weight-semibold);
    color: rgb(var(--avm-text-primary));
  }

  .avm-modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--avm-radius-md);
    color: rgb(var(--avm-text-secondary));
    cursor: pointer;
    transition: background-color var(--avm-transition-fast);
  }

  .avm-modal-close:hover {
    background-color: rgb(var(--avm-bg-hover));
  }

  .avm-modal-close svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .avm-modal-body {
    padding: var(--avm-spacing-sm);
    max-height: 60vh;
    overflow-y: auto;
  }
</style>

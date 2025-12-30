<script lang="ts">
  import type { Snippet } from "svelte";
  import type { WalletId } from "../adapters/types.js";

  import { registry } from "../adapters/index.js";
  import { walletStore } from "../state/wallet-store.svelte.js";

  import WalletItem from "./WalletItem.svelte";
  import AccountList from "./AccountList.svelte";

  interface Props {
    showAuthButtons?: boolean;
    walletIcon?: Snippet<[{ walletId: WalletId }]>;
  }

  let { showAuthButtons = false, walletIcon }: Props = $props();

  // Get wallet info from registry
  const wallets = $derived(registry.getWalletInfo());

  // Get connected wallet IDs
  const connectedWalletIds = $derived(walletStore.connectedWalletIds);

  // Group accounts by wallet ID
  const accountsByWallet = $derived(
    walletStore.accounts.reduce(
      (acc, account) => {
        if (!acc[account.walletId]) {
          acc[account.walletId] = [];
        }
        acc[account.walletId].push(account);
        return acc;
      },
      {} as Record<WalletId, typeof walletStore.accounts>
    )
  );
</script>

<div class="avm-wallet-list">
  {#each wallets as wallet (wallet.id)}
    <div class="avm-wallet-section">
      <WalletItem {wallet} {walletIcon} />

      {#if accountsByWallet[wallet.id]?.length > 0}
        <AccountList accounts={accountsByWallet[wallet.id]} {showAuthButtons} walletId={wallet.id} />
      {/if}
    </div>
  {/each}

  {#if wallets.length === 0}
    <div class="avm-wallet-empty">
      <p>No wallets available</p>
    </div>
  {/if}
</div>

<style>
  .avm-wallet-list {
    display: flex;
    flex-direction: column;
  }

  .avm-wallet-section {
    border-bottom: 1px solid rgb(var(--avm-border-color));
  }

  .avm-wallet-section:last-child {
    border-bottom: none;
  }

  .avm-wallet-empty {
    padding: var(--avm-spacing-lg);
    text-align: center;
    color: rgb(var(--avm-text-tertiary));
  }
</style>

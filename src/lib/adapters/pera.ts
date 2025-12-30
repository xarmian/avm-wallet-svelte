import { PeraWalletConnect } from "@perawallet/connect";
import type { Transaction } from "algosdk";
import { BaseWalletAdapter } from "./base.js";
import type { WalletAccount, SigningOptions } from "./types.js";
import peraIcon from "../icons/perawallet-icon.png";

/**
 * Pera Wallet adapter.
 */
export class PeraWalletAdapter extends BaseWalletAdapter {
  readonly id = "pera" as const;
  readonly name = "Pera Wallet";
  readonly icon = peraIcon;
  readonly supportsAuth = true;

  private wallet: PeraWalletConnect | null = null;

  protected async onInitialize(): Promise<void> {
    this.wallet = new PeraWalletConnect();
  }

  async connect(): Promise<WalletAccount[]> {
    if (!this.wallet) {
      throw new Error("Pera adapter not initialized");
    }

    try {
      // Try to reconnect first
      let addresses = await this.wallet.reconnectSession();

      // If no session, do full connect
      if (addresses.length === 0) {
        addresses = await this.wallet.connect();
      }

      const accounts = addresses.map((address: string) => ({ address }));
      this.setConnected(accounts);
      return accounts;
    } catch (error) {
      this.clearConnected();
      throw error;
    }
  }

  async reconnect(): Promise<WalletAccount[] | null> {
    if (!this.wallet) return null;

    try {
      const addresses = await this.wallet.reconnectSession();
      if (addresses.length === 0) return null;

      const accounts = addresses.map((address: string) => ({ address }));
      this.setConnected(accounts);
      return accounts;
    } catch {
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.wallet?.disconnect();
    } finally {
      this.clearConnected();
    }
  }

  async signTransactions(
    transactions: Transaction[][],
    _options?: SigningOptions
  ): Promise<Uint8Array[]> {
    if (!this.wallet) {
      throw new Error("Pera adapter not initialized");
    }

    // Ensure we're connected
    await this.wallet.reconnectSession();

    // Format transactions for Pera's API
    const groups = transactions.map((group) => group.map((txn) => ({ txn })));

    return await this.wallet.signTransaction(groups);
  }
}

/**
 * Factory function for creating Pera adapter instances.
 */
export function createPeraAdapter(): PeraWalletAdapter {
  return new PeraWalletAdapter();
}

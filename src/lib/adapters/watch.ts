import algosdk, { type Transaction } from "algosdk";
import { BROWSER } from "esm-env";
import type { WalletAdapter, WalletAdapterConfig, WalletAccount, SigningOptions, SignAndSendResult } from "./types.js";
import watchIcon from "../icons/watch_icon.png";

/**
 * Watch-only wallet adapter.
 * Allows monitoring addresses without signing capability.
 */
export class WatchWalletAdapter implements WalletAdapter {
  readonly id = "watch" as const;
  readonly name = "Watch Account";
  readonly icon = watchIcon;
  readonly supportsAuth = false;
  readonly isWatchOnly = true;

  private config: WalletAdapterConfig | null = null;
  private _accounts: WalletAccount[] = [];

  async initialize(config: WalletAdapterConfig): Promise<void> {
    this.config = config;
  }

  async connect(): Promise<WalletAccount[]> {
    if (!BROWSER) {
      throw new Error("Watch accounts are only available in browser environments");
    }

    const address = prompt("Enter the address to watch");

    if (!address) {
      return [];
    }

    if (!algosdk.isValidAddress(address)) {
      throw new Error("Invalid Algorand address");
    }

    const account: WalletAccount = { address };
    this._accounts = [account];
    return [account];
  }

  async reconnect(): Promise<WalletAccount[] | null> {
    // Watch accounts don't persist sessions
    return null;
  }

  async disconnect(): Promise<void> {
    this._accounts = [];
  }

  isConnected(): boolean {
    return this._accounts.length > 0;
  }

  async signTransactions(
    _transactions: Transaction[][],
    _options?: SigningOptions
  ): Promise<Uint8Array[]> {
    throw new Error("Watch accounts cannot sign transactions");
  }

  async signAndSendTransactions(
    _transactions: Transaction[][],
    _options?: SigningOptions
  ): Promise<SignAndSendResult> {
    throw new Error("Watch accounts cannot sign transactions");
  }
}

/**
 * Factory function for creating Watch adapter instances.
 */
export function createWatchAdapter(): WatchWalletAdapter {
  return new WatchWalletAdapter();
}

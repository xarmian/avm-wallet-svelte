import type { Transaction } from "algosdk";
import { BROWSER } from "esm-env";
import { Buffer } from "buffer";
import { BaseWalletAdapter } from "./base.js";
import type { WalletAccount, SigningOptions } from "./types.js";
import kibisisIcon from "../icons/kibisis_icon.svg";
import type { AVMWebClient } from "@agoralabs-sh/avm-web-provider";

/**
 * Kibisis Wallet adapter.
 * Uses the AVM Web Provider protocol for browser extension communication.
 */
export class KibisisWalletAdapter extends BaseWalletAdapter {
  readonly id = "kibisis" as const;
  readonly name = "Kibisis";
  readonly icon = kibisisIcon;
  readonly supportsAuth = true;

  private client: AVMWebClient | null = null;
  private readonly providerId = "f6d1c86b-4493-42fb-b88d-a62407b4cdf6";

  protected async onInitialize(): Promise<void> {
    if (!BROWSER) return;

    const { AVMWebClient } = await import("@agoralabs-sh/avm-web-provider");
    this.client = AVMWebClient.init();
  }

  async connect(): Promise<WalletAccount[]> {
    if (!BROWSER) {
      throw new Error("Kibisis is only available in browser environments");
    }

    if (!this.client) {
      await this.onInitialize();
    }

    const config = this.requireConfig();

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error("Kibisis client not initialized"));
        return;
      }

      this.client.onEnable(({ error, result }) => {
        if (error) {
          this.clearConnected();
          reject(new Error(error?.message ?? "Failed to connect Kibisis wallet"));
          return;
        }

        if (result?.accounts) {
          const accounts = result.accounts.map((acct) => ({
            address: acct.address,
            name: acct.name,
          }));
          this.setConnected(accounts);
          resolve(accounts);
        } else {
          this.clearConnected();
          resolve([]);
        }
      });

      this.client.enable({
        providerId: this.providerId,
        genesisHash: config.genesisHash,
      });
    });
  }

  async reconnect(): Promise<WalletAccount[] | null> {
    // Kibisis doesn't have persistent sessions like mobile wallets
    // Each page load requires a new connection
    return null;
  }

  async disconnect(): Promise<void> {
    if (!BROWSER || !this.client) {
      this.clearConnected();
      return;
    }

    const config = this.requireConfig();

    return new Promise((resolve, reject) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.onDisable(({ error }) => {
        this.clearConnected();
        if (error) {
          reject(new Error(error?.message ?? "Failed to disconnect Kibisis wallet"));
        } else {
          resolve();
        }
      });

      this.client.disable({
        providerId: this.providerId,
        genesisHash: config.genesisHash,
      });
    });
  }

  async signTransactions(
    transactions: Transaction[][],
    _options?: SigningOptions
  ): Promise<Uint8Array[]> {
    if (!BROWSER) {
      throw new Error("Kibisis is only available in browser environments");
    }

    if (!this.client) {
      throw new Error("Kibisis client not initialized");
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error("Kibisis client not initialized"));
        return;
      }

      this.client.onSignTransactions(({ error, result }) => {
        if (error || !result) {
          reject(new Error(error?.message ?? "Failed to sign transactions with Kibisis"));
          return;
        }

        const signedTxnBytes = result.stxns.map((stxn) => {
          if (stxn) {
            return new Uint8Array(Buffer.from(stxn, "base64"));
          }
          return new Uint8Array(0);
        });

        resolve(signedTxnBytes);
      });

      // Flatten transaction groups and encode as base64
      const txns = transactions.flat().map((txn) => ({
        txn: Buffer.from(txn.toByte()).toString("base64"),
      }));

      this.client.signTransactions({
        providerId: this.providerId,
        txns,
      });
    });
  }
}

/**
 * Factory function for creating Kibisis adapter instances.
 */
export function createKibisisAdapter(): KibisisWalletAdapter {
  return new KibisisWalletAdapter();
}

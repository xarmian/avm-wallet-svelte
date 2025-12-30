import algosdk from "algosdk";
import type {
  WalletAdapter,
  WalletAdapterConfig,
  WalletAccount,
  SigningOptions,
  SignAndSendResult,
} from "./types.js";

/**
 * Abstract base class for wallet adapters.
 * Provides common functionality for signing and sending transactions.
 */
export abstract class BaseWalletAdapter implements WalletAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly icon: string;
  abstract readonly supportsAuth: boolean;
  readonly isWatchOnly = false;

  protected config: WalletAdapterConfig | null = null;
  protected _connected = false;
  protected _accounts: WalletAccount[] = [];

  /**
   * Initialize the adapter with network configuration.
   */
  async initialize(config: WalletAdapterConfig): Promise<void> {
    this.config = config;
    await this.onInitialize();
  }

  /**
   * Called after config is set. Override to perform wallet-specific initialization.
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Connect to the wallet.
   */
  abstract connect(): Promise<WalletAccount[]>;

  /**
   * Disconnect from the wallet.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Reconnect using persisted session.
   */
  abstract reconnect(): Promise<WalletAccount[] | null>;

  /**
   * Sign transaction groups.
   */
  abstract signTransactions(
    transactions: algosdk.Transaction[][],
    options?: SigningOptions
  ): Promise<Uint8Array[]>;

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get the current accounts.
   */
  get accounts(): WalletAccount[] {
    return this._accounts;
  }

  /**
   * Get the configuration, throwing if not initialized.
   */
  protected requireConfig(): WalletAdapterConfig {
    if (!this.config) {
      throw new Error(`${this.name} adapter not initialized. Call initialize() first.`);
    }
    return this.config;
  }

  /**
   * Sign and send transaction groups to the network.
   * Default implementation that can be overridden by specific wallets.
   */
  async signAndSendTransactions(
    transactions: algosdk.Transaction[][],
    options?: SigningOptions
  ): Promise<SignAndSendResult> {
    const config = this.requireConfig();
    const signed = await this.signTransactions(transactions, options);

    const txIds: string[] = [];
    let confirmedRound = BigInt(0);

    for (const group of transactions) {
      // Match signed transactions back to original by txID
      const groupSigned = group
        .map((txn) => {
          const txId = txn.txID();
          return signed.find((signedTxn) => {
            if (!signedTxn?.length) return false;
            try {
              return algosdk.decodeSignedTransaction(signedTxn).txn.txID() === txId;
            } catch {
              return false;
            }
          });
        })
        .filter((s): s is Uint8Array => !!s);

      if (groupSigned.length === 0) {
        throw new Error("No signed transactions matched the original group");
      }

      const { txid } = await config.algodClient.sendRawTransaction(groupSigned).do();
      txIds.push(txid);

      const result = await algosdk.waitForConfirmation(config.algodClient, txid, 4);
      if (result.confirmedRound) {
        confirmedRound = result.confirmedRound;
      }
    }

    return { txIds, confirmedRound };
  }

  /**
   * Create an authentication token.
   * Default implementation that uses the wallet's signing capability.
   */
  async authenticate(address: string): Promise<string> {
    if (!this.supportsAuth) {
      throw new Error(`${this.name} does not support authentication`);
    }

    const config = this.requireConfig();
    const authTx = await this.createAuthTransaction(address);

    const signed = await this.signTransactions([[authTx]]);

    if (!signed[0]) {
      throw new Error("Failed to sign authentication transaction");
    }

    // Return base64 encoded signed transaction
    return Buffer.from(signed[0]).toString("base64");
  }

  /**
   * Create an authentication transaction for the given address.
   */
  protected async createAuthTransaction(address: string): Promise<algosdk.Transaction> {
    const config = this.requireConfig();

    const enc = new TextEncoder();
    const day90 = 24 * 60 * 60 * 1000 * 90;
    const notePlainText = `avm-wallet-auth ${Date.now() + day90}`;
    const note = enc.encode(notePlainText);

    const params = await config.algodClient.getTransactionParams().do();

    return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      suggestedParams: {
        fee: 0,
        firstValid: 10,
        flatFee: true,
        lastValid: 10,
        genesisHash: params.genesisHash,
        genesisID: params.genesisID,
        minFee: params.minFee,
      },
      sender: address,
      receiver: address,
      amount: 0,
      note,
    });
  }

  /**
   * Set connected state and accounts.
   */
  protected setConnected(accounts: WalletAccount[]): void {
    this._accounts = accounts;
    this._connected = accounts.length > 0;
  }

  /**
   * Clear connected state.
   */
  protected clearConnected(): void {
    this._accounts = [];
    this._connected = false;
  }
}

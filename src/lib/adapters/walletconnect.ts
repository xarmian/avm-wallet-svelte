import { UniversalProvider } from "@walletconnect/universal-provider";
import type { Transaction } from "algosdk";

/**
 * WalletConnect session structure.
 * Simplified interface matching the UniversalProvider session.
 */
interface WCSession {
  topic: string;
  namespaces: {
    [key: string]: {
      accounts?: string[];
      methods?: string[];
      chains?: string[];
      events?: string[];
    };
  };
}
import algosdk from "algosdk";
import { Buffer } from "buffer";
import { BROWSER } from "esm-env";
import type {
  WalletAdapter,
  WalletAdapterConfig,
  WalletAccount,
  SigningOptions,
  SignAndSendResult,
  WalletConnectConfig,
} from "./types.js";
import walletConnectIcon from "../icons/walletconnect-logo-black.svg";
import biatecIcon from "../icons/biatec_icon.svg";
import voiWalletIcon from "../icons/voi_wallet_icon.svg";

/**
 * Event emitter for WalletConnect modal control.
 * Components can subscribe to show/hide the QR modal.
 */
export type WalletConnectModalHandler = (event: WalletConnectModalEvent) => void;
export type WalletConnectModalEvent =
  | { type: "show"; uri: string; walletName: string }
  | { type: "hide" };

let modalHandler: WalletConnectModalHandler | null = null;

/**
 * Register a handler for WalletConnect modal events.
 */
export function onWalletConnectModal(handler: WalletConnectModalHandler): () => void {
  modalHandler = handler;
  return () => {
    modalHandler = null;
  };
}

/**
 * Module-level singleton for WalletConnect provider.
 * Shared across all WalletConnect adapter instances to prevent
 * multiple initializations of the WalletConnect Core.
 */
let sharedProvider: InstanceType<typeof UniversalProvider> | null = null;
let sharedProviderConfig: { projectId: string; metadata: object } | null = null;
let sharedProviderInitPromise: Promise<InstanceType<typeof UniversalProvider>> | null = null;

/**
 * Get or create the shared WalletConnect provider.
 */
async function getSharedProvider(
  wcConfig: WalletConnectConfig
): Promise<InstanceType<typeof UniversalProvider>> {
  const newConfig = {
    projectId: wcConfig.projectId,
    metadata: {
      name: wcConfig.name,
      description: wcConfig.description,
      url: wcConfig.url,
      icons: wcConfig.icons,
    },
  };

  // If we already have a provider with the same config, reuse it
  if (
    sharedProvider &&
    sharedProviderConfig &&
    sharedProviderConfig.projectId === newConfig.projectId
  ) {
    return sharedProvider;
  }

  // If initialization is in progress, wait for it
  if (sharedProviderInitPromise) {
    return sharedProviderInitPromise;
  }

  // Clean up existing provider if config changed
  if (sharedProvider) {
    try {
      sharedProvider.removeAllListeners?.();
    } catch {
      // Ignore errors during cleanup
    }
    sharedProvider = null;
    sharedProviderConfig = null;
  }

  // Create new provider
  sharedProviderInitPromise = UniversalProvider.init(newConfig).then((provider) => {
    sharedProvider = provider;
    sharedProviderConfig = newConfig;
    sharedProviderInitPromise = null;
    return provider;
  });

  return sharedProviderInitPromise;
}

/**
 * Clean up the shared provider.
 */
export async function destroySharedProvider(): Promise<void> {
  if (sharedProvider) {
    try {
      if (sharedProvider.session) {
        await sharedProvider.disconnect();
      }
      sharedProvider.removeAllListeners?.();
    } catch {
      // Ignore errors during cleanup
    }
    sharedProvider = null;
    sharedProviderConfig = null;
    sharedProviderInitPromise = null;
  }
}

/**
 * WalletConnect wallet adapter.
 * Supports generic WalletConnect, Biatec, and VoiWallet variants.
 */
export class WalletConnectAdapter implements WalletAdapter {
  readonly id: "walletconnect" | "biatec" | "voiwallet";
  readonly name: string;
  readonly icon: string;
  readonly supportsAuth = true;
  readonly isWatchOnly = false;

  private config: WalletAdapterConfig | null = null;
  private wcConfig: WalletConnectConfig | null = null;
  private provider: InstanceType<typeof UniversalProvider> | null = null;
  private session: WCSession | null = null;
  private chainId: string | null = null;
  private _accounts: WalletAccount[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(variant: "walletconnect" | "biatec" | "voiwallet" = "walletconnect") {
    this.id = variant;

    switch (variant) {
      case "biatec":
        this.name = "Biatec Wallet";
        this.icon = biatecIcon;
        break;
      case "voiwallet":
        this.name = "Voi Wallet";
        this.icon = voiWalletIcon;
        break;
      default:
        this.name = "WalletConnect";
        this.icon = walletConnectIcon;
    }
  }

  async initialize(config: WalletAdapterConfig): Promise<void> {
    this.config = config;
  }

  /**
   * Set WalletConnect project configuration.
   * Must be called before connect().
   */
  setWalletConnectConfig(wcConfig: WalletConnectConfig): void {
    this.wcConfig = wcConfig;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initPromise = null;
  }

  private async doInitialize(): Promise<void> {
    if (!this.config) {
      throw new Error("WalletConnect adapter not initialized");
    }

    if (!this.wcConfig) {
      throw new Error("WalletConnect project configuration not set");
    }

    // Compute chain ID from genesis hash
    const hashPrefix = this.config.genesisHash.substring(0, 32).replace(/\//g, "_");
    this.chainId = `algorand:${hashPrefix}`;

    // Get shared provider singleton (prevents multiple WC Core initializations)
    this.provider = await getSharedProvider(this.wcConfig);

    // Subscribe to session events (remove first to prevent duplicates)
    this.provider.off("session_delete", this.handleSessionDelete);
    this.provider.on("session_delete", this.handleSessionDelete);

    // Try to restore existing session
    await this.tryRestoreSession();

    this.initialized = true;
  }

  /**
   * Handler for session deletion events.
   * Bound as an instance method to allow proper removal.
   */
  private handleSessionDelete = (): void => {
    this.session = null;
    this._accounts = [];
    this.clearPersistedSession();
  };

  /**
   * Handler for display_uri events.
   * Bound as an instance method to allow proper removal.
   */
  private handleDisplayUri = (uri: string): void => {
    modalHandler?.({ type: "show", uri, walletName: this.name });
  };

  private async tryRestoreSession(): Promise<void> {
    if (!BROWSER || !this.provider) return;

    // Check for stored session owner
    const storedOwner = localStorage.getItem(`wc-session-owner-${this.id}`);
    if (storedOwner !== this.id) return;

    const existingSession = this.provider.session;
    if (!existingSession) return;

    // Validate session
    const algorandNs = existingSession.namespaces["algorand"];
    if (
      !algorandNs ||
      !algorandNs.methods?.includes("algo_signTxn") ||
      !algorandNs.chains?.includes(this.chainId!)
    ) {
      // Invalid session, clean up
      try {
        await this.provider.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.clearPersistedSession();
      return;
    }

    this.session = existingSession as WCSession;
    this._accounts = this.extractAccounts(algorandNs.accounts || []);
  }

  private extractAccounts(wcAccounts: string[]): WalletAccount[] {
    return wcAccounts.map((account) => {
      const [, , address] = account.split(":");
      return { address };
    });
  }

  private persistSession(): void {
    if (!BROWSER) return;
    localStorage.setItem(`wc-session-owner-${this.id}`, this.id);
  }

  private clearPersistedSession(): void {
    if (!BROWSER) return;
    localStorage.removeItem(`wc-session-owner-${this.id}`);
  }

  async connect(): Promise<WalletAccount[]> {
    if (!BROWSER) {
      throw new Error("WalletConnect is only available in browser environments");
    }

    await this.ensureInitialized();

    if (!this.provider) {
      throw new Error("WalletConnect provider not initialized");
    }

    // If we have a valid session, return existing accounts
    if (this.session && this._accounts.length > 0) {
      return this._accounts;
    }

    // Disconnect any existing session first
    if (this.provider.session) {
      try {
        await this.provider.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.session = null;
      this._accounts = [];
    }

    // Set up URI display handler (remove first to prevent duplicates)
    this.provider.off("display_uri", this.handleDisplayUri);
    this.provider.on("display_uri", this.handleDisplayUri);

    // Connect with required namespaces
    const connectParams = {
      namespaces: {
        algorand: {
          chains: [this.chainId!],
          methods: ["algo_signTxn"],
          events: [] as string[],
        },
      },
    };

    try {
      const sessionData = await this.provider.connect(connectParams);

      // Hide modal after connection attempt
      modalHandler?.({ type: "hide" });

      if (!sessionData) {
        throw new Error("Failed to establish WalletConnect session");
      }

      this.session = sessionData as WCSession;
      this.persistSession();

      const algorandNs = sessionData.namespaces["algorand"];
      this._accounts = this.extractAccounts(algorandNs?.accounts || []);

      return this._accounts;
    } catch (error) {
      modalHandler?.({ type: "hide" });
      this.clearPersistedSession();
      throw error;
    }
  }

  async reconnect(): Promise<WalletAccount[] | null> {
    if (!BROWSER) return null;

    try {
      await this.ensureInitialized();

      if (this.session && this._accounts.length > 0) {
        return this._accounts;
      }

      return null;
    } catch {
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.provider?.session) {
        await this.provider.disconnect();
      }
    } finally {
      this.session = null;
      this._accounts = [];
      this.clearPersistedSession();
      modalHandler?.({ type: "hide" });
    }
  }

  isConnected(): boolean {
    return this.session !== null && this._accounts.length > 0;
  }

  async signTransactions(
    transactions: Transaction[][],
    _options?: SigningOptions
  ): Promise<Uint8Array[]> {
    await this.ensureInitialized();

    if (!this.session || !this.provider) {
      throw new Error("No active WalletConnect session");
    }

    // Validate session is still active
    if (!this.provider.session || this.provider.session.topic !== this.session.topic) {
      throw new Error("WalletConnect session is no longer active. Please reconnect.");
    }

    // Prepare transactions for signing
    const txnsToSign = transactions.flat().map((txn) => ({
      txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64"),
      message: "Transaction to sign",
    }));

    const requestPayload = {
      method: "algo_signTxn",
      params: [txnsToSign],
    };

    const result = await this.provider.request(requestPayload, this.chainId!);

    // Convert results to Uint8Array
    return (result as (string | null)[]).map((signedTxn) =>
      signedTxn ? new Uint8Array(Buffer.from(signedTxn, "base64")) : new Uint8Array(0)
    );
  }

  async signAndSendTransactions(
    transactions: Transaction[][],
    options?: SigningOptions
  ): Promise<SignAndSendResult> {
    if (!this.config) {
      throw new Error("WalletConnect adapter not initialized");
    }

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

      const { txid } = await this.config.algodClient.sendRawTransaction(groupSigned).do();
      txIds.push(txid);

      const result = await algosdk.waitForConfirmation(this.config.algodClient, txid, 4);
      if (result.confirmedRound) {
        confirmedRound = result.confirmedRound;
      }
    }

    return { txIds, confirmedRound };
  }

  async authenticate(address: string): Promise<string> {
    if (!this.config) {
      throw new Error("WalletConnect adapter not initialized");
    }

    const enc = new TextEncoder();
    const day90 = 24 * 60 * 60 * 1000 * 90;
    const notePlainText = `avm-wallet-auth ${Date.now() + day90}`;
    const note = enc.encode(notePlainText);

    const params = await this.config.algodClient.getTransactionParams().do();

    const authTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
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

    const signed = await this.signTransactions([[authTx]]);

    if (!signed[0]) {
      throw new Error("Failed to sign authentication transaction");
    }

    return Buffer.from(signed[0]).toString("base64");
  }

  /**
   * Clear all WalletConnect storage for debugging.
   */
  async clearAllSessions(): Promise<void> {
    try {
      if (this.provider) {
        await this.provider.disconnect();
      }
    } catch {
      // Ignore errors
    }

    if (BROWSER) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("wc@2:") || key.startsWith("@walletconnect/"))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      this.clearPersistedSession();
    }

    this.session = null;
    this.provider = null;
    this._accounts = [];
    this.initialized = false;
  }

  /**
   * Clean up adapter resources.
   * Removes event listeners but preserves the shared provider.
   */
  async destroy(): Promise<void> {
    // Remove our event listeners from the shared provider
    if (this.provider) {
      this.provider.off("session_delete", this.handleSessionDelete);
      this.provider.off("display_uri", this.handleDisplayUri);
    }

    // Reset instance state (but don't destroy the shared provider)
    this.session = null;
    this.provider = null;
    this._accounts = [];
    this.initialized = false;
    this.initPromise = null;
    // Note: We don't clear the persisted session here because the shared
    // provider may still have an active session for other adapter instances
  }
}

/**
 * Factory function for creating WalletConnect adapter instances.
 */
export function createWalletConnectAdapter(
  variant: "walletconnect" | "biatec" | "voiwallet" = "walletconnect"
): WalletConnectAdapter {
  return new WalletConnectAdapter(variant);
}

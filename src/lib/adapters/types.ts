import type { Algodv2, Transaction } from "algosdk";

/**
 * Configuration passed to wallet adapters during initialization.
 */
export interface WalletAdapterConfig {
  /** Algorand client for interacting with the network */
  algodClient: Algodv2;
  /** Genesis hash of the network (base64) */
  genesisHash: string;
  /** Genesis ID of the network (e.g., "mainnet-v1.0") */
  genesisId: string;
  /** Chain ID for WalletConnect (e.g., "algorand:wGHE2Pwdvd7S...") */
  chainId: string;
}

/**
 * Result of a wallet connection - represents a connected account.
 */
export interface WalletAccount {
  /** Algorand address */
  address: string;
  /** Optional human-readable name from the wallet */
  name?: string;
}

/**
 * Options for signing transactions.
 */
export interface SigningOptions {
  /** Optional message to display to the user during signing */
  message?: string;
  /** Auth address for rekeyed accounts */
  authAddr?: string;
}

/**
 * Result of signing and sending transactions.
 */
export interface SignAndSendResult {
  /** Transaction IDs of submitted transactions */
  txIds: string[];
  /** Round in which transactions were confirmed */
  confirmedRound: bigint;
}

/**
 * WalletConnect project configuration.
 */
export interface WalletConnectConfig {
  /** Project ID from WalletConnect Cloud */
  projectId: string;
  /** Application name */
  name: string;
  /** Application description */
  description: string;
  /** Application URL */
  url: string;
  /** Application icon URLs */
  icons: string[];
}

/**
 * Base wallet adapter interface.
 * All wallet implementations must implement this interface.
 */
export interface WalletAdapter {
  /** Unique identifier for the wallet (e.g., "pera", "defly") */
  readonly id: string;

  /** Human-readable wallet name (e.g., "Pera Wallet") */
  readonly name: string;

  /** Wallet icon (URL or imported asset) */
  readonly icon: string;

  /** Whether this wallet supports authentication */
  readonly supportsAuth: boolean;

  /** Whether this is a watch-only wallet type */
  readonly isWatchOnly: boolean;

  /**
   * Initialize the adapter with network configuration.
   * Must be called before any other methods.
   */
  initialize(config: WalletAdapterConfig): Promise<void>;

  /**
   * Connect to the wallet and return available accounts.
   * @throws Error if connection fails
   */
  connect(): Promise<WalletAccount[]>;

  /**
   * Disconnect from the wallet.
   */
  disconnect(): Promise<void>;

  /**
   * Attempt to reconnect using a persisted session.
   * @returns Connected accounts if session exists, null otherwise
   */
  reconnect(): Promise<WalletAccount[] | null>;

  /**
   * Check if the wallet is currently connected.
   */
  isConnected(): boolean;

  /**
   * Sign transaction groups.
   * @param transactions - Array of transaction groups (each group is an array of transactions)
   * @param options - Optional signing options
   * @returns Array of signed transaction bytes
   * @throws Error if signing fails or is cancelled
   */
  signTransactions(
    transactions: Transaction[][],
    options?: SigningOptions
  ): Promise<Uint8Array[]>;

  /**
   * Sign and send transaction groups to the network.
   * @param transactions - Array of transaction groups
   * @param options - Optional signing options
   * @returns Transaction IDs and confirmation round
   * @throws Error if signing or sending fails
   */
  signAndSendTransactions(
    transactions: Transaction[][],
    options?: SigningOptions
  ): Promise<SignAndSendResult>;

  /**
   * Create an authentication token for the given address.
   * Only available if supportsAuth is true.
   * @param address - The address to authenticate
   * @returns Authentication token (base64 encoded signed transaction)
   * @throws Error if authentication fails
   */
  authenticate?(address: string): Promise<string>;
}

/**
 * Factory function for creating wallet adapter instances.
 */
export type WalletAdapterFactory = () => WalletAdapter;

/**
 * Supported wallet IDs.
 */
export type WalletId =
  | "pera"
  | "defly"
  | "kibisis"
  | "lute"
  | "walletconnect"
  | "biatec"
  | "voiwallet"
  | "watch";

/**
 * Event types emitted by wallet adapters.
 */
export type WalletEvent =
  | { type: "connect"; accounts: WalletAccount[] }
  | { type: "disconnect" }
  | { type: "accountsChanged"; accounts: WalletAccount[] }
  | { type: "error"; error: Error };

/**
 * Event handler function type.
 */
export type WalletEventHandler = (event: WalletEvent) => void;

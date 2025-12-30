import type { Algodv2, Indexer } from "algosdk";
import type { WalletId, WalletConnectConfig } from "../adapters/types.js";

/**
 * A connected account with its authentication status.
 */
export interface ConnectedAccount {
  /** Algorand address */
  address: string;
  /** Which wallet this account is connected through */
  walletId: WalletId;
  /** Whether this account has been authenticated */
  authenticated: boolean;
  /** Optional human-readable name (from Envoi or wallet) */
  name?: string;
  /** Whether this is a watch-only account */
  isWatch: boolean;
}

/**
 * Provider configuration for Algorand network access.
 */
export interface ProviderConfig {
  /** Algorand node client */
  algodClient: Algodv2;
  /** Optional indexer client */
  indexerClient?: Indexer;
  /** Genesis hash of the network (base64) */
  genesisHash: string;
  /** Genesis ID of the network */
  genesisId: string;
  /** Chain ID for WalletConnect */
  chainId: string;
}

/**
 * UI state for modals and dropdowns.
 */
export interface UIState {
  /** Whether the wallet list is visible */
  showWalletList: boolean;

  /** Authentication modal state */
  authModal: {
    show: boolean;
    address: string;
    error: string;
  };

  /** WalletConnect QR modal state */
  walletConnectModal: {
    show: boolean;
    uri: string;
    walletName: string;
  };
}

/**
 * Event handler types for wallet events.
 */
export type AccountAddedHandler = (account: ConnectedAccount) => void;
export type AccountAuthenticatedHandler = (account: ConnectedAccount) => void;
export type AccountRemovedHandler = (account: ConnectedAccount) => void;

/**
 * Persisted state structure for localStorage.
 */
export interface PersistedState {
  accounts: Array<{
    address: string;
    walletId: WalletId;
    isWatch: boolean;
    name?: string;
  }>;
  selectedAddress: string | null;
  selectedWalletId: WalletId | null;
}

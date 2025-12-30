/**
 * AVM Wallet - Svelte Wallet Connection Library
 *
 * @packageDocumentation
 */

// =============================================================================
// NEW API (v2)
// =============================================================================

// Main component (v2)
export { Web3Wallet } from "./components/index.js";

// Sub-components for advanced customization
export {
  WalletList,
  WalletItem,
  AccountList,
  AuthModal,
  WalletConnectModal,
} from "./components/index.js";

// State management
export { walletStore, uiStore, providerStore } from "./state/index.js";

// State types
export type {
  ConnectedAccount,
  ProviderConfig,
  UIState,
  AccountAddedHandler,
  AccountAuthenticatedHandler,
  AccountRemovedHandler,
} from "./state/index.js";

// Wallet adapters
export {
  registry,
  WalletRegistry,
  BaseWalletAdapter,
  PeraWalletAdapter,
  DeflyWalletAdapter,
  KibisisWalletAdapter,
  LuteWalletAdapter,
  WalletConnectAdapter,
  WatchWalletAdapter,
  createPeraAdapter,
  createDeflyAdapter,
  createKibisisAdapter,
  createLuteAdapter,
  createWalletConnectAdapter,
  createWatchAdapter,
  onWalletConnectModal,
} from "./adapters/index.js";

// Adapter types
export type {
  WalletAdapter,
  WalletAdapterConfig,
  WalletAccount,
  WalletId,
  SigningOptions,
  SignAndSendResult,
  WalletConnectConfig,
  WalletInfo,
  WalletConnectModalEvent,
  WalletConnectModalHandler,
} from "./adapters/index.js";

// =============================================================================
// LEGACY API (v1) - Deprecated, will be removed in v3
// =============================================================================

// Legacy component export (deprecated - use Web3Wallet instead)
export { default as Web3WalletLegacy } from "./Web3Wallet.svelte";

// Legacy store exports (deprecated - use walletStore instead)
export {
  selectedWallet,
  connectedWallets,
  setOnAddHandler,
  setOnAuthHandler,
  showWalletList,
} from "./store.js";

// Legacy wallet functions (deprecated - use adapters instead)
export {
  getSelectedWalletToken,
  signAndSendTransactions,
  signTransactions,
  Wallets as WalletOptions,
  verifyToken,
} from "./wallets.js";

// Legacy types
export type { WalletConnectionResult } from "./wallets.js";
export type { AVMWalletStore, SelectedWalletStore } from "./store.js";

// Legacy utilities
export { authenticateSelectedWallet } from "./utils.js";

// Legacy WalletConnect functions
export {
  clearSessions as clearWalletConnectSessions,
  forceReconnect as forceWalletConnectReconnect,
  debugWalletConnectState,
} from "./walletconnect.js";

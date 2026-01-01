// Types
export type {
  WalletAdapter,
  WalletAdapterConfig,
  WalletAdapterFactory,
  WalletAccount,
  WalletId,
  SigningOptions,
  SignAndSendResult,
  WalletConnectConfig,
  WalletEvent,
  WalletEventHandler,
} from "./types.js";

// Base adapter
export { BaseWalletAdapter } from "./base.js";

// Individual adapters
export { PeraWalletAdapter, createPeraAdapter } from "./pera.js";
export { DeflyWalletAdapter, createDeflyAdapter } from "./defly.js";
export { KibisisWalletAdapter, createKibisisAdapter } from "./kibisis.js";
export { LuteWalletAdapter, createLuteAdapter } from "./lute.js";
export { WatchWalletAdapter, createWatchAdapter } from "./watch.js";
export {
  WalletConnectAdapter,
  createWalletConnectAdapter,
  onWalletConnectModal,
  destroySharedProvider,
  type WalletConnectModalEvent,
  type WalletConnectModalHandler,
} from "./walletconnect.js";

// Registry
export { WalletRegistry, registry, type WalletInfo } from "./registry.js";

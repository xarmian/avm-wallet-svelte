import type {
  WalletAdapter,
  WalletAdapterConfig,
  WalletAdapterFactory,
  WalletId,
  WalletConnectConfig,
} from "./types.js";
import { createPeraAdapter } from "./pera.js";
import { createDeflyAdapter } from "./defly.js";
import { createKibisisAdapter } from "./kibisis.js";
import { createLuteAdapter } from "./lute.js";
import { createWalletConnectAdapter, WalletConnectAdapter } from "./walletconnect.js";
import { createWatchAdapter } from "./watch.js";

/**
 * Factory functions for each wallet type.
 */
const factories: Record<WalletId, WalletAdapterFactory> = {
  pera: createPeraAdapter,
  defly: createDeflyAdapter,
  kibisis: createKibisisAdapter,
  lute: createLuteAdapter,
  walletconnect: () => createWalletConnectAdapter("walletconnect"),
  biatec: () => createWalletConnectAdapter("biatec"),
  voiwallet: () => createWalletConnectAdapter("voiwallet"),
  watch: createWatchAdapter,
};

/**
 * Wallet metadata for display purposes.
 */
export interface WalletInfo {
  id: WalletId;
  name: string;
  icon: string;
  supportsAuth: boolean;
  isWatchOnly: boolean;
}

/**
 * Registry for managing wallet adapters.
 * Handles initialization and provides access to adapters.
 */
export class WalletRegistry {
  private adapters = new Map<WalletId, WalletAdapter>();
  private config: WalletAdapterConfig | null = null;
  private wcConfig: WalletConnectConfig | null = null;
  private enabledWallets: WalletId[] = [];

  /**
   * Initialize the registry with network configuration.
   * @param config - Network configuration
   * @param enabledWallets - List of wallet IDs to enable
   * @param wcConfig - Optional WalletConnect configuration
   */
  async initialize(
    config: WalletAdapterConfig,
    enabledWallets: WalletId[],
    wcConfig?: WalletConnectConfig
  ): Promise<void> {
    this.config = config;
    this.wcConfig = wcConfig ?? null;
    this.enabledWallets = enabledWallets;
    this.adapters.clear();

    for (const walletId of enabledWallets) {
      const factory = factories[walletId];
      if (!factory) {
        console.warn(`Unknown wallet ID: ${walletId}`);
        continue;
      }

      try {
        const adapter = factory();

        // Set WalletConnect config for WC-based adapters
        if (
          wcConfig &&
          (walletId === "walletconnect" || walletId === "biatec" || walletId === "voiwallet")
        ) {
          (adapter as WalletConnectAdapter).setWalletConnectConfig(wcConfig);
        }

        await adapter.initialize(config);
        this.adapters.set(walletId, adapter);
      } catch (error) {
        console.error(`Failed to initialize ${walletId} adapter:`, error);
      }
    }
  }

  /**
   * Get an adapter by wallet ID.
   */
  getAdapter(walletId: WalletId): WalletAdapter | undefined {
    return this.adapters.get(walletId);
  }

  /**
   * Get all initialized adapters.
   */
  getAllAdapters(): WalletAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get list of enabled wallet IDs.
   */
  getEnabledWalletIds(): WalletId[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get wallet info for all enabled wallets.
   */
  getWalletInfo(): WalletInfo[] {
    return Array.from(this.adapters.entries()).map(([id, adapter]) => ({
      id,
      name: adapter.name,
      icon: adapter.icon,
      supportsAuth: adapter.supportsAuth,
      isWatchOnly: adapter.isWatchOnly,
    }));
  }

  /**
   * Attempt to reconnect all wallets that support session restoration.
   * Returns accounts that were restored.
   */
  async reconnectAll(): Promise<Map<WalletId, import("./types.js").WalletAccount[]>> {
    const restored = new Map<WalletId, import("./types.js").WalletAccount[]>();

    for (const [walletId, adapter] of this.adapters) {
      try {
        const accounts = await adapter.reconnect();
        if (accounts && accounts.length > 0) {
          restored.set(walletId, accounts);
        }
      } catch (error) {
        console.debug(`Failed to reconnect ${walletId}:`, error);
      }
    }

    return restored;
  }

  /**
   * Disconnect all connected wallets.
   */
  async disconnectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.isConnected()) {
        try {
          await adapter.disconnect();
        } catch (error) {
          console.error(`Failed to disconnect ${adapter.name}:`, error);
        }
      }
    }
  }

  /**
   * Check if the registry has been initialized.
   */
  isInitialized(): boolean {
    return this.config !== null;
  }

  /**
   * Get the network configuration.
   */
  getConfig(): WalletAdapterConfig | null {
    return this.config;
  }
}

/**
 * Default registry instance.
 * Can be used directly or create custom instances.
 */
export const registry = new WalletRegistry();

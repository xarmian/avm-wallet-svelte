import type {
	WalletAdapter,
	WalletAdapterConfig,
	WalletAdapterFactory,
	WalletId,
	WalletConnectConfig
} from './types.js';
import { createPeraAdapter } from './pera.js';
import { createDeflyAdapter } from './defly.js';
import { createKibisisAdapter } from './kibisis.js';
import { createLuteAdapter } from './lute.js';
import { createWalletConnectAdapter, WalletConnectAdapter } from './walletconnect.js';
import { createWatchAdapter } from './watch.js';

/**
 * Factory functions for each wallet type.
 */
const factories: Record<WalletId, WalletAdapterFactory> = {
	pera: createPeraAdapter,
	defly: createDeflyAdapter,
	kibisis: createKibisisAdapter,
	lute: createLuteAdapter,
	walletconnect: () => createWalletConnectAdapter('walletconnect'),
	biatec: () => createWalletConnectAdapter('biatec'),
	voiwallet: () => createWalletConnectAdapter('voiwallet'),
	watch: createWatchAdapter
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
	private initPromise: Promise<void> | null = null;

	/**
	 * Initialize the registry with network configuration.
	 * If already initialized with compatible config, reuses existing adapters.
	 * Multiple concurrent calls will wait for the first initialization to complete.
	 * @param config - Network configuration
	 * @param enabledWallets - List of wallet IDs to enable
	 * @param wcConfig - Optional WalletConnect configuration
	 */
	async initialize(
		config: WalletAdapterConfig,
		enabledWallets: WalletId[],
		wcConfig?: WalletConnectConfig
	): Promise<void> {
		// If initialization is already in progress, wait for it
		if (this.initPromise) {
			await this.initPromise;
			// After waiting, check if the completed init is compatible
			if (this.isCompatibleConfig(config, enabledWallets, wcConfig)) {
				return;
			}
			// Config changed, need to reinitialize (will get new lock below)
		}

		// Check if we can reuse existing initialization
		if (this.isCompatibleConfig(config, enabledWallets, wcConfig)) {
			return;
		}

		// Start initialization with a lock
		this.initPromise = this.doInitialize(config, enabledWallets, wcConfig);
		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	/**
	 * Internal initialization logic.
	 */
	private async doInitialize(
		config: WalletAdapterConfig,
		enabledWallets: WalletId[],
		wcConfig?: WalletConnectConfig
	): Promise<void> {
		// Clean up existing adapters before reinitializing
		await this.destroy();

		this.config = config;
		this.wcConfig = wcConfig ?? null;
		this.enabledWallets = enabledWallets;

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
					(walletId === 'walletconnect' || walletId === 'biatec' || walletId === 'voiwallet')
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
	 * Check if the provided config is compatible with current initialization.
	 * Returns true if we can reuse existing adapters.
	 */
	private isCompatibleConfig(
		config: WalletAdapterConfig,
		enabledWallets: WalletId[],
		wcConfig?: WalletConnectConfig
	): boolean {
		if (!this.config) return false;

		// Check if network config matches (most important - determines which chain we're on)
		const configMatches =
			this.config.genesisHash === config.genesisHash &&
			this.config.genesisId === config.genesisId &&
			this.config.chainId === config.chainId;

		if (!configMatches) return false;

		// Check if enabled wallets are a subset of what we already have
		// (allow reuse if new instance requests fewer or same wallets)
		const hasAllWallets = enabledWallets.every((id) => this.adapters.has(id));
		if (!hasAllWallets) return false;

		// Check WalletConnect config if any WC wallets are enabled
		const wcWallets: WalletId[] = ['walletconnect', 'biatec', 'voiwallet'];
		const hasWcWallets = enabledWallets.some((id) => wcWallets.includes(id));
		if (hasWcWallets) {
			if (!wcConfig && !this.wcConfig) return true;
			if (!wcConfig || !this.wcConfig) return false;
			if (wcConfig.projectId !== this.wcConfig.projectId) return false;
		}

		return true;
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
			isWatchOnly: adapter.isWatchOnly
		}));
	}

	/**
	 * Attempt to reconnect all wallets that support session restoration.
	 * Returns accounts that were restored.
	 */
	async reconnectAll(): Promise<Map<WalletId, import('./types.js').WalletAccount[]>> {
		const restored = new Map<WalletId, import('./types.js').WalletAccount[]>();

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

	/**
	 * Clean up all adapters and reset the registry.
	 * Should be called before reinitializing or when the component unmounts.
	 */
	async destroy(): Promise<void> {
		// Call destroy on each adapter that supports it
		for (const adapter of this.adapters.values()) {
			try {
				if (adapter.destroy) {
					await adapter.destroy();
				} else if (adapter.isConnected()) {
					await adapter.disconnect();
				}
			} catch (error) {
				console.debug(`Failed to destroy ${adapter.name}:`, error);
			}
		}

		this.adapters.clear();
		this.config = null;
		this.wcConfig = null;
		this.enabledWallets = [];
	}
}

/**
 * Default registry instance.
 * Can be used directly or create custom instances.
 */
export const registry = new WalletRegistry();

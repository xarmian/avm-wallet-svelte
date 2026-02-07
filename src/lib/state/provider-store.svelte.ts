import type { Algodv2, Indexer } from 'algosdk';
import type { WalletConnectConfig } from '../adapters/types.js';

/**
 * Create the provider store for managing Algorand network clients.
 * Uses Svelte 5 runes for reactive state management.
 * @param scopeId - Scope identifier for identification purposes. Ephemeral store, no storage keys.
 */
export function createProviderStore(scopeId = 'default') {
	// State using $state rune
	let algodClient = $state<Algodv2 | null>(null);
	let indexerClient = $state<Indexer | null>(null);
	let wcConfig = $state<WalletConnectConfig | null>(null);
	let genesisHash = $state('');
	let genesisId = $state('');
	let chainId = $state('');
	let initialized = $state(false);

	return {
		// Getters
		get algodClient() {
			return algodClient;
		},
		get indexerClient() {
			return indexerClient;
		},
		get wcConfig() {
			return wcConfig;
		},
		get genesisHash() {
			return genesisHash;
		},
		get genesisId() {
			return genesisId;
		},
		get chainId() {
			return chainId;
		},
		get initialized() {
			return initialized;
		},

		/**
		 * Initialize the provider store with clients and fetch network info.
		 */
		async initialize(
			algod: Algodv2,
			indexer?: Indexer,
			walletConnectConfig?: WalletConnectConfig
		): Promise<void> {
			algodClient = algod;
			indexerClient = indexer ?? null;
			wcConfig = walletConnectConfig ?? null;

			// Fetch genesis info
			try {
				const genesisResponse = await algod.genesis().do();
				const genesis =
					typeof genesisResponse === 'string' ? JSON.parse(genesisResponse) : genesisResponse;

				genesisId = `${genesis.network}-${genesis.id}`;

				const params = await algod.getTransactionParams().do();
				const hashBuffer = Buffer.from(params.genesisHash);
				genesisHash = hashBuffer.toString('base64');

				// Chain ID for WalletConnect: algorand:{first32chars of hash with / replaced by _}
				chainId = `algorand:${genesisHash.substring(0, 32).replace(/\//g, '_')}`;

				initialized = true;
			} catch (error) {
				console.error('Failed to fetch genesis info:', error);
				throw error;
			}
		},

		/**
		 * Update the WalletConnect configuration.
		 */
		setWalletConnectConfig(config: WalletConnectConfig): void {
			wcConfig = config;
		},

		/**
		 * Check if required clients are available.
		 */
		requireClients(): { algodClient: Algodv2; indexerClient: Indexer | null } {
			if (!algodClient) {
				throw new Error('Algod client not initialized');
			}
			return { algodClient, indexerClient };
		},

		/**
		 * Reset the provider store.
		 */
		reset(): void {
			algodClient = null;
			indexerClient = null;
			wcConfig = null;
			genesisHash = '';
			genesisId = '';
			chainId = '';
			initialized = false;
		}
	};
}

/**
 * Singleton provider store instance.
 */
export const providerStore = createProviderStore();

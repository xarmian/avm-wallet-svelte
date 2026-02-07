import { UniversalProvider } from '@walletconnect/universal-provider';
import type { Transaction } from 'algosdk';

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
import algosdk from 'algosdk';
import { Buffer } from 'buffer';
import { BROWSER } from 'esm-env';
import type {
	WalletAdapter,
	WalletAdapterConfig,
	WalletAccount,
	SigningOptions,
	SignAndSendResult,
	WalletConnectConfig
} from './types.js';
import walletConnectIcon from '../icons/walletconnect-logo-black.svg';
import biatecIcon from '../icons/biatec_icon.svg';
import voiWalletIcon from '../icons/voi_wallet_icon.svg';

/**
 * Event emitter for WalletConnect modal control.
 * Components can subscribe to show/hide the QR modal.
 */
export type WalletConnectModalHandler = (event: WalletConnectModalEvent) => void;
export type WalletConnectModalEvent =
	| { type: 'show'; uri: string; walletName: string }
	| { type: 'hide' };

/**
 * Event emitter for session state changes.
 * Components can subscribe to handle session invalidation.
 */
export type SessionStateHandler = (event: SessionStateEvent) => void;
export type SessionStateEvent =
	| { type: 'expired'; walletId: string }
	| { type: 'deleted'; walletId: string }
	| { type: 'disconnected'; walletId: string };

/**
 * Scoped handler maps. Each scope gets its own modal and session handlers.
 */
const modalHandlers = new Map<string, WalletConnectModalHandler>();
const sessionStateHandlers = new Map<string, SessionStateHandler>();

/**
 * Register a handler for session state changes.
 * Use this to update UI when sessions expire or disconnect.
 * @param handler - The handler function
 * @param scopeId - Scope identifier (defaults to 'default')
 */
export function onSessionStateChange(
	handler: SessionStateHandler,
	scopeId = 'default'
): () => void {
	sessionStateHandlers.set(scopeId, handler);
	return () => {
		sessionStateHandlers.delete(scopeId);
	};
}

/**
 * Register a handler for WalletConnect modal events.
 * @param handler - The handler function
 * @param scopeId - Scope identifier (defaults to 'default')
 */
export function onWalletConnectModal(
	handler: WalletConnectModalHandler,
	scopeId = 'default'
): () => void {
	modalHandlers.set(scopeId, handler);
	return () => {
		modalHandlers.delete(scopeId);
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
			icons: wcConfig.icons
		}
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
			// @ts-expect-error removeAllListeners exists at runtime
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
			// @ts-expect-error removeAllListeners exists at runtime
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
	readonly id: 'walletconnect' | 'biatec' | 'voiwallet';
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
	private scopeId = 'default';

	constructor(variant: 'walletconnect' | 'biatec' | 'voiwallet' = 'walletconnect') {
		this.id = variant;

		switch (variant) {
			case 'biatec':
				this.name = 'Biatec Wallet';
				this.icon = biatecIcon;
				break;
			case 'voiwallet':
				this.name = 'Voi Wallet';
				this.icon = voiWalletIcon;
				break;
			default:
				this.name = 'WalletConnect';
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

	/**
	 * Set the scope ID for this adapter.
	 * Used to namespace localStorage keys and handler lookups.
	 */
	setScopeId(id: string): void {
		this.scopeId = id;
	}

	/**
	 * Get the scoped localStorage key for session owner.
	 */
	private get sessionOwnerKey(): string {
		return this.scopeId === 'default'
			? `wc-session-owner-${this.id}`
			: `wc-session-owner-${this.scopeId}-${this.id}`;
	}

	/**
	 * Get the scoped localStorage key for chain ID.
	 */
	private get chainIdKey(): string {
		return this.scopeId === 'default'
			? `wc-chainId-${this.id}`
			: `wc-chainId-${this.scopeId}-${this.id}`;
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
			throw new Error('WalletConnect adapter not initialized');
		}

		if (!this.wcConfig) {
			throw new Error('WalletConnect project configuration not set');
		}

		// Compute chain ID from genesis hash
		const hashPrefix = this.config.genesisHash.substring(0, 32).replace(/\//g, '_');
		this.chainId = `algorand:${hashPrefix}`;

		// Get shared provider singleton (prevents multiple WC Core initializations)
		this.provider = await getSharedProvider(this.wcConfig);

		// Subscribe to session events (remove first to prevent duplicates)
		this.provider.off('session_delete', this.handleSessionDelete);
		this.provider.on('session_delete', this.handleSessionDelete);

		// CRITICAL: Subscribe to session_expire - this is what fires when sessions timeout
		this.provider.off('session_expire', this.handleSessionExpire);
		this.provider.on('session_expire', this.handleSessionExpire);

		// Subscribe to page visibility changes to validate session on return
		if (BROWSER) {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}

		// Try to restore existing session
		await this.tryRestoreSession();

		this.initialized = true;
	}

	/**
	 * Handler for session deletion events.
	 * Bound as an instance method to allow proper removal.
	 */
	private handleSessionDelete = (args: { topic: string }): void => {
		// Only clear if the deleted session matches our session
		if (!this.session || (args?.topic && this.session.topic === args.topic)) {
			console.log(`[${this.id}:${this.scopeId}] Session deleted, topic:`, args?.topic);
			this.session = null;
			this._accounts = [];
			this.clearPersistedSession();
			sessionStateHandlers.get(this.scopeId)?.({ type: 'deleted', walletId: this.id });
		}
	};

	/**
	 * Handler for session expiration events.
	 * This is CRITICAL - WalletConnect sessions can expire due to:
	 * - Natural timeout (default 7 days)
	 * - Relay server issues
	 * - Wallet app disconnecting
	 */
	private handleSessionExpire = (args: { topic: string }): void => {
		console.log(`[${this.id}:${this.scopeId}] Session expired, topic:`, args?.topic);
		// Only clear if the expired session matches our session
		if (!this.session || (args?.topic && this.session.topic === args.topic)) {
			this.session = null;
			this._accounts = [];
			this.clearPersistedSession();
			sessionStateHandlers.get(this.scopeId)?.({ type: 'expired', walletId: this.id });
		}
	};

	/**
	 * Handler for display_uri events.
	 * Bound as an instance method to allow proper removal.
	 */
	private handleDisplayUri = (uri: string): void => {
		modalHandlers.get(this.scopeId)?.({ type: 'show', uri, walletName: this.name });
	};

	/**
	 * Handler for page visibility changes.
	 * Validates session when user returns to the page.
	 */
	private handleVisibilityChange = (): void => {
		if (document.visibilityState === 'visible' && this.session) {
			this.validateSession();
		}
	};

	/**
	 * Validate that the current session is still active.
	 * Called on visibility change and can be called proactively.
	 */
	async validateSession(): Promise<boolean> {
		if (!this.session || !this.provider) {
			return false;
		}

		// Check if our session topic still exists in the client's session store
		try {
			const allSessions = this.provider.client?.session?.getAll() ?? [];
			const found = allSessions.some((s: { topic: string }) => s.topic === this.session!.topic);
			if (!found) {
				console.log(
					`[${this.id}:${this.scopeId}] Session not found in client store during validation`
				);
				this.session = null;
				this._accounts = [];
				this.clearPersistedSession();
				sessionStateHandlers.get(this.scopeId)?.({ type: 'disconnected', walletId: this.id });
				return false;
			}
		} catch {
			// If we can't check sessions, fall back to provider.session check
			if (!this.provider!.session || this.provider!.session.topic !== this.session!.topic) {
				console.log(`[${this.id}:${this.scopeId}] Session mismatch detected during validation`);
				this.session = null;
				this._accounts = [];
				this.clearPersistedSession();
				sessionStateHandlers.get(this.scopeId)?.({ type: 'disconnected', walletId: this.id });
				return false;
			}
		}

		return true;
	}

	private async tryRestoreSession(): Promise<void> {
		if (!BROWSER || !this.provider) return;

		// Check for stored session owner
		const storedOwner = localStorage.getItem(this.sessionOwnerKey);
		if (storedOwner !== this.id) {
			console.log(
				`[${this.id}:${this.scopeId}] No stored session owner or mismatch: stored=${storedOwner}, expected=${this.id}`
			);
			return;
		}

		// Search all sessions for one matching this scope's chain ID
		let existingSession: WCSession | null = null;
		try {
			const allSessions = this.provider.client?.session?.getAll() ?? [];
			const storedChainId = localStorage.getItem(this.chainIdKey);

			for (const session of allSessions) {
				const algorandNs = session.namespaces?.['algorand'];
				if (!algorandNs) continue;

				const sessionChains = algorandNs.chains || [];
				const chainMatches =
					sessionChains.includes(this.chainId!) ||
					(storedChainId && sessionChains.includes(storedChainId));

				if (chainMatches) {
					existingSession = session as WCSession;
					break;
				}

				// Fallback: any algorand chain
				const hasAlgorandChain = sessionChains.some((c: string) => c.startsWith('algorand:'));
				if (hasAlgorandChain) {
					existingSession = session as WCSession;
					// Use session's chain ID
					const sessionChainId = sessionChains.find((c: string) => c.startsWith('algorand:'));
					if (sessionChainId) {
						this.chainId = sessionChainId;
						localStorage.setItem(this.chainIdKey, sessionChainId);
					}
					break;
				}
			}
		} catch {
			// Fallback to provider.session for older WC versions
			existingSession = this.provider.session as WCSession | null;
		}

		if (!existingSession) {
			console.log(`[${this.id}:${this.scopeId}] No existing session found`);
			return;
		}

		// Validate session has required Algorand namespace
		const algorandNs = existingSession.namespaces['algorand'];
		if (!algorandNs) {
			console.log(`[${this.id}:${this.scopeId}] Session missing algorand namespace`);
			await this.cleanupInvalidSession(existingSession);
			return;
		}

		if (!algorandNs.methods?.includes('algo_signTxn')) {
			console.log(`[${this.id}:${this.scopeId}] Session missing algo_signTxn method`);
			await this.cleanupInvalidSession(existingSession);
			return;
		}

		console.log(
			`[${this.id}:${this.scopeId}] Session restored successfully - topic: ${existingSession.topic}, accounts: ${algorandNs.accounts?.length || 0}`
		);
		this.session = existingSession;
		this._accounts = this.extractAccounts(algorandNs.accounts || []);
	}

	/**
	 * Clean up an invalid session.
	 */
	private async cleanupInvalidSession(session?: WCSession | null): Promise<void> {
		try {
			if (session && this.provider?.client) {
				// Disconnect specific session by topic
				await this.provider.client.disconnect({
					topic: session.topic,
					reason: { code: 6000, message: 'Invalid session' }
				});
			} else if (this.provider?.session) {
				await this.provider.disconnect();
			}
		} catch {
			// Ignore disconnect errors
		}
		this.clearPersistedSession();
	}

	private extractAccounts(wcAccounts: string[]): WalletAccount[] {
		return wcAccounts.map((account) => {
			const [, , address] = account.split(':');
			return { address };
		});
	}

	private persistSession(): void {
		if (!BROWSER) return;
		localStorage.setItem(this.sessionOwnerKey, this.id);
		// Also persist the chainId used for this session
		if (this.chainId) {
			localStorage.setItem(this.chainIdKey, this.chainId);
		}
	}

	private clearPersistedSession(): void {
		if (!BROWSER) return;
		localStorage.removeItem(this.sessionOwnerKey);
		localStorage.removeItem(this.chainIdKey);
	}

	async connect(): Promise<WalletAccount[]> {
		if (!BROWSER) {
			throw new Error('WalletConnect is only available in browser environments');
		}

		await this.ensureInitialized();

		if (!this.provider) {
			throw new Error('WalletConnect provider not initialized');
		}

		// If we have a valid session, return existing accounts
		if (this.session && this._accounts.length > 0) {
			return this._accounts;
		}

		// Only disconnect sessions owned by THIS scope
		// Check if the current provider session belongs to us
		if (this.provider.session) {
			const ownerKey = this.sessionOwnerKey;
			const storedOwner = localStorage.getItem(ownerKey);
			if (storedOwner === this.id) {
				// This scope's session — disconnect it to make a new one
				try {
					await this.provider.client?.disconnect({
						topic: this.provider.session.topic,
						reason: { code: 6000, message: 'Reconnecting' }
					});
				} catch {
					// Ignore disconnect errors
				}
			}
			// If storedOwner !== this.id, another scope owns the session — leave it alone
			this.session = null;
			this._accounts = [];
		}

		// Set up URI display handler (remove first to prevent duplicates)
		this.provider.off('display_uri', this.handleDisplayUri);
		this.provider.on('display_uri', this.handleDisplayUri);

		// Connect with required namespaces
		const connectParams = {
			namespaces: {
				algorand: {
					chains: [this.chainId!],
					methods: ['algo_signTxn'],
					events: [] as string[]
				}
			}
		};

		try {
			const sessionData = await this.provider.connect(connectParams);

			// Hide modal after connection attempt
			modalHandlers.get(this.scopeId)?.({ type: 'hide' });

			if (!sessionData) {
				throw new Error('Failed to establish WalletConnect session');
			}

			this.session = sessionData as WCSession;
			this.persistSession();

			const algorandNs = sessionData.namespaces['algorand'];
			this._accounts = this.extractAccounts(algorandNs?.accounts || []);

			return this._accounts;
		} catch (error) {
			modalHandlers.get(this.scopeId)?.({ type: 'hide' });
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
			// Disconnect only this specific session by topic
			if (this.session && this.provider?.client) {
				try {
					await this.provider.client.disconnect({
						topic: this.session.topic,
						reason: { code: 6000, message: 'User disconnected' }
					});
				} catch {
					// Fallback to provider.disconnect if client.disconnect fails
					if (this.provider?.session?.topic === this.session.topic) {
						await this.provider.disconnect();
					}
				}
			} else if (this.provider?.session) {
				await this.provider.disconnect();
			}
		} finally {
			this.session = null;
			this._accounts = [];
			this.clearPersistedSession();
			modalHandlers.get(this.scopeId)?.({ type: 'hide' });
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
			throw new Error('No active WalletConnect session');
		}

		// Validate session is still active
		const isValid = await this.validateSession();
		if (!isValid) {
			throw new Error('WalletConnect session is no longer active. Please reconnect.');
		}

		// Prepare transactions for signing
		const txnsToSign = transactions.flat().map((txn) => ({
			txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'),
			message: 'Transaction to sign'
		}));

		const requestPayload = {
			method: 'algo_signTxn',
			params: [txnsToSign]
		};

		const result = await this.provider.request(requestPayload, this.chainId!);

		// Convert results to Uint8Array
		return (result as (string | null)[]).map((signedTxn) =>
			signedTxn ? new Uint8Array(Buffer.from(signedTxn, 'base64')) : new Uint8Array(0)
		);
	}

	async signAndSendTransactions(
		transactions: Transaction[][],
		options?: SigningOptions
	): Promise<SignAndSendResult> {
		if (!this.config) {
			throw new Error('WalletConnect adapter not initialized');
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
				throw new Error('No signed transactions matched the original group');
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
			throw new Error('WalletConnect adapter not initialized');
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
				minFee: params.minFee
			},
			sender: address,
			receiver: address,
			amount: 0,
			note
		});

		const signed = await this.signTransactions([[authTx]]);

		if (!signed[0]) {
			throw new Error('Failed to sign authentication transaction');
		}

		return Buffer.from(signed[0]).toString('base64');
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
				if (key && (key.startsWith('wc@2:') || key.startsWith('@walletconnect/'))) {
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
			this.provider.off('session_delete', this.handleSessionDelete);
			this.provider.off('session_expire', this.handleSessionExpire);
			this.provider.off('display_uri', this.handleDisplayUri);
		}

		// Remove visibility change listener
		if (BROWSER) {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
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
	variant: 'walletconnect' | 'biatec' | 'voiwallet' = 'walletconnect'
): WalletConnectAdapter {
	return new WalletConnectAdapter(variant);
}

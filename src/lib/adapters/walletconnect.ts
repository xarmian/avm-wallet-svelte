import { UniversalProvider } from '@walletconnect/universal-provider';
import type { Transaction } from 'algosdk';

/**
 * WalletConnect session structure.
 * Simplified interface matching the UniversalProvider session.
 */
interface WCSession {
	topic: string;
	expiry?: number;
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
 * localStorage keys that track which adapter owns which session in the shared SignClient.
 * Each key is suffixed with `<id>` (default scope) or `<scopeId>-<id>`. A session is an
 * adapter's only when its topic is recorded under that adapter's topic key.
 */
const OWNER_PREFIX = 'wc-session-owner-';
const TOPIC_PREFIX = 'wc-session-topic-';
const CHAIN_PREFIX = 'wc-chainId-';
/** Owner key written by 0.9.x (no scopes), valued with the 0.9.x wallet name. */
const LEGACY_OWNER_KEY = 'wc-session-owner';
const LEGACY_OWNER_IDS: Record<string, string> = {
	VoiWallet: 'voiwallet',
	BiatecWallet: 'biatec',
	WalletConnect: 'walletconnect'
};
/** JSON array of topics no adapter could be credited with; never adopted or deleted. */
const QUARANTINE_KEY = `${TOPIC_PREFIX}unattributed`;
/** UniversalProvider's per-topic storage prefix. */
const PROVIDER_STORAGE = 'wc@2:universal_provider:/';

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
	/** Chain derived from the configured genesis hash; a fresh connect always proposes it. */
	private configChainId: string | null = null;
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
		return OWNER_PREFIX + this.keySuffix;
	}

	/**
	 * Get the scoped localStorage key for chain ID.
	 */
	private get chainIdKey(): string {
		return CHAIN_PREFIX + this.keySuffix;
	}

	/**
	 * Get the scoped localStorage key recording the topic of this adapter's session.
	 */
	private get sessionTopicKey(): string {
		return TOPIC_PREFIX + this.keySuffix;
	}

	private get keySuffix(): string {
		return this.scopeId === 'default' ? this.id : `${this.scopeId}-${this.id}`;
	}

	/** Whether the 0.9.x owner key names this wallet (0.9.x had only the default scope). */
	private legacyOwnerIsSelf(): boolean {
		const legacy = localStorage.getItem(LEGACY_OWNER_KEY);
		return this.scopeId === 'default' && !!legacy && LEGACY_OWNER_IDS[legacy] === this.id;
	}

	private isStored(topic: string): boolean {
		return this.storedSessions()?.some((s) => s.topic === topic) ?? true;
	}

	/** Sessions in the shared SignClient, or null when the store cannot be read. */
	private storedSessions(): WCSession[] | null {
		try {
			return (this.provider?.client?.session?.getAll() ?? []) as WCSession[];
		} catch {
			return null;
		}
	}

	/** Quarantined topics still stored; the stored list is pruned of the others. */
	private readQuarantine(stored: Set<string>): string[] {
		let list: unknown = [];
		try {
			list = JSON.parse(localStorage.getItem(QUARANTINE_KEY) ?? '[]');
		} catch {
			// A corrupt list quarantines nothing
		}
		const kept = Array.isArray(list) ? list.filter((t) => stored.has(t)) : [];
		if (kept.length > 0) localStorage.setItem(QUARANTINE_KEY, JSON.stringify(kept));
		else localStorage.removeItem(QUARANTINE_KEY);
		return kept;
	}

	/**
	 * One-time attribution of unrecorded sessions: algorand sessions whose topic no topic key
	 * records and that are not quarantined (left by versions that did not record topics).
	 * - A 0.9.x owner key next to any 3.x owner key is stale and is deleted.
	 * - If exactly one owner claim exists (a 3.x owner key, or the 0.9.x key naming a wallet)
	 *   and no topic is recorded, that claim's adapter adopts the newest eligible unrecorded
	 *   session, records it and prunes the other unrecorded sessions.
	 * - Otherwise nobody can tell whose they are: quarantine them all and adopt none.
	 */
	private async attributeUnrecorded(sessions: WCSession[]): Promise<void> {
		const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
		const owners = keys.filter((k) => k.startsWith(OWNER_PREFIX));
		if (owners.length > 0) localStorage.removeItem(LEGACY_OWNER_KEY);
		const legacy = !!LEGACY_OWNER_IDS[localStorage.getItem(LEGACY_OWNER_KEY) ?? ''];
		const recorded = new Set(
			keys
				.filter((k) => k.startsWith(TOPIC_PREFIX) && k !== QUARANTINE_KEY)
				.map((k) => localStorage.getItem(k))
		);
		const quarantine = this.readQuarantine(new Set(sessions.map((s) => s.topic)));
		const unrecorded = sessions.filter(
			(s) => s.namespaces?.['algorand'] && !recorded.has(s.topic) && !quarantine.includes(s.topic)
		);
		if (unrecorded.length === 0) return;

		if (owners.length + (legacy ? 1 : 0) === 1 && recorded.size === 0) {
			// The sole claim's adapter adopts; every other adapter leaves them to it
			if (owners[0] !== this.sessionOwnerKey && !(legacy && this.legacyOwnerIsSelf())) return;
			const eligible = unrecorded.filter(
				(s) => this.isOnThisChain(s) && s.namespaces['algorand'].methods?.includes('algo_signTxn')
			);
			if (eligible.length === 0) return;
			// Newest: largest expiry, ties go to the last stored
			const newest = eligible.reduce((best, s) =>
				(s.expiry ?? 0) >= (best.expiry ?? 0) ? s : best
			);
			localStorage.setItem(this.sessionTopicKey, newest.topic);
			localStorage.setItem(this.sessionOwnerKey, this.id);
			localStorage.removeItem(LEGACY_OWNER_KEY);
			for (const s of unrecorded) {
				if (s !== newest) await this.removeTopic(s.topic, 'Stale session');
			}
			return;
		}

		console.log(
			`[${this.id}:${this.scopeId}] Quarantining ${unrecorded.length} unattributed sessions`
		);
		localStorage.setItem(
			QUARANTINE_KEY,
			JSON.stringify([...quarantine, ...unrecorded.map((s) => s.topic)])
		);
	}

	private isOnThisChain(session: WCSession): boolean {
		const chains = session.namespaces?.['algorand']?.chains ?? [];
		const storedChainId = localStorage.getItem(this.chainIdKey);
		return chains.includes(this.chainId!) || (!!storedChainId && chains.includes(storedChainId));
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
		this.configChainId = `algorand:${hashPrefix}`;
		this.chainId = this.configChainId;

		// Get shared provider singleton (prevents multiple WC Core initializations)
		this.provider = await getSharedProvider(this.wcConfig);

		// Subscribe to session events on the SignClient (remove first to prevent duplicates).
		// UniversalProvider never forwards session_expire and only forwards session_delete
		// for its own session, so listen on the client, which emits both for every topic.
		const client = this.provider.client;
		client.off('session_delete', this.handleSessionDelete);
		client.on('session_delete', this.handleSessionDelete);
		client.off('session_expire', this.handleSessionExpire);
		client.on('session_expire', this.handleSessionExpire);

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
		if (this.session && args?.topic && this.session.topic === args.topic) {
			// sign-client deletes an expired session (emitting session_delete) before it emits
			// session_expire, so report a session past its expiry as expired here.
			const expiry = this.session.expiry;
			const expired = expiry !== undefined && expiry <= Date.now() / 1000;
			console.log(
				`[${this.id}:${this.scopeId}] Session ${expired ? 'expired' : 'deleted'}, topic:`,
				args.topic
			);
			this.session = null;
			this._accounts = [];
			this.clearPersistedSession();
			sessionStateHandlers.get(this.scopeId)?.({
				type: expired ? 'expired' : 'deleted',
				walletId: this.id
			});
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
		if (this.session && args?.topic && this.session.topic === args.topic) {
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

		const sessions = this.storedSessions();
		if (sessions) await this.attributeUnrecorded(sessions);

		// Only the session recorded under this adapter's topic key is ours
		const mine = localStorage.getItem(this.sessionTopicKey);
		if (!mine) {
			console.log(`[${this.id}:${this.scopeId}] No recorded session`);
			return;
		}
		if (localStorage.getItem(this.sessionOwnerKey) !== this.id) {
			// A topic recorded without an owner key is a session whose removal did not go
			// through (a disconnect or cleanup while offline): retry it rather than restore it
			console.log(`[${this.id}:${this.scopeId}] Retrying removal of a disconnected session`);
			if (!this.isStored(mine) || (await this.removeTopic(mine, 'User disconnected'))) {
				localStorage.removeItem(this.sessionTopicKey);
			}
			return;
		}
		const existingSession =
			(sessions ?? [this.provider.session as WCSession | null]).find((s) => s?.topic === mine) ??
			null;
		if (!existingSession) {
			// Forget a recorded session that is gone and wait for connect()
			console.log(`[${this.id}:${this.scopeId}] Recorded session no longer stored`);
			if (sessions) this.clearPersistedSession();
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

		// Sign with a chain the session holds: the stored chain, else the session's own
		const chains = algorandNs.chains ?? [];
		if (!chains.includes(this.chainId!)) {
			const storedChainId = localStorage.getItem(this.chainIdKey);
			const sessionChainId =
				storedChainId && chains.includes(storedChainId)
					? storedChainId
					: chains.find((c) => c.startsWith('algorand:'));
			if (sessionChainId) this.chainId = sessionChainId;
		}

		console.log(
			`[${this.id}:${this.scopeId}] Session restored successfully - topic: ${existingSession.topic}, accounts: ${algorandNs.accounts?.length || 0}`
		);
		this.session = existingSession;
		this._accounts = this.extractAccounts(algorandNs.accounts || []);

		// Record the session (owner, chain and topic)
		this.persistSession();
	}

	/**
	 * Disconnect a session by topic. The provider's own session goes through
	 * provider.disconnect() so UniversalProvider clears its session, namespaces and pairings.
	 */
	private async disconnectTopic(topic: string, message: string): Promise<void> {
		const provider = this.provider!;
		if (provider.session?.topic === topic) {
			await provider.disconnect();
			return;
		}
		await provider.client.disconnect({ topic, reason: { code: 6000, message } });
		try {
			for (const key of ['namespaces', 'optionalNamespaces', 'sessionProperties']) {
				await provider.client.core.storage.removeItem(`${PROVIDER_STORAGE}${key}${topic}`);
			}
		} catch {
			// The session is gone; leftover provider keys are harmless
		}
	}

	/** Best-effort removal of a session; true once it is gone from the store. */
	private async removeTopic(topic: string, message: string): Promise<boolean> {
		try {
			console.log(`[${this.id}:${this.scopeId}] Removing session - topic: ${topic}`);
			await this.disconnectTopic(topic, message);
			return true;
		} catch (error) {
			console.warn(`[${this.id}:${this.scopeId}] Failed to remove session ${topic}:`, error);
			return !this.isStored(topic);
		}
	}

	/**
	 * Remove this adapter's recorded session before pairing a new one. The topic stays
	 * recorded while the session is still stored, so a later connect() retries.
	 */
	private async removeOwnedSessions(): Promise<void> {
		const mine = localStorage.getItem(this.sessionTopicKey);
		if (mine && this.isStored(mine) && !(await this.removeTopic(mine, 'Reconnecting'))) return;
		localStorage.removeItem(this.sessionTopicKey);
	}

	/** Remove an invalid recorded session, keeping its topic recorded until the removal took. */
	private async cleanupInvalidSession(session: WCSession): Promise<void> {
		const removed = await this.removeTopic(session.topic, 'Invalid session');
		this.clearPersistedSession(!removed);
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
		if (this.session) {
			localStorage.setItem(this.sessionTopicKey, this.session.topic);
		}
	}

	private clearPersistedSession(keepTopic = false): void {
		this.chainId = this.configChainId;
		if (!BROWSER) return;
		localStorage.removeItem(this.sessionOwnerKey);
		localStorage.removeItem(this.chainIdKey);
		if (!keepTopic) localStorage.removeItem(this.sessionTopicKey);
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

		// Remove this adapter's recorded session so a reconnect leaves exactly one.
		// Sessions recorded by other adapters or scopes, or quarantined, are left alone.
		await this.removeOwnedSessions();
		this.session = null;
		this._accounts = [];
		this.chainId = this.configChainId;

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

		// A topic still recorded here is a session whose removal failed; keep it on failure
		const keepTopic = localStorage.getItem(this.sessionTopicKey) !== null;

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
			this.clearPersistedSession(keepTopic);
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
		// Before a restore there is no provider yet; initialize so a recorded session is removed
		if (BROWSER && !this.provider && localStorage.getItem(this.sessionTopicKey)) {
			await this.ensureInitialized().catch(() => {});
		}

		// Disconnect only this adapter's session: the restored one, else a recorded one still
		// stored. Without either, only clear our state (other sessions belong to other adapters).
		let topic = this.session?.topic ?? null;
		if (!topic && BROWSER) {
			const mine = localStorage.getItem(this.sessionTopicKey);
			if (mine && this.isStored(mine)) topic = mine;
		}
		const removed =
			!topic || !this.provider?.client || (await this.removeTopic(topic, 'User disconnected'));

		// Keep the topic recorded while its session is still stored, so connect() retries
		if (!removed) localStorage.setItem(this.sessionTopicKey, topic!);
		this.session = null;
		this._accounts = [];
		this.clearPersistedSession(!removed);
		modalHandlers.get(this.scopeId)?.({ type: 'hide' });
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

		// Send on the adapter's own session. provider.request() would use the provider's
		// session, which after a reload is the oldest stored session, not necessarily ours.
		const result = await this.provider.client.request<(string | null)[]>({
			topic: this.session.topic,
			chainId: this.chainId!,
			request: requestPayload
		});

		// Convert results to Uint8Array
		return result.map((signedTxn) =>
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
			this.provider.client?.off('session_delete', this.handleSessionDelete);
			this.provider.client?.off('session_expire', this.handleSessionExpire);
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

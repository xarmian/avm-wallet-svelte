import { createWalletStore, walletStore as defaultWalletStore } from './wallet-store.svelte.js';
import {
	createProviderStore,
	providerStore as defaultProviderStore
} from './provider-store.svelte.js';
import {
	createUIStore,
	uiStore as defaultUiStore,
	uiState as defaultUiState
} from './ui-store.svelte.js';
import { WalletRegistry, registry as defaultRegistry } from '../adapters/registry.js';

/**
 * Svelte context key for the wallet scope.
 */
export const SCOPE_CONTEXT_KEY = Symbol('avm-wallet-scope');

/**
 * A scoped bundle of wallet store, provider store, UI store, and registry.
 * Each scope represents an independent chain connection.
 */
export interface WalletScope {
	readonly scopeId: string;
	readonly walletStore: ReturnType<typeof createWalletStore>;
	readonly providerStore: ReturnType<typeof createProviderStore>;
	readonly uiState: ReturnType<typeof createUIStore>['uiState'];
	readonly uiStore: ReturnType<typeof createUIStore>['uiStore'];
	readonly registry: WalletRegistry;
}

/**
 * Module-level scope registry for programmatic access.
 * Uses $state for Svelte 5 reactivity so getScope() is tracked in templates.
 */
const activeScopes = $state(new Map<string, WalletScope>());
const scopeRefCounts = new Map<string, number>();

/**
 * Create a new wallet scope with isolated stores and registry.
 * For the 'default' scope, reuses the module-level singleton stores and registry
 * to maintain backward compatibility with direct singleton imports.
 * @param scopeId - Unique identifier for this scope (e.g., 'voi', 'algorand').
 */
export function createWalletScope(scopeId = 'default'): WalletScope {
	// Default scope reuses the module-level singletons so that consumers
	// importing `walletStore` etc. directly get the same instances.
	if (scopeId === 'default') {
		return {
			scopeId: 'default',
			walletStore: defaultWalletStore,
			providerStore: defaultProviderStore,
			uiState: defaultUiState,
			uiStore: defaultUiStore,
			registry: defaultRegistry
		};
	}

	const walletStore = createWalletStore(scopeId);
	const providerStore = createProviderStore(scopeId);
	const { uiState, uiStore } = createUIStore(scopeId);
	const registry = new WalletRegistry(scopeId);

	return {
		scopeId,
		walletStore,
		providerStore,
		uiState,
		uiStore,
		registry
	};
}

/**
 * Get an active scope by ID.
 * Reactive in Svelte 5 templates (backed by $state).
 */
export function getScope(scopeId: string): WalletScope | undefined {
	return activeScopes.get(scopeId);
}

/**
 * Register a scope in the active scopes registry.
 * Uses reference counting so multiple components sharing the same scope
 * won't cause premature removal on destroy.
 */
export function registerScope(scope: WalletScope): void {
	activeScopes.set(scope.scopeId, scope);
	scopeRefCounts.set(scope.scopeId, (scopeRefCounts.get(scope.scopeId) ?? 0) + 1);
}

/**
 * Unregister a scope from the active scopes registry.
 * Only removes the scope when the last component using it is destroyed.
 */
export function unregisterScope(scopeId: string): void {
	const count = (scopeRefCounts.get(scopeId) ?? 1) - 1;
	if (count <= 0) {
		activeScopes.delete(scopeId);
		scopeRefCounts.delete(scopeId);
	} else {
		scopeRefCounts.set(scopeId, count);
	}
}

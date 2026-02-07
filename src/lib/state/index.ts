// Types
export type {
	ConnectedAccount,
	ProviderConfig,
	UIState,
	AccountAddedHandler,
	AccountAuthenticatedHandler,
	AccountRemovedHandler,
	PersistedState
} from './types.js';

export type { ViewState } from './ui-store.svelte.js';

// Stores (singletons for backward compat)
export { walletStore, createWalletStore } from './wallet-store.svelte.js';
export { uiStore, uiState, createUIStore } from './ui-store.svelte.js';
export { providerStore, createProviderStore } from './provider-store.svelte.js';

// Scope management
export {
	createWalletScope,
	getScope,
	registerScope,
	unregisterScope,
	SCOPE_CONTEXT_KEY
} from './scope.svelte.js';
export type { WalletScope } from './scope.svelte.js';

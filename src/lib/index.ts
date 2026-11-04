/**
 * AVM Wallet - Svelte Wallet Connection Library
 *
 * @packageDocumentation
 */

// =============================================================================
// NEW API (v2)
// =============================================================================

// Main component (v2)
export { Web3Wallet } from './components/index.js';

// Sub-components for advanced customization
export {
	AccountSelector,
	AccountRow,
	AddAccountView,
	WalletProviderRow,
	AuthModal,
	WalletConnectModal
} from './components/index.js';

// State management (singletons for backward compat)
export { walletStore, uiStore, uiState, providerStore } from './state/index.js';

// Store factories
export { createWalletStore } from './state/index.js';
export { createProviderStore } from './state/index.js';
export { createUIStore } from './state/index.js';

// Scope management
export {
	createWalletScope,
	getScope,
	registerScope,
	unregisterScope,
	SCOPE_CONTEXT_KEY
} from './state/index.js';
export type { WalletScope } from './state/index.js';

// Explicit signer API
export {
	createSigning,
	SIGNER_API_VERSION,
	SignerDisconnectedError,
	SignerTransactionMismatchError,
	SignerWatchOnlyError,
	SignerResultMismatchError,
	SignerSubmissionError
} from './signing.js';
export type {
	TransactionSigner,
	SignOptions,
	SubmissionGroupState,
	SubmissionGroupStatus
} from './signing.js';

// State types
export type {
	ConnectedAccount,
	ProviderConfig,
	UIState,
	ViewState,
	AccountAddedHandler,
	AccountAuthenticatedHandler,
	AccountRemovedHandler
} from './state/index.js';

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
	onSessionStateChange
} from './adapters/index.js';

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
	SessionStateEvent,
	SessionStateHandler
} from './adapters/index.js';

export { verifyToken } from './verify.js';
export { signTransactions, signAndSendTransactions } from './default-signing.js';

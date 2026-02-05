/**
 * UI Store for managing modal and dropdown visibility.
 * Uses Svelte 5 runes for reactive state management.
 */

export type ViewState = 'selector' | 'add-account';

/**
 * Reactive UI state - exported directly for Svelte 5 reactivity.
 * Access these properties directly in templates for automatic tracking.
 */
export const uiState = $state({
	showWalletList: false,
	targetInstance: null as string | null,
	currentView: 'selector' as ViewState,
	authModal: { show: false, address: '', error: '' },
	wcModal: { show: false, uri: '', walletName: '' }
});

/**
 * UI store with actions for modifying state.
 */
export const uiStore = {
	// Wallet list actions
	toggleWalletList(instanceId?: string): void {
		console.log(
			'[uiStore] toggleWalletList called, current:',
			uiState.showWalletList,
			'instance:',
			instanceId
		);
		uiState.showWalletList = !uiState.showWalletList;
		uiState.targetInstance = instanceId ?? null;
		// Reset to selector view when opening
		if (uiState.showWalletList) {
			uiState.currentView = 'selector';
		}
		console.log('[uiStore] toggleWalletList done, new:', uiState.showWalletList);
	},

	openWalletList(instanceId?: string): void {
		uiState.showWalletList = true;
		uiState.targetInstance = instanceId ?? null;
		uiState.currentView = 'selector';
	},

	closeWalletList(): void {
		uiState.showWalletList = false;
		uiState.targetInstance = null;
		uiState.currentView = 'selector';
	},

	// View navigation
	showAddAccount(): void {
		uiState.currentView = 'add-account';
	},

	showSelector(): void {
		uiState.currentView = 'selector';
	},

	// Auth modal actions
	showAuthModal(address: string): void {
		uiState.authModal = { show: true, address, error: '' };
	},

	setAuthError(error: string): void {
		uiState.authModal = { ...uiState.authModal, error };
	},

	clearAuthError(): void {
		uiState.authModal = { ...uiState.authModal, error: '' };
	},

	closeAuthModal(): void {
		uiState.authModal = { show: false, address: '', error: '' };
	},

	// WalletConnect modal actions
	showWalletConnectModal(uri: string, walletName: string): void {
		// Close the wallet list when showing WalletConnect QR modal
		uiState.showWalletList = false;
		uiState.wcModal = { show: true, uri, walletName };
	},

	closeWalletConnectModal(): void {
		uiState.wcModal = { show: false, uri: '', walletName: '' };
	},

	// Close all modals
	closeAll(): void {
		uiState.showWalletList = false;
		uiState.targetInstance = null;
		uiState.currentView = 'selector';
		uiState.authModal = { show: false, address: '', error: '' };
		uiState.wcModal = { show: false, uri: '', walletName: '' };
	},

	// Getters for backward compatibility
	get showWalletList() {
		return uiState.showWalletList;
	},
	get targetInstance() {
		return uiState.targetInstance;
	},
	get currentView() {
		return uiState.currentView;
	},
	get authModal() {
		return uiState.authModal;
	},
	get wcModal() {
		return uiState.wcModal;
	}
};

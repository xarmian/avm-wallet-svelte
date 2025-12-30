/**
 * UI Store for managing modal and dropdown visibility.
 * Uses Svelte 5 runes for reactive state management.
 */
function createUIStore() {
  // State using $state rune
  let showWalletList = $state(false);
  let authModal = $state({ show: false, address: "", error: "" });
  let wcModal = $state({ show: false, uri: "", walletName: "" });

  return {
    // Getters
    get showWalletList() {
      return showWalletList;
    },
    get authModal() {
      return authModal;
    },
    get wcModal() {
      return wcModal;
    },

    // Wallet list actions
    toggleWalletList(): void {
      showWalletList = !showWalletList;
    },

    openWalletList(): void {
      showWalletList = true;
    },

    closeWalletList(): void {
      showWalletList = false;
    },

    // Auth modal actions
    showAuthModal(address: string): void {
      authModal = { show: true, address, error: "" };
    },

    setAuthError(error: string): void {
      authModal = { ...authModal, error };
    },

    clearAuthError(): void {
      authModal = { ...authModal, error: "" };
    },

    closeAuthModal(): void {
      authModal = { show: false, address: "", error: "" };
    },

    // WalletConnect modal actions
    showWalletConnectModal(uri: string, walletName: string): void {
      wcModal = { show: true, uri, walletName };
    },

    closeWalletConnectModal(): void {
      wcModal = { show: false, uri: "", walletName: "" };
    },

    // Close all modals
    closeAll(): void {
      showWalletList = false;
      authModal = { show: false, address: "", error: "" };
      wcModal = { show: false, uri: "", walletName: "" };
    },
  };
}

/**
 * Singleton UI store instance.
 */
export const uiStore = createUIStore();

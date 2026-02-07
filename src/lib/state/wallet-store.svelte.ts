import { BROWSER } from 'esm-env';
import Cookies from 'js-cookie';
import type { WalletId } from '../adapters/types.js';
import type {
	ConnectedAccount,
	PersistedState,
	AccountAddedHandler,
	AccountAuthenticatedHandler,
	AccountRemovedHandler
} from './types.js';

/**
 * Create the wallet store.
 * Uses Svelte 5 runes for reactive state management.
 * @param scopeId - Scope identifier for storage key namespacing. 'default' preserves existing keys.
 */
export function createWalletStore(scopeId = 'default') {
	const STORAGE_KEY = scopeId === 'default' ? 'avm-wallet-state' : `avm-wallet-state-${scopeId}`;
	const TOKEN_PREFIX =
		scopeId === 'default' ? 'avm-wallet-token-' : `avm-wallet-token-${scopeId}-`;

	/**
	 * Load persisted state from localStorage.
	 */
	function loadPersistedState(): PersistedState | null {
		if (!BROWSER) return null;

		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				return JSON.parse(stored);
			}
		} catch (e) {
			console.warn('Failed to load persisted wallet state:', e);
		}
		return null;
	}

	/**
	 * Save state to localStorage.
	 */
	function persistState(state: PersistedState): void {
		if (!BROWSER) return;

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch (e) {
			console.warn('Failed to persist wallet state:', e);
		}
	}

	// Load initial state
	const persisted = loadPersistedState();

	// Core state using $state rune
	let accounts = $state<ConnectedAccount[]>([]);
	let selectedAccount = $state<ConnectedAccount | null>(null);
	let initialized = $state(false);
	let loading = $state(false);

	// Restore persisted accounts (without auth status - tokens are in cookies)
	if (persisted?.accounts) {
		accounts = persisted.accounts.map((a) => ({
			address: a.address,
			walletId: a.walletId,
			isWatch: a.isWatch,
			name: a.name,
			networkId: a.networkId,
			authenticated: hasValidToken(a.address)
		}));

		// Restore selected account
		if (persisted.selectedAddress && persisted.selectedWalletId) {
			selectedAccount =
				accounts.find(
					(a) =>
						a.address === persisted.selectedAddress && a.walletId === persisted.selectedWalletId
				) ?? null;
		}
	}

	// Event handlers
	let onAccountAdded: AccountAddedHandler | null = null;
	let onAccountAuthenticated: AccountAuthenticatedHandler | null = null;
	let onAccountRemoved: AccountRemovedHandler | null = null;

	/**
	 * Check if an address has a valid auth token.
	 */
	function hasValidToken(address: string): boolean {
		if (!BROWSER) return false;
		const token = Cookies.get(`${TOKEN_PREFIX}${address}`);
		return !!token;
	}

	/**
	 * Persist current state to localStorage.
	 */
	function persist(): void {
		persistState({
			accounts: accounts.map((a) => ({
				address: a.address,
				walletId: a.walletId,
				isWatch: a.isWatch,
				name: a.name,
				networkId: a.networkId
			})),
			selectedAddress: selectedAccount?.address ?? null,
			selectedWalletId: selectedAccount?.walletId ?? null
		});
	}

	return {
		// Getters for reactive state
		get accounts() {
			return accounts;
		},
		get selectedAccount() {
			return selectedAccount;
		},
		get initialized() {
			return initialized;
		},
		get loading() {
			return loading;
		},

		// Derived getters
		get connectedWalletIds(): WalletId[] {
			return [...new Set(accounts.map((a) => a.walletId))];
		},

		get authenticatedAccounts(): ConnectedAccount[] {
			return accounts.filter((a) => a.authenticated);
		},

		get hasAccounts(): boolean {
			return accounts.length > 0;
		},

		// Actions
		setInitialized(value: boolean): void {
			initialized = value;
		},

		setLoading(value: boolean): void {
			loading = value;
		},

		/**
		 * Add accounts to the store.
		 */
		addAccounts(newAccounts: ConnectedAccount[]): void {
			const existing = new Set(accounts.map((a) => `${a.walletId}:${a.address}`));

			const toAdd = newAccounts.filter((a) => !existing.has(`${a.walletId}:${a.address}`));

			if (toAdd.length > 0) {
				accounts = [...accounts, ...toAdd];

				// Auto-select first account if none selected
				if (!selectedAccount && accounts.length > 0) {
					selectedAccount = accounts[0];
				}

				persist();

				// Notify handlers
				toAdd.forEach((a) => onAccountAdded?.(a));
			}
		},

		/**
		 * Remove accounts from the store.
		 */
		removeAccount(walletId: WalletId, address?: string): void {
			const toRemove = accounts.filter(
				(a) => a.walletId === walletId && (!address || a.address === address)
			);

			// Remove auth tokens
			toRemove.forEach((a) => {
				Cookies.remove(`${TOKEN_PREFIX}${a.address}`);
				onAccountRemoved?.(a);
			});

			accounts = accounts.filter(
				(a) => !(a.walletId === walletId && (!address || a.address === address))
			);

			// Update selection if needed
			if (selectedAccount && toRemove.some((a) => a.address === selectedAccount?.address)) {
				selectedAccount = accounts[0] ?? null;
			}

			persist();
		},

		/**
		 * Select an account.
		 */
		selectAccount(account: ConnectedAccount): void {
			const found = accounts.find(
				(a) => a.address === account.address && a.walletId === account.walletId
			);

			if (found) {
				selectedAccount = found;
				persist();
			}
		},

		/**
		 * Select account by address.
		 */
		selectByAddress(address: string): void {
			const found = accounts.find((a) => a.address === address);
			if (found) {
				selectedAccount = found;
				persist();
			}
		},

		/**
		 * Set an account as authenticated and store its token.
		 */
		setAuthenticated(walletId: WalletId, address: string, token: string): void {
			// Store token in cookie
			Cookies.set(`${TOKEN_PREFIX}${address}`, token, {
				secure: true,
				sameSite: 'strict',
				expires: 90 // days
			});

			// Update account state
			accounts = accounts.map((a) => {
				if (a.walletId === walletId && a.address === address) {
					const updated = { ...a, authenticated: true };
					onAccountAuthenticated?.(updated);
					return updated;
				}
				return a;
			});

			// Update selected account if it matches
			if (selectedAccount?.address === address && selectedAccount?.walletId === walletId) {
				selectedAccount = { ...selectedAccount, authenticated: true };
			}

			persist();
		},

		/**
		 * Log out an account (remove auth token).
		 */
		logout(walletId: WalletId, address: string): void {
			Cookies.remove(`${TOKEN_PREFIX}${address}`);

			accounts = accounts.map((a) => {
				if (a.walletId === walletId && a.address === address) {
					return { ...a, authenticated: false };
				}
				return a;
			});

			// Update selected account if it matches
			if (selectedAccount?.address === address && selectedAccount?.walletId === walletId) {
				selectedAccount = { ...selectedAccount, authenticated: false };
			}

			persist();
		},

		/**
		 * Get the auth token for an address.
		 */
		getToken(address: string): string | undefined {
			if (!BROWSER) return undefined;
			return Cookies.get(`${TOKEN_PREFIX}${address}`);
		},

		/**
		 * Update account name (e.g., from Envoi resolution).
		 */
		updateAccountName(address: string, name: string): void {
			accounts = accounts.map((a) => {
				if (a.address === address) {
					return { ...a, name };
				}
				return a;
			});

			if (selectedAccount?.address === address) {
				selectedAccount = { ...selectedAccount, name };
			}

			persist();
		},

		/**
		 * Clear all accounts and tokens.
		 */
		reset(): void {
			accounts.forEach((a) => {
				Cookies.remove(`${TOKEN_PREFIX}${a.address}`);
			});

			accounts = [];
			selectedAccount = null;

			if (BROWSER) {
				localStorage.removeItem(STORAGE_KEY);
			}
		},

		// Event handler registration
		onAdd(handler: AccountAddedHandler): () => void {
			onAccountAdded = handler;
			return () => {
				onAccountAdded = null;
			};
		},

		onAuth(handler: AccountAuthenticatedHandler): () => void {
			onAccountAuthenticated = handler;
			return () => {
				onAccountAuthenticated = null;
			};
		},

		onRemove(handler: AccountRemovedHandler): () => void {
			onAccountRemoved = handler;
			return () => {
				onAccountRemoved = null;
			};
		}
	};
}

/**
 * Singleton wallet store instance.
 */
export const walletStore = createWalletStore();

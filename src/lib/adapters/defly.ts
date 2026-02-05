import { DeflyWalletConnect } from '@blockshake/defly-connect';
import type { Transaction } from 'algosdk';
import { BaseWalletAdapter } from './base.js';
import type { WalletAccount, SigningOptions } from './types.js';
import deflyIcon from '../icons/defly_icon.svg';

/**
 * Defly Wallet adapter.
 */
export class DeflyWalletAdapter extends BaseWalletAdapter {
	readonly id = 'defly' as const;
	readonly name = 'Defly Wallet';
	readonly icon = deflyIcon;
	readonly supportsAuth = true;

	private wallet: DeflyWalletConnect | null = null;

	protected async onInitialize(): Promise<void> {
		this.wallet = new DeflyWalletConnect();
	}

	async connect(): Promise<WalletAccount[]> {
		if (!this.wallet) {
			throw new Error('Defly adapter not initialized');
		}

		try {
			// Try to reconnect first
			let addresses = await this.wallet.reconnectSession();

			// If no session, do full connect
			if (addresses.length === 0) {
				addresses = await this.wallet.connect();
			}

			const accounts = addresses.map((address: string) => ({ address }));
			this.setConnected(accounts);
			return accounts;
		} catch (error) {
			this.clearConnected();
			throw error;
		}
	}

	async reconnect(): Promise<WalletAccount[] | null> {
		if (!this.wallet) return null;

		try {
			const addresses = await this.wallet.reconnectSession();
			if (addresses.length === 0) return null;

			const accounts = addresses.map((address: string) => ({ address }));
			this.setConnected(accounts);
			return accounts;
		} catch {
			return null;
		}
	}

	async disconnect(): Promise<void> {
		try {
			await this.wallet?.disconnect();
		} finally {
			this.clearConnected();
		}
	}

	async signTransactions(
		transactions: Transaction[][],
		_options?: SigningOptions
	): Promise<Uint8Array[]> {
		if (!this.wallet) {
			throw new Error('Defly adapter not initialized');
		}

		// Ensure we're connected
		await this.wallet.reconnectSession();

		// Format transactions for Defly's API
		const groups = transactions.map((group) => group.map((txn) => ({ txn })));

		return await this.wallet.signTransaction(groups);
	}
}

/**
 * Factory function for creating Defly adapter instances.
 */
export function createDeflyAdapter(): DeflyWalletAdapter {
	return new DeflyWalletAdapter();
}

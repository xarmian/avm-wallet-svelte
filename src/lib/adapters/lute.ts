import type { Transaction } from 'algosdk';
import { BROWSER } from 'esm-env';
import { Buffer } from 'buffer';
import { BaseWalletAdapter } from './base.js';
import type { WalletAccount, SigningOptions } from './types.js';
import luteIcon from '../icons/lute_icon.png';

// Type for the dynamically imported LuteConnect
interface LuteConnectWallet {
	connect(genesisId: string): Promise<string[]>;
	disconnect(): Promise<void>;
	signTxns(txns: Array<{ txn: string }>): Promise<Array<{ blob: Uint8Array }>>;
}

/**
 * Lute Wallet adapter.
 * Requires genesis ID for connection.
 */
export class LuteWalletAdapter extends BaseWalletAdapter {
	readonly id = 'lute' as const;
	readonly name = 'Lute Wallet';
	readonly icon = luteIcon;
	readonly supportsAuth = true;

	private wallet: LuteConnectWallet | null = null;

	protected async onInitialize(): Promise<void> {
		if (!BROWSER) return;

		const LuteConnect = await import('lute-connect');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.wallet = new (LuteConnect as any).default('avm-wallet-svelte');
	}

	async connect(): Promise<WalletAccount[]> {
		if (!BROWSER) {
			throw new Error('Lute is only available in browser environments');
		}

		if (!this.wallet) {
			await this.onInitialize();
		}

		if (!this.wallet) {
			throw new Error('Failed to initialize Lute wallet');
		}

		const config = this.requireConfig();

		try {
			const addresses = await this.wallet.connect(config.genesisId);

			const accounts = addresses.map((address) => ({ address }));
			this.setConnected(accounts);
			return accounts;
		} catch (error) {
			this.clearConnected();
			throw error;
		}
	}

	async reconnect(): Promise<WalletAccount[] | null> {
		// Lute doesn't have persistent sessions
		return null;
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
		if (!BROWSER) {
			throw new Error('Lute is only available in browser environments');
		}

		if (!this.wallet) {
			throw new Error('Lute wallet not initialized');
		}

		// Flatten and encode transactions as base64
		const txns = transactions.flat().map((txn) => ({
			txn: Buffer.from(txn.toByte()).toString('base64')
		}));

		const result = await this.wallet.signTxns(txns);

		// Extract the signed transaction bytes
		return result.map((r) => r.blob);
	}
}

/**
 * Factory function for creating Lute adapter instances.
 */
export function createLuteAdapter(): LuteWalletAdapter {
	return new LuteWalletAdapter();
}

import { get } from 'svelte/store';
import { selectedWallet, authModalStore, connectedWallets } from './store.js';
import { wallets } from './wallets.js';
import Cookies from 'js-cookie';

const authenticateSelectedWallet = async () => {
	const sWallet = get(selectedWallet);

	if (sWallet) {
		const wallet = wallets.find((w) => w.name === sWallet.app);
		console.log('wallet', wallet);
		if (wallet && wallet.authenticate) {
			authModalStore.set({ show: true, error: '', address: sWallet.address });

			try {
				await wallet.authenticate(sWallet.address);
				authModalStore.set({ show: false, error: '', address: '' });
			} catch (e: any) {
				console.error('err', e);
				authModalStore.update((state) => ({ ...state, error: e.message }));
			}
		} else {
			throw new Error(`Wallet ${sWallet.app} not found`);
		}
	}
};

export const logoutWallet = async (app: string, addr: string) => {
	// change auth property from wallet with address "addr" and app "app" in connectedWalletStore using update method, delete auth Cookie
	Cookies.remove(`avm-wallet-token-${addr}`);
	connectedWallets.update((wallets) => {
		return wallets.map((w) => {
			if (w.app === app && w.address === addr) {
				w.auth = false;
			}
			return w;
		});
	});
};

export { authenticateSelectedWallet };

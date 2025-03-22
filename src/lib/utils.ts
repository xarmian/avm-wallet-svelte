import { get } from 'svelte/store';
import { selectedWallet, authModalStore } from './store.js';
import { wallets } from './wallets.js';

const authenticateSelectedWallet = async () => {
    const sWallet = get(selectedWallet);
    if (sWallet) {
        const wallet = wallets.find((w) => w.name === sWallet.app);
        if (wallet && wallet.authenticate) {
            authModalStore.set({ show: true, error: '', address: sWallet.address });

            try {
                await wallet.authenticate(sWallet.address);
                authModalStore.set({ show: false, error: '', address: '' });
            }
            catch (e: any) {
                console.error('err',e);
                authModalStore.update(state => ({ ...state, error: e.message }));
            }
        }
        else {
            throw new Error(`Wallet ${sWallet.app} not found`);
        }
    }
};

export { authenticateSelectedWallet };
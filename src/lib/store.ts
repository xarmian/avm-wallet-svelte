import { get, writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { WalletConnectionResult } from './wallets.ts';
import type { Algodv2, Indexer } from 'algosdk';
import Cookies from 'js-cookie';

interface AVMWalletStore extends Writable<WalletConnectionResult[]> {
  remove: (app: string) => void;
  reset: () => void;
  add: (wallets: WalletConnectionResult[]) => void;
}

interface SelectedWalletStore extends Writable<WalletConnectionResult | null> {
  set: (wallet: WalletConnectionResult) => void;
  reset: () => void;
}

function createSelectedWalletStore(): SelectedWalletStore {
  const key: string = 'selectedWallet';
  let storedValue: string | null = null;
  let initialValue: WalletConnectionResult | null = null;

  if (typeof window !== 'undefined') {
    storedValue = localStorage.getItem(key);
    initialValue = storedValue ? JSON.parse(storedValue) : null;
  }

  const { subscribe, set, update } = writable(initialValue);

  return {
    subscribe,
    set: (wallet: WalletConnectionResult) => {
      const w = get(connectedWallets).find(w => w.address === wallet.address && w.app === wallet.app);
      if (w?.token) {
        Cookies.set('avm-wallet-token-' + w.address, w.token, { secure: true, sameSite: 'strict' });
        delete w.token;
        w.auth = true;
      }

      set(wallet);
      localStorage.setItem(key, JSON.stringify(wallet));
    },
    reset: () => {
      set(null);
      localStorage.removeItem(key);
    },
    update
  };
}

function createWalletStore(): AVMWalletStore {
  const key: string = 'avmWallets';
  let storedValue: string | null = null;
  let initialValue: WalletConnectionResult[] = [];

  if (typeof window !== 'undefined') {
    storedValue = localStorage.getItem(key);
    initialValue = storedValue ? JSON.parse(storedValue) : [];
  }

  const { subscribe, set } = writable(initialValue);

  return {
    subscribe,
    reset: () => {
      localStorage.removeItem(key);
      set([]);
    },
    set: (newWallets: WalletConnectionResult[]) => {
      set(newWallets);
      selectedWallet.set(newWallets[0]);
      localStorage
        .setItem(key, JSON.stringify(newWallets));
    },
    remove: (app: string) => {
      const storedValue = get(connectedWallets);
      const oldWallets = storedValue.filter(wallet => wallet.app === app);
      const newWallets = storedValue.filter(wallet => wallet.app !== app);
      set(newWallets);

      if (get(selectedWallet)?.app === app) {
        if (newWallets.length > 0) {
          selectedWallet.set(newWallets[0]);
        }
        else {
          selectedWallet.reset();
        }
      }
      localStorage
        .setItem(key, JSON.stringify(newWallets));

      // remove tokens from cookies
      oldWallets.forEach(wallet => {
        Cookies.remove('avm-wallet-token-' + wallet.address);
      });
    },
    add: (wallets: WalletConnectionResult[]) => {
      const storedValue = get(connectedWallets);

      // newWallets = combine storedValue and wallets, but remove any duplicates
      const newWallets = storedValue.concat(wallets)
        .filter((wallet, index, self) => self.findIndex(w => w.address === wallet.address && w.app === wallet.app) === index);
      set(newWallets);
      selectedWallet.set(wallets[0]);
      localStorage
        .setItem(key, JSON.stringify(newWallets));
    },
    update: (updater: (wallets: WalletConnectionResult[]) => WalletConnectionResult[]) => {
      const storedValue = get(connectedWallets);
      const newWallets = updater(storedValue);

      // update token in cookies
      newWallets.forEach(wallet => {
        if (wallet.token) {
          Cookies.set('avm-wallet-token-' + wallet.address, wallet.token, { secure: true, sameSite: 'strict' });
          delete wallet.token;
          wallet.auth = true;
        }
      });

      set(newWallets);
      localStorage
        .setItem(key, JSON.stringify(newWallets));
    }
  };
}

export const connectedWallets: AVMWalletStore = createWalletStore();
export const selectedWallet: SelectedWalletStore = createSelectedWalletStore();
export const showWalletList = writable(false);
export type { AVMWalletStore, SelectedWalletStore };
export const ProviderStore = writable<{ algodClient: Algodv2 | undefined, indexerClient: Indexer | undefined }>({ algodClient: undefined, indexerClient: undefined });
import { expect, it } from 'vitest';
import * as api from './index.js';

it('exports the v2 components, stores, scopes, adapters, signer API and verifier', () => {
	expect(Object.keys(api)).toEqual(
		expect.arrayContaining([
			'Web3Wallet',
			'AccountSelector',
			'AccountRow',
			'AddAccountView',
			'WalletProviderRow',
			'AuthModal',
			'WalletConnectModal',
			'walletStore',
			'uiStore',
			'uiState',
			'providerStore',
			'createWalletStore',
			'createProviderStore',
			'createUIStore',
			'createWalletScope',
			'getScope',
			'registerScope',
			'unregisterScope',
			'SCOPE_CONTEXT_KEY',
			'registry',
			'WalletRegistry',
			'BaseWalletAdapter',
			'PeraWalletAdapter',
			'DeflyWalletAdapter',
			'KibisisWalletAdapter',
			'LuteWalletAdapter',
			'WalletConnectAdapter',
			'WatchWalletAdapter',
			'createPeraAdapter',
			'createDeflyAdapter',
			'createKibisisAdapter',
			'createLuteAdapter',
			'createWalletConnectAdapter',
			'createWatchAdapter',
			'onWalletConnectModal',
			'onSessionStateChange',
			'createSigning',
			'SIGNER_API_VERSION',
			'SignerDisconnectedError',
			'SignerTransactionMismatchError',
			'SignerWatchOnlyError',
			'SignerResultMismatchError',
			'SignerSubmissionError',
			'verifyToken',
			'signTransactions',
			'signAndSendTransactions'
		])
	);
});
it('does not export the removed legacy surface', () => {
	const removed = [
		'Web3WalletLegacy',
		'selectedWallet',
		'connectedWallets',
		'setOnAddHandler',
		'setOnAuthHandler',
		'showWalletList',
		'getSelectedWalletToken',
		'WalletOptions',
		'authenticateSelectedWallet',
		'clearWalletConnectSessions',
		'forceWalletConnectReconnect',
		'debugWalletConnectState'
	];
	expect(Object.keys(api).filter((name) => removed.includes(name))).toEqual([]);
});

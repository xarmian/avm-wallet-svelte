import { PeraWalletConnect as WalletClass } from '@perawallet/connect';
// @ts-expect-error deep import path
import type { PeraWalletArbitraryData } from '@perawallet/connect/dist/util/model/peraWalletModels.js';
import { connectedWallets } from './store.js';
import { type WalletConnectionResult } from './wallets.js';
import algosdk from 'algosdk';

export const WalletName = 'PeraWallet';

const wallet = new WalletClass();

export async function connect(): Promise<WalletConnectionResult[] | null> {
	try {
		let accts = await wallet.reconnectSession();

		if (accts.length === 0) {
			accts = await wallet.connect();
		}

		if (accts.length === 0) return null;

		return accts.map((acct: string) => {
			return { address: acct, app: WalletName };
		});
	} catch (error) {
		console.error(error);
	}
	return null;
}

export async function disconnect() {
	await wallet.disconnect();
	connectedWallets.remove(WalletName);
}

export async function signAndSendTransactions(
	client: algosdk.Algodv2,
	txnGroups: algosdk.Transaction[][]
) {
	const signed = await signTransactions(txnGroups);

	const groups = txnGroups.map((group) => {
		return <Uint8Array[]>group
			.map((txn) => {
				const txId = txn.txID();
				const matchedTxn = signed.find((signedTxn: Uint8Array) => {
					if (!signedTxn) return;
					try {
						return algosdk.decodeSignedTransaction(signedTxn).txn.txID() === txId;
					} catch (err) {
						console.error(err);
					}
				});
				return matchedTxn;
			})
			.filter(Boolean);
	});

	for (const group of groups) {
		const { txid } = await client.sendRawTransaction(group).do();
		try {
			await algosdk.waitForConfirmation(client, txid, 1);
		} catch (error) {
			console.warn((<Error>error).message);
		}
	}

	return true;
}

export async function signTransactions(txnGroups: algosdk.Transaction[][]) {
	const signed = await wallet.signTransaction(
		txnGroups.map((group) => {
			return group.map((txn) => ({ txn }));
		})
	);

	return signed;
}

export async function signData(request: PeraWalletArbitraryData[], addr: string) {
	return await wallet.signData(request, addr);
}

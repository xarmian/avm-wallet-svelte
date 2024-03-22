import { connectedWallets } from "./store.js";
import { type WalletConnectionResult } from "./wallets.js";
import { browser } from "$app/environment";
import algosdk from "algosdk";
import kibisisClient from '@agoralabs-sh/algorand-provider';
import { Buffer } from 'buffer';

export const WalletName = "Kibisis";

declare global {
    interface Window { algorand: {
            enable: () => Promise<WalletConnectResponse>;
            signBytes: (options: kibisisClient.ISignBytesOptions) => Promise<Uint8Array[]>;
            signTxns: (options: kibisisClient.ISignTxnsOptions) => Promise<kibisisClient.ISignTxnsResult>;
        }; 
    }
}

export interface IWalletTransaction {
    authAddr?: string;
    txn: string;
}

interface Wallet {
    address: string;
    name: string | undefined;
}

interface WalletConnectResponse {
    accounts: Wallet[];
    genesisHash: string;
    genesisId: string;
    id: string;
    sessionId: string;
}

export async function connect(): Promise<WalletConnectionResult[] | null> {
    if (!browser) return null;
    if (!window?.algorand) return null;

    try {
        const resp = await window.algorand.enable();
        return resp.accounts.map((acct) => { return { address: acct.address, app: WalletName }; });
    } 
    catch (error) {
        console.error(error);
    }
    return null;
}

export function disconnect() {
    //wallet.disconnect();
    connectedWallets.remove(WalletName);
}

export async function signTransactions(txnGroups: algosdk.Transaction[][]): Promise<Uint8Array[]> {
    if (!browser) throw new Error('Browser not found');
    if (!window?.algorand) throw new Error('Kibisis wallet not found or enabled');

    const txns = txnGroups[0].map((txn) => {
        return { txn: Buffer.from(txn.toByte()).toString('base64') };
    });

    const signedTxns = await window.algorand.signTxns({ txns });

    const signedTxnBytes: Uint8Array[] = signedTxns.stxns.map((stxn) => {
        if (stxn) {
            return Buffer.from(stxn, 'base64');
        }
        return new Uint8Array(0);
    });

    return signedTxnBytes;
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
                const matchedTxn = signed.find((signedTxn) => {
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
        const { txId } = await client.sendRawTransaction(group).do();
        try {
            await algosdk.waitForConfirmation(client, txId, 1);
        } catch (error) {
            console.warn((<Error>error).message);
        }
    }

    return true;
}

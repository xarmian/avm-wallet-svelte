import LuteConnect from "lute-connect";
import { connectedWallets } from "./store.js";
import { type WalletConnectionResult } from "./wallets.js";
import algosdk from "algosdk";
import { Buffer } from "buffer";

export const WalletName = "LuteWallet";

// @ts-expect-error - LuteConnect is not a class
const wallet = new LuteConnect('avm-wallet-svelte');

export async function connect(genesisID: string): Promise<WalletConnectionResult[] | null> {
    try {
        const accts = await wallet.connect(genesisID);
        if (accts.length === 0) return null;

        return accts.map((acct: string) => { return { address: acct, app: WalletName }; });
    } 
    catch (error) {
        console.error(error);
    }
    return null;
}

export async function disconnect() {
    //await wallet.disconnect();
    connectedWallets.remove(WalletName);
}

export async function signAndSendTransactions(
    client: algosdk.Algodv2,
    txnGroups: algosdk.Transaction[][]
) {
    console.log('txnGroups',txnGroups);
    const signed = await signTransactions(txnGroups);
    console.log('signed',signed);

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
    console.log('groups',groups);

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

export async function signTransactions(txnGroups: algosdk.Transaction[][]): Promise<Uint8Array[]> {
    const txns = txnGroups[0].map((txn) => {
        return { txn: Buffer.from(txn.toByte()).toString('base64') };
    });

    const signedTxns = (await wallet.signTxns(txns)).map((stxn: algosdk.SignedTransaction) => {
        if (stxn) {
            return stxn;
        }
        return new Uint8Array(0);
    });

    return signedTxns;
}


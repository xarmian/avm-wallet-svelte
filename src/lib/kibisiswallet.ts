import { connectedWallets, ProviderStore } from "./store.js";
import { type WalletConnectionResult } from "./wallets.js";
import algosdk from "algosdk";
import { BROWSER } from "esm-env";
import { Buffer } from 'buffer';
import { get } from 'svelte/store';
import type { AVMWebClient } from "@agoralabs-sh/avm-web-provider";

export const WalletName = "Kibisis";
const providerId = "f6d1c86b-4493-42fb-b88d-a62407b4cdf6";

let client: AVMWebClient;

export interface IWalletTransaction {
    authAddr?: string;
    txn: string;
}

export async function initWallet() {
    const { AVMWebClient } = await import("@agoralabs-sh/avm-web-provider");
    client = AVMWebClient.init();
}

async function getGenesisHash(algodClient: algosdk.Algodv2) {
    try {
        const params = await algodClient.getTransactionParams().do();
        return params.genesisHash;
    } catch (error) {
        console.error("An error occurred:", error);
        return null;
    }
}

export async function connect(): Promise<WalletConnectionResult[] | null> {
    if (!BROWSER) return null;
    if (!client) {
        await initWallet();
    }

    try {
        const providerStoreValue = get(ProviderStore);

        if (!providerStoreValue.algodClient) {
            console.error("AlgodClient not found in ProviderStore");
            return null;
        }
        
        const genesisHash = Buffer.from(await getGenesisHash(providerStoreValue.algodClient)).toString('base64');
        console.log('genesisHash', genesisHash);
        if (!genesisHash) {
          throw new Error("Genesis Hash not found: algodClient handle needed");
        }

        // Wrap the AVMWebClient logic in a Promise
        return new Promise((resolve, reject) => {
            client.onEnable(({ error, result }) => {
                if (error) {
                    console.error("Error enabling AVMWebClient:", error);
                    // Reject the promise on error
                    reject(new Error(error?.message ?? "Failed to connect Kibisis wallet."));
                    return;
                }
                
                if (result?.accounts) {
                    const accounts: WalletConnectionResult[] = result.accounts.map((acct) => ({ 
                        address: acct.address, 
                        app: WalletName 
                    }));

                    resolve(accounts); 
                } else {
                    resolve([]); 
                }
            });

            // Call enable after setting up the listener
            client.enable({ providerId, genesisHash });
        });

    } 
    catch (error) {
        console.error("Error during Kibisis connect:", error);
        // Ensure the function returns null or throws in case of other errors
        return null; 
    }
}

export async function disconnect(): Promise<void> {
    if (!BROWSER) return;
    if (!client) {
        await initWallet();
    }
    const providerStoreValue = get(ProviderStore);

    if (!providerStoreValue.algodClient) {
        console.error("AlgodClient not found in ProviderStore");
        return;
    }
    
    const genesisHash = await getGenesisHash(providerStoreValue.algodClient);
    
    if (!genesisHash) {
      throw new Error("Genesis Hash not found: algodClient handle needed");
    }

    // Wrap the logic in a Promise
    return new Promise((resolve, reject) => {
        client.onDisable(({ error }) => {
            if (error) {
                console.error("Error disabling AVMWebClient:", error);
                reject(new Error(error?.message ?? "Failed to disconnect Kibisis wallet."));
            } else {
                connectedWallets.remove(WalletName);
                resolve();
            }
        });

        client.disable({ providerId, genesisHash });
    });
}

export async function signTransactions(txnGroups: algosdk.Transaction[][]): Promise<Uint8Array[]> {
    if (!BROWSER) throw new Error('Browser not found');
    if (!client) {
        await initWallet();
    }

    const providerStoreValue = get(ProviderStore);

    if (!providerStoreValue.algodClient) {
        throw new Error("AlgodClient not found in ProviderStore");            
    }
    
    const genesisHash = await getGenesisHash(providerStoreValue.algodClient);
    
    if (!genesisHash) {
        throw new Error("Genesis Hash not found: algodClient handle needed");
    }

    // Wrap the AVMWebClient logic in a Promise
    return new Promise((resolve, reject) => {
        client.onSignTransactions(({ error, result }) => {
            if (error || !result) {
                reject(new Error(error?.message ?? "Failed to sign transactions with Kibisis."));
                return;
            }
            const signedTxnBytes: Uint8Array[] = result.stxns.map((stxn) => {
                if (stxn) {
                    return Buffer.from(stxn, 'base64');
                }
                return new Uint8Array(0);
            });
        
            resolve(signedTxnBytes);
        });

        const txns = txnGroups[0].map((txn) => {
            return { txn: Buffer.from(txn.toByte()).toString('base64') };
        });
        client.signTransactions({ providerId, txns: txns });
    });
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

import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import { WalletConnectModal as Web3Modal } from "@walletconnect/modal";
import { connectedWallets, wcProjectIdStore } from "./store.js";
import { type WalletConnectionResult } from "./wallets.js";
import algosdk from "algosdk";
import { Buffer } from "buffer";
import { get } from "svelte/store";

export const WalletName = "WalletConnect";

let signClient: typeof SignClient | null = null;
let session: SessionTypes.Struct | null = null;
let web3Modal: Web3Modal | null = null;
let subscribed = false;

const CHAIN_ID = "algorand:IXnoWtviVVJW5LGivNFc0Dq14V3kqaXu";

async function createSignClient() {
    const PROJECT_ID = get(wcProjectIdStore);

    if (!PROJECT_ID) {
        throw new Error("Missing WalletConnect project ID");
    }

    if (!signClient) {
        signClient = await SignClient.init({
            projectId: PROJECT_ID,
            metadata: {
                name: "Voirewards.com",
                description: "Voi Rewards Auditor",
                url: "https://voirewards.com",
                icons: ["https://voirewards.com/android-chrome-192x192.png"],
            },
        });
        await subscribeToEvents(signClient);
    }
    return signClient;
}

function createWeb3Modal() {
    const PROJECT_ID = get(wcProjectIdStore);

    if (!web3Modal) {
        web3Modal = new Web3Modal({
            projectId: PROJECT_ID,
            standaloneChains: [CHAIN_ID],
            walletConnectVersion: 2,
            enableExplorer: false,
        });
    }
    return web3Modal;
}

export async function connect(): Promise<WalletConnectionResult[] | null> {
    try {
        const client = await createSignClient();
        const modal = createWeb3Modal();

        if (client.session && session) {
            if (client.session.keys.includes(session.topic)) {
                return session.namespaces['algorand'].accounts.map((account) => {
                    const [, , address] = account.split(":");
                    return { address, app: WalletName };
                });
            }
        }

        const { uri, approval } = await client.connect({
            autoConnect: true,
            requiredNamespaces: {
                algorand: {
                    chains: [CHAIN_ID],
                    methods: ["algo_signTxn"],
                    events: []
                }
            }
        });

        if (uri) {
            await modal.openModal({ uri });
        }

        session = await approval();
        modal.closeModal();

        return session.namespaces['algorand'].accounts.map((account) => {
            const [, , address] = account.split(":");
            return { address, app: WalletName };
        });
    } catch (error) {
        console.error(error);
    }
    return null;
}

async function subscribeToEvents(client: typeof SignClient) {
    if (!client)
      throw Error("Unable to subscribe to events. Client does not exist.");
    if (subscribed) return;
    try {
        client.on("session_delete", () => {
            console.log("The user has disconnected the session from their wallet.");
        });
        subscribed = true;
        /*client.on("session_connect", () => {
            console.log("The user has connected their wallet.");
        });*/
    } catch (e) {
      console.log(e);
    }
}

export async function disconnect() {
    if (session && signClient) {
        await signClient.disconnect({
            topic: session.topic,
            // reason: getSdkError("USER_DISCONNECTED"),
        });
        session = null;
    }
    if (web3Modal) {
        web3Modal.closeModal();
    }
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

export async function signTransactions(txnGroups: algosdk.Transaction[][]) {
    if (!session || !signClient) {
        throw new Error("No active session");
    }

    const txnsToSign = txnGroups.flat().map((txn) => {
        const encodedTxn = Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64");
        return {
            txn: encodedTxn,
            message: "Transaction to sign",
            // You can add more properties like 'signers' if needed
        };
    });

    const result = await signClient.request({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: {
            method: "algo_signTxn",
            params: [txnsToSign],
        },
    });

    return result.map((signedTxn: string | null) => 
        signedTxn ? new Uint8Array(Buffer.from(signedTxn, "base64")) : null
    );
}
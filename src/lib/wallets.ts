/*
   Thank you to Algo Doggo for the great write-up on Stateless Authentication.
   Code in this file used for authentication is based on the Stateless Authentication example
   found here: https://developer.algorand.org/tutorials/stateless-session-management-with-the-pera-wallet/
*/

import * as peraConnect from "./perawallet.js";
import * as deflyConnect from "./deflywallet.js";
import * as kibisisConnect from "./kibisiswallet.js";
import { connectedWallets, selectedWallet, ProviderStore } from "./store.js";
import peraWalletIcon from "./icons/perawallet-icon.png";
import deflyWalletIcon from "./icons/defly_icon.svg";
import kibisisWalletIcon from "./icons/kibisis_icon.svg";
import algosdk from "algosdk";
import { Buffer } from "buffer";
import { get } from "svelte/store";

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface Wallet {
  name: string;
  icon: string;
  connect: () => Promise<WalletConnectionResult | null>;
  disconnect?: () => void;
  signTxns?: (txns: algosdk.Transaction[][]) => Promise<Uint8Array[]>;
  signAndSendTxns?: (txns: algosdk.Transaction[][], algodClient?: algosdk.Algodv2) => Promise<boolean>;
  authenticate?: (wallet: string, algodClient?: algosdk.Algodv2) => void;
}

export interface WalletConnectionResult {
  address: string;
  app: string;
  token?: string;
}

export const wallets: Wallet[] = [
  {
    name: "PeraWallet",
    icon: peraWalletIcon,
    connect: async () => {
      // Connect to PeraWallet
      const wallets = await peraConnect.connect();
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      else {
        return Promise.resolve(null);
      }
    },
    disconnect: () => {
      peraConnect.disconnect();
    },
    signTxns: async (txns: algosdk.Transaction[][]) => {
      await peraConnect.connect();
      return await peraConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], algodClient?: algosdk.Algodv2) => {
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      await peraConnect.connect();
      return await peraConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      await peraConnect.connect();

      /*const txnToSign = [
        {
          txn: Buffer.from(algosdk.encodeUnsignedTransaction(authTx)).toString("base64"),
          message: "This is a free transaction for authentication purposes and will be not broadcast to the network.",
        },
      ];*/
    
      const signedTxn = await peraConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === 'PeraWallet' && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: "DeflyWallet",
    icon: deflyWalletIcon,
    connect: async () => {
      const wallets = await deflyConnect.connect();
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      else {
        return Promise.resolve(null);
      }
    },
    disconnect: () => {
      deflyConnect.disconnect();
    },
    signTxns: async (txns: algosdk.Transaction[][]) => {
      await deflyConnect.connect();
      return await deflyConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], algodClient?: algosdk.Algodv2) => {
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      await deflyConnect.connect();
      return await deflyConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      await deflyConnect.connect();

      const signedTxn = await deflyConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === 'DeflyWallet' && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: "Kibisis",
    icon: kibisisWalletIcon,
    connect: async () => {
      const wallets = await kibisisConnect.connect();
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      else {
        return Promise.resolve(null);
      }
    },
    disconnect: () => {
      kibisisConnect.disconnect();
    },
    signTxns: async (txns: algosdk.Transaction[][]): Promise<Uint8Array[]> => {
      await kibisisConnect.connect();
      return await kibisisConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], algodClient?: algosdk.Algodv2) => {
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      await kibisisConnect.connect();
      return await kibisisConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);
      await kibisisConnect.connect();

      const signedTxn = await kibisisConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === 'Kibisis' && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  }
];

async function draftAuthTx(wallet: string, algodClient?: algosdk.Algodv2): Promise<algosdk.Transaction> {
  const providerStoreValue = get(ProviderStore);
  if (!algodClient) {
    algodClient = providerStoreValue.algodClient;
  }

  if (!algodClient) {
    throw new Error("Algod client not available");
  }

  const enc = new TextEncoder();
  const day1 = 24 * 60 * 60 * 1000;
  const notePlainText = `avm-wallet-auth ${Date.now() + day1}`;
  const note = enc.encode(notePlainText);
  const params = await algodClient.getTransactionParams().do();

  const authTransaction: algosdk.Transaction = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams: {
      fee: 0,
      firstRound: 10,
      flatFee: true,
      //genesisHash: "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
      //genesisID: "mainnet-v1.0",
      lastRound: 10,
      genesisHash: params.genesisHash,
      genesisID: params.genesisID,
    },
    from: wallet,
    to: wallet,
    amount: 0,
    note,
  });

  return authTransaction;
}

export const verifyToken = async (wallet: string, token: string): Promise<boolean> => {
  const day1 = 24 * 60 * 60 * 1000;
  const minutes30 = 30 * 60 * 1000;

  //converting the base64 encoded tx back to binary data
  const decodeToken = new Uint8Array(Buffer.from(token, "base64"));

  //getting a SignedTransaction object from the array buffer
  const decodedTx = algosdk.decodeSignedTransaction(decodeToken);

  //auth tx whose params we will check
  const toCheck = decodedTx.txn;

  // get the signature from the signed transaction
  const signature = decodedTx.sig;

  // parse the note back to utf-8
  const note = new TextDecoder().decode(toCheck.note);
  const decodedNote = note.split(" ");

  // "from" and "to" are distincts ArrayBuffers,
  // comparing them directly would always return false.
  // We therefore convert them back to base32 for comparison.
  const from = algosdk.encodeAddress(toCheck.from.publicKey);
  const to = algosdk.encodeAddress(toCheck.to.publicKey);

  // Guard clause to make sure the token has not expired.
  // We also check the token expiration is not too far out, which would be a red flag.
  if (Number(decodedNote[1]) < Date.now() || Number(decodedNote[1]) > Date.now() + day1 + minutes30) {
    throw new Error("Token expired, authenticate again");
  }

  // We verify that the params match the ones we set in the front-end.
  if (
    toCheck.firstRound === 10 &&
    toCheck.lastRound === 10 &&
    decodedNote[0] === "avm-wallet-auth" &&
    from === to &&
    // It is crucial to verify this or an attacker could sign
    // their own valid token and log into any account!
    from === wallet
  ) {
    // verify signature and return if it succeeds
    const verified = ed.verify(signature, toCheck.bytesToSign(), toCheck.from.publicKey);
    if (verified) return true;
  }
  return false;
};

export async function verifySignature(signedTxn: Uint8Array): Promise<boolean> {
  // Extract the signature from the signed transaction
  const decodedTxn = algosdk.decodeSignedTransaction(signedTxn);

  // convert decodedTxn.txn to a Uint8Array
  const txnBytes = decodedTxn.txn.bytesToSign();

  // Verify the signature
  const isValidSignature = ed.verify(decodedTxn.sig, txnBytes, decodedTxn.txn.from.publicKey);
  return isValidSignature;
}

export async function verifyTransactionGroupSignatures(signedTxns: Uint8Array[], txns: algosdk.Transaction[], publicKey: string): Promise<boolean[]> {
  if (signedTxns.length !== txns.length) {
      throw new Error("The lengths of signed transactions, transactions, and public keys must match.");
  }

  // Array to hold verification results for each transaction
  const verificationResults: boolean[] = [];

  for (let i = 0; i < txns.length; i++) {
      // Serialize each transaction to get the raw message to verify
      const txnBytes = algosdk.encodeUnsignedTransaction(txns[i]);

      // For each signed transaction, extract the signature
      const sig = algosdk.decodeSignedTransaction(signedTxns[i]).sig;

      // Verify the signature for each transaction
      const isValidSignature = algosdk.verifyBytes(txnBytes, sig, publicKey);
      verificationResults.push(isValidSignature);
  }

  return verificationResults;
}

export function getSelectedWalletToken(): string | null {
  const selected = get(selectedWallet);
  
  // find wallet in connectedWallets
  const wallet = get(connectedWallets).find(w => w.address === selected?.address && w.app === selected?.app);
  
  return wallet?.token || null;
}

export function signAndSendTransactions(txnGroups: algosdk.Transaction[][], algodClient?: algosdk.Algodv2): Promise<boolean> {
  const wallet = get(selectedWallet);

  if (!wallet) {
    throw new Error("No wallet selected");
  }

  const selected = wallets.find(w => w.name === wallet.app);

  if (!selected) {
    throw new Error("Wallet not found");
  }

  if (!algodClient) {
    algodClient = get(ProviderStore).algodClient;
  }

  if (selected.signAndSendTxns) {
    return selected.signAndSendTxns(txnGroups, algodClient);
  }
  else {
    throw new Error("Wallet does not support signing and sending transactions");
  }
}

export function signTransactions(txnGroups: algosdk.Transaction[][]): Promise<Uint8Array[]> {
  const wallet = get(selectedWallet);

  if (!wallet) {
    throw new Error("No wallet selected");
  }

  const selected = wallets.find(w => w.name === wallet.app);

  if (!selected) {
    throw new Error("Wallet not found");
  }

  if (selected.signTxns) {
    return selected.signTxns(txnGroups);
  }
  else {
    throw new Error("Wallet does not support signing transactions");
  }
}

/*export async function verifySignature(signedTxn: Uint8Array, txn: algosdk.Transaction, publicKey: string): Promise<boolean> {
  // Serialize the transaction to get the raw message to verify
  const txnBytes = algosdk.encodeUnsignedTransaction(txn);

  // Extract the signature from the signed transaction
  const sig = algosdk.decodeSignedTransaction(signedTxn).sig;

  // Verify the signature
  const isValidSignature = algosdk.verifyBytes(txnBytes, sig, publicKey);

  return isValidSignature;
}*/
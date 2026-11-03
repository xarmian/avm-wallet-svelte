/*
   Thank you to Algo Doggo for the great write-up on Stateless Authentication.
   Code in this file used for authentication is based on the Stateless Authentication example
   found here: https://developer.algorand.org/tutorials/stateless-session-management-with-the-pera-wallet/
*/

import { SignerDisconnectedError, SignerTransactionMismatchError } from "./signerErrors.js";
import * as peraConnect from "./perawallet.js";
import * as deflyConnect from "./deflywallet.js";
import * as kibisisConnect from "./kibisiswallet.js";
import * as LuteConnect from "./lutewallet.js";
import * as WalletConnect from "./walletconnect.js";
import { connectedWallets, selectedWallet, ProviderStore } from "./store.js";
import peraWalletIcon from "./icons/perawallet-icon.png";
import deflyWalletIcon from "./icons/defly_icon.svg";
import kibisisWalletIcon from "./icons/kibisis_icon.svg";
import luteWalletIcon from "./icons/lute_icon.png";
import walletConnectIcon from "./icons/walletconnect-logo-black.svg";
import watchWalletIcon from "./icons/watch_icon.png";
import biatecWalletIcon from "./icons/biatec_icon.svg";
import voiWalletIcon from "./icons/voi_wallet_icon.svg";
import algosdk from "algosdk";
import { Buffer } from "buffer";
import { get } from "svelte/store";

export const Wallets = {
  PERA: peraConnect.WalletName,
  DEFLY: deflyConnect.WalletName,
  KIBISIS: kibisisConnect.WalletName,
  LUTE: LuteConnect.WalletName,
  BIATEC: 'BiatecWallet',
  VOIWALLET: 'VoiWallet',
  WALLETCONNECT: WalletConnect.WalletName,
  WATCH: "Watch",
}

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type TransactionSigner = Readonly<{ address: string; app: string }>;
export const SIGNER_API_VERSION = 1 as const;

export { SignerDisconnectedError, SignerTransactionMismatchError } from "./signerErrors.js";

async function requireSessionAccount(
  signer: TransactionSigner,
  getAccounts: () => Promise<string[]>
): Promise<void> {
  let accounts: string[];
  try {
    accounts = await getAccounts();
  } catch {
    throw new SignerDisconnectedError(signer);
  }
  if (!accounts.includes(signer.address)) throw new SignerDisconnectedError(signer);
}

async function requireWalletConnectSession(signer: TransactionSigner): Promise<void> {
  try {
    if (
      await WalletConnect.hasActiveSession() &&
      await WalletConnect.getSessionOwner() === signer.app &&
      (await WalletConnect.getSessionAccounts()).includes(signer.address)
    ) return;
  } catch {
    // A session that cannot be inspected cannot establish ownership.
  }
  throw new SignerDisconnectedError(signer);
}

export interface Wallet {
  name: string;
  icon: string;
  connect: () => Promise<WalletConnectionResult | null>;
  disconnect?: (walletAddress?: string) => void;
  signTxns?: (txns: algosdk.Transaction[][], signer: TransactionSigner) => Promise<Uint8Array[]>;
  signAndSendTxns?: (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => Promise<boolean>;
  authenticate?: (wallet: string, algodClient?: algosdk.Algodv2) => Promise<void>;
}

export interface WalletConnectionResult {
  address: string;
  app: string;
  token?: string;
  auth?: boolean;
  watch?: boolean;
  envoiName?: string;
}

export const wallets: Wallet[] = [
  {
    name: Wallets.WATCH,
    icon: watchWalletIcon,
    connect: async () => {
      // prompt user to connect to watched account
      const address = prompt("Enter the address of the watched account");
      if (address) {
        if (algosdk.isValidAddress(address)) {
          const wallet: WalletConnectionResult = {
            address: address,
            app: Wallets.WATCH,
            watch: true,
          };
          
          // add watched account to connectedWallets store
          connectedWallets.add([wallet]);

          // add watched account to connectedWallets store
          return Promise.resolve(wallet);
        }
        else {
          alert("Invalid Algorand address");
        }
      }
      return Promise.resolve(null);
    },
    disconnect: (walletAddress?: string) => {
      connectedWallets.remove(Wallets.WATCH, walletAddress);
    },
    signTxns: async () => {
      alert("Watched accounts do not support signing transactions");
      return Promise.resolve([]);
    },
    signAndSendTxns: async () => {
      alert("Watched accounts do not support signing transactions");
      return Promise.resolve(false);
    },
    authenticate: async () => {
      alert("Watched accounts do not support authentication");
      return Promise.resolve();
    }
  },
  {
    name: Wallets.PERA,
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
    signTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner) => {
      await requireSessionAccount(signer, peraConnect.getSessionAccounts);
      return await peraConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await requireSessionAccount(signer, peraConnect.getSessionAccounts);
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      return await peraConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      if (!await peraConnect.connect()) {
        throw new Error("Could not connect to Pera Wallet.");
      }

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
            if (w.app === Wallets.PERA && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.DEFLY,
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
    signTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner) => {
      await requireSessionAccount(signer, deflyConnect.getSessionAccounts);
      return await deflyConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await requireSessionAccount(signer, deflyConnect.getSessionAccounts);
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      return await deflyConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      if (!await deflyConnect.connect()) {
        throw new Error("Could not connect to Defly Wallet.");
      }

      const signedTxn = await deflyConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.DEFLY && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.KIBISIS,
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
    signAndSendTxns: async (txns: algosdk.Transaction[][], _signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
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

      if (!await kibisisConnect.connect()) {
        throw new Error("Could not connect to Kibisis Wallet. Is it enabled?");
      };

      const signedTxn = await kibisisConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.KIBISIS && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.LUTE,
    icon: luteWalletIcon,
    connect: async () => {
      // get genesisID from algodClient
      const providerStoreValue = get(ProviderStore);
      
      // get genesis file from algod client
      const genesis = await providerStoreValue.algodClient?.genesis().do();

      if (!genesis) {
        throw new Error("Genesis ID not found: algodClient handle needed to connect to Lute Wallet");
      }

      const genesisID = genesis.network + '-' + genesis.id;

      await LuteConnect.initWallet();
      const wallets = await LuteConnect.connect(genesisID);
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      else {
        return Promise.resolve(null);
      }
    },
    disconnect: async () => {
      await LuteConnect.initWallet();

      LuteConnect.disconnect();
    },
    signTxns: async (txns: algosdk.Transaction[][]) => {
      await LuteConnect.initWallet();
      return await LuteConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], _signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await LuteConnect.initWallet();

      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      //await LuteConnect.connect();
      return await LuteConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      await LuteConnect.initWallet();
      
      const authTx = await draftAuthTx(wallet, algodClient);
      const signedTxn = await LuteConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        // store token in connectedWallets store under the wallet's address as property "token"
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.LUTE && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.BIATEC,
    icon: biatecWalletIcon,
    connect: async () => {
      const wallets = await WalletConnect.connect(Wallets.BIATEC);
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      return Promise.resolve(null);
    },
    disconnect: async () => {
      await WalletConnect.disconnect();
      connectedWallets.remove(Wallets.BIATEC);
    },
    signTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner) => {
      await requireWalletConnectSession(signer);
      return await WalletConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await requireWalletConnectSession(signer);
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      return await WalletConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      // Only connect if there's no active session
      if (!await WalletConnect.hasActiveSession()) {
        if (!await WalletConnect.connect(Wallets.BIATEC)) {
          throw new Error("Could not connect to WalletConnect Wallet.");
        }
      }

      const signedTxn = await WalletConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.BIATEC && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.VOIWALLET,
    icon: voiWalletIcon,
    connect: async () => {
      const wallets = await WalletConnect.connect(Wallets.VOIWALLET);
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      return Promise.resolve(null);
    },
    disconnect: async () => {
      await WalletConnect.disconnect();
      connectedWallets.remove(Wallets.VOIWALLET);
    },
    signTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner) => {
      await requireWalletConnectSession(signer);
      return await WalletConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await requireWalletConnectSession(signer);
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      return await WalletConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      // Only connect if there's no active session
      if (!await WalletConnect.hasActiveSession()) {
        if (!await WalletConnect.connect(Wallets.VOIWALLET)) {
          throw new Error("Could not connect to WalletConnect Wallet.");
        }
      }

      const signedTxn = await WalletConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.VOIWALLET && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
  {
    name: Wallets.WALLETCONNECT,
    icon: walletConnectIcon,
    connect: async () => {
      const wallets = await WalletConnect.connect();
      if (wallets) {
        connectedWallets.add(wallets);
        return Promise.resolve(wallets[0]);
      }
      return Promise.resolve(null);
    },
    disconnect: async () => {
      await WalletConnect.disconnect();
      connectedWallets.remove(Wallets.WALLETCONNECT);
    },
    signTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner) => {
      await requireWalletConnectSession(signer);
      return await WalletConnect.signTransactions(txns);
    },
    signAndSendTxns: async (txns: algosdk.Transaction[][], signer: TransactionSigner, algodClient?: algosdk.Algodv2) => {
      await requireWalletConnectSession(signer);
      const providerStoreValue = get(ProviderStore);
      if (!algodClient) {
        algodClient = providerStoreValue.algodClient;
      }

      if (!algodClient) {
        throw new Error("Algod client not available");
      }
      return await WalletConnect.signAndSendTransactions(algodClient, txns);
    },
    authenticate: async (wallet: string, algodClient?: algosdk.Algodv2) => {
      const authTx = await draftAuthTx(wallet, algodClient);

      // Only connect if there's no active session
      if (!await WalletConnect.hasActiveSession()) {
        if (!await WalletConnect.connect()) {
          throw new Error("Could not connect to WalletConnect Wallet.");
        }
      }

      const signedTxn = await WalletConnect.signTransactions([[authTx]]);

      // base64 encode using buffer
      const token = Buffer.from(signedTxn[0]).toString("base64");

      if (await verifyToken(wallet, token)) {
        connectedWallets.update((wallets) => {
          return wallets.map((w) => {
            if (w.app === Wallets.WALLETCONNECT && w.address === wallet) {
              w.token = token;
            }
            return w;
          });
        });
      }
    }
  },
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
  const day90 = 24 * 60 * 60 * 1000 * 90;
  const notePlainText = `avm-wallet-auth ${Date.now() + day90}`;
  const note = enc.encode(notePlainText);
  const params = await algodClient.getTransactionParams().do();

  const authTransaction: algosdk.Transaction = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams: {
      fee: 0,
      firstRound: 10,
      flatFee: true,
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
  const day90 = 24 * 60 * 60 * 1000 * 90;
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
  if (Number(decodedNote[1]) < Date.now() || Number(decodedNote[1]) > Date.now() + day90 + minutes30) {
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

function resolveSigner(txnGroups: algosdk.Transaction[][], signer: TransactionSigner) {
  const address = signer?.address;
  const app = signer?.app;
  if (typeof address !== "string" || !address || typeof app !== "string" || !app || !algosdk.isValidAddress(address)) {
    throw new TypeError("An explicit signer { address, app } is required.");
  }
  const snapshot: TransactionSigner = { address, app };
  if (!txnGroups.length || txnGroups.some(group => !group.length)) {
    throw new TypeError("At least one transaction is required.");
  }
  const connected = get(connectedWallets).find(w => w.address === address && w.app === app);
  if (!connected) throw new SignerDisconnectedError(snapshot);
  if (connected.app === Wallets.WATCH || connected.watch) {
    throw new Error("Watched accounts do not support signing transactions");
  }
  txnGroups.forEach((group, groupIndex) => {
    group.forEach((txn, transactionIndex) => {
      const sender = algosdk.encodeAddress(txn.from.publicKey);
      if (sender !== address) throw new SignerTransactionMismatchError(sender, snapshot, groupIndex, transactionIndex);
    });
  });
  const adapter = wallets.find(w => w.name === app);
  if (!adapter) throw new Error("Wallet not found");
  return { signer: snapshot, adapter };
}

export async function signAndSendTransactions(
  txnGroups: algosdk.Transaction[][],
  signer: TransactionSigner,
  algodClient?: algosdk.Algodv2
): Promise<boolean> {
  const resolved = resolveSigner(txnGroups, signer);
  if (!resolved.adapter.signAndSendTxns) {
    throw new Error("Wallet does not support signing and sending transactions");
  }
  return resolved.adapter.signAndSendTxns(txnGroups, resolved.signer, algodClient ?? get(ProviderStore).algodClient);
}

export async function signTransactions(
  txnGroups: algosdk.Transaction[][],
  signer: TransactionSigner
): Promise<Uint8Array[]> {
  const resolved = resolveSigner(txnGroups, signer);
  if (!resolved.adapter.signTxns) {
    throw new Error("Wallet does not support signing transactions");
  }
  return resolved.adapter.signTxns(txnGroups, resolved.signer);
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
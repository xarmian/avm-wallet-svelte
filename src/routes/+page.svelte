<script lang="ts">
    import Web3Wallet from '../lib/Web3Wallet.svelte';
    import algosdk from 'algosdk';
    import { Buffer } from 'buffer';
    import { wallets, verifySignature, getSelectedWalletToken, signAndSendTransactions } from '../lib/wallets.ts';
    import { selectedWallet, setOnAddHandler, setOnAuthHandler } from '../lib/store.ts';
    import { get } from 'svelte/store';
    import type { Transaction } from 'algosdk';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as PROJECT_ID } from '$env/static/public';
    import { onDestroy } from 'svelte';
    
    const server = 'https://testnet-api.voi.nodly.io';
    //const server = "https://testnet-api.algonode.cloud"
    //const server = 'https://mainnet-api.voi.nodely.dev'
    const port = '443';
    const token = '';

    // Algorand indexer settings
    const indexerServer = 'https://testnet-idx.voi.nodly.io';
    //const indexerServer = 'https://mainnet-idx.voi.nodely.dev';
    const indexerPort = '443';
    const indexerToken = '';

    // Initialize the Algodv2 client
    const algodClient = new algosdk.Algodv2(token, server, port);
    const algodIndexer = new algosdk.Indexer(indexerToken, indexerServer, indexerPort);

    const encodeUnsignedTransaction = (t: Transaction): string => {
        return Buffer.from(algosdk.encodeUnsignedTransaction(t)).toString('base64');
    };

    const sub = selectedWallet.subscribe((wallet) => {
        console.log('sub',wallet);
    });

    onDestroy(() => {
        sub();
    });

    setOnAddHandler(async (wallet) => {
        console.log('add',wallet);
    });

    setOnAuthHandler(async (wallet) => {
        console.log('auth',wallet);
    });

    const signTxn = async () => {
        if (!algodClient) {
            throw new Error('AlgodClient not found');
        }

        const params = await algodClient.getTransactionParams().do();

        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: get(selectedWallet)?.address??'',
            to: get(selectedWallet)?.address??'',
            amount: 1000, // amount in microAlgos
            suggestedParams: params
        });

        console.log(txn);

        const allTxns: algosdk.Transaction[] = [];
        allTxns.push(txn);
        //algosdk.assignGroupID(allTxns);

        try {
            const status = await signAndSendTransactions([allTxns]);
            console.log(status);
        }
        catch (e: any) {
            console.error(e);
        }
    }

    //console.log(getSelectedWalletToken());

</script>

<div class="m-20 p-4 rounded-xl border border-red-800 border-solid text-sm w-72">
    <Web3Wallet showAuthButtons={true} algodClient={algodClient} wcProject={{
        projectId: PROJECT_ID,
        projectName: 'Voi Rewards Auditor',
        projectDescription: 'Voi Rewards Auditor',
        projectUrl: 'https://voirewards.com',
        projectIcons: ['https://voirewards.com/android-chrome-192x192.png']
    }} allowWatchAccounts={true}
    modalType="modal"
    connectButtonType="static"
    />
    <button on:click={signTxn} class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg">
        Sign Tx
    </button>
</div>
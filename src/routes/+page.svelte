<script lang="ts">
    import Web3Wallet from '../lib/Web3Wallet.svelte';
    import algosdk from 'algosdk';
    import { Buffer } from 'buffer';
    import { wallets, verifySignature, getSelectedWalletToken, signAndSendTransactions } from '../lib/wallets.ts';
    import { selectedWallet, setOnAddHandler, setOnAuthHandler } from '../lib/store.ts';
    import { get } from 'svelte/store';
    import type { Transaction } from 'algosdk';
    import { PUBLIC_WALLETCONNECT_PROJECT_ID as PROJECT_ID } from '$env/static/public';
    import { onDestroy, onMount } from 'svelte';
    
    // Add dark mode state
    let darkMode = false;

    // Initialize dark mode from localStorage on mount
    onMount(() => {
        darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) {
            document.documentElement.classList.add('dark');
        }
    });

    // Toggle dark mode function
    function toggleDarkMode() {
        darkMode = !darkMode;
        localStorage.setItem('darkMode', darkMode.toString());
        document.documentElement.classList.toggle('dark');
    }

    //const server = 'https://testnet-api.voi.nodly.io';
    //const server = "https://testnet-api.algonode.cloud"
    const server = 'https://mainnet-api.voi.nodely.dev'
    const port = '443';
    const token = '';

    // Algorand indexer settings
    //const indexerServer = 'https://testnet-idx.voi.nodly.io';
    const indexerServer = 'https://mainnet-idx.voi.nodely.dev';
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
<div class="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200 flex flex-col">
    <button 
        on:click={toggleDarkMode}
        class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200 m-4 self-end"
    >
        {#if darkMode}
            🌙
        {:else}
            ☀️
        {/if}
    </button>

    <div class="m-20 p-4 rounded-xl border border-red-800 border-solid text-sm w-72 bg-white dark:bg-gray-800 dark:text-white">
        <Web3Wallet 
            showAuthButtons={true} 
            algodClient={algodClient} 
            wcProject={{
                projectId: PROJECT_ID,
                projectName: 'Voi Rewards Auditor',
                projectDescription: 'Voi Rewards Auditor',
                projectUrl: 'https://voirewards.com',
                projectIcons: ['https://voirewards.com/android-chrome-192x192.png']
            }} 
            allowWatchAccounts={true}
            modalType="dropdown"
            connectButtonType="wallet"
        />
        <button 
            on:click={signTxn} 
            class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow-lg dark:bg-blue-600 dark:hover:bg-blue-800"
        >
            Sign Tx
        </button>
    </div>
</div>
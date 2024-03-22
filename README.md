NOTE! This is currently in alpha. It is provided WITHOUT WARRANTY. There are several
obvious issues that need to be addressed before this should be considered usable
in any sort of production capacity. Please limit use to Testnets only!

## AVM Wallet Web3 Svelte Component for Algoand-based Networks
This is a component for connecting to AVM (Algorand) based wallets. The component exposes a
"Connect Wallet" button that can be placed within your application UI. When no wallets are connected,
the button displays "Connect Wallet". When one or more wallets is connected, the button displays
the address of the connected wallet. Connected wallets are stored in Browser Local Storage and
connections are restored automatically.

The component supports:
* Fast wallet switching, detectable through a svelte store subscription (see below)
* Multiple wallets and accounts connected simultaneously
* Authentication token creation and storage
* Universal signing API to sign and transmit transactions using the current selected wallet

Current wallets supported:
* Pera Wallet - https://perawallet.app/
* Defly Wallet - https://defly.app/
* Kibisis - https://kibis.is/
* Lute (coming soon) - https://lute.app/

### Demo
Example implementation can be seen here: https://nftnavigator.xyz/

### Install Package
```
npm install avm-wallet-svelte
```

### Import Component
```
import { Web3Wallet } from 'avm-wallet-svelte';
```

### Use Component
```
<Web3Wallet />
```

To facilitate actions that require an algod node, such as submitting transactions to the network,
you can either initialize the component with the algodClient or pass the algodClient to
the function (i.e. `signAndSendTransactions` below).

```
import algosdk from 'algosdk';

const token = 'ALGOD_TOKEN';
const server = 'ALGOD_HOST';
const port = 'ALGOD_PORT';

const algodClient = new algosdk.Algodv2(token, server, port);

<Web3Wallet {algodClient} />
```

You can also specify which wallets to enable by passing an array of wallet names in the component's
`availableWallets` parameter. All supported wallets are enabled by default.
I.e. to only show PeraWallet and Kibisis:

```
<Web3Wallet {algodClient} availableWallets={['PeraWallet','Kibisis']}>
```

### Stores
This package utilizes stores to expose the list of connected wallets and the user's currently selected wallet,
making these available by importing and subscribing to the stores:
```
import { selectedWallet, connectedWallets } from 'avm-wallet-svelte';

<div>{$selectedWallet.address}</div>
{#each $connectedWallets as wallet}
    <div>Connected Wallet: ${wallet.address} with ${wallet.app}</div>
{/each}
```

### Signing Transactions
Send transactions to the current selected wallet and sign them:
```
import { signAndSendTransactions, selectedWallet, ProviderStore } from 'avm-wallet-svelte';
import { get } from 'svelte/store';
import algosdk from 'algosdk';

const fromWallet = get(selectedWallet); // current wallet selected by user
const toWallet = 'ADDRESS_OF_WALLET_TO_SEND_TO';

if (fromWallet) {
    const algodClient = get(ProviderStore).algodClient; // get the algodClient provided to the component
    if (!algodClient) {
        throw new Error("Algod client not available");
    }
    const params = await algodClient.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: fromWallet,
        to: toWallet,
        amount: 1000, // amount to pay in microAlgos
        suggestedParams: params
    });

    const allTxns: algosdk.Transaction[] = [];
    allTxns.push(txn);

    try {
        const status = signAndSendTransactions([allTxns]);
        // if you want to use a different algodClient instance
        // or if none was provided to the <Web3Wallet/> component:
        // const status = signAndSendTransactions([allTxns], algodClient);
    }
    catch(e: any) {
        // error handling -- future plan is to make error events consistent across wallets
        console.log(e.message);
    }
}
```

### Roadmap
* Improve layout flexibility and add styling options
* Consistent error handling
* Move storage of Auth token to less vulnerable storage
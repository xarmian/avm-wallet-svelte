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
* Universal signing API to sign and transmit transactions using an explicitly captured account and wallet app

Current wallets supported:
* Pera Wallet - https://perawallet.app/
* Defly Wallet - https://defly.app/
* Kibisis - https://kibis.is/
* Lute - https://lute.app/
* WalletConnect - https://walletconnect.com/

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
<Web3Wallet {algodClient} availableWallets={['PeraWallet','Kibisis']} />

// or

import { WalletOptions } from 'avm-wallet-svelte';
<Web3Wallet availableWallets={[WalletOptions.PERA,WalletOptions.KIBISIS]} />
```

### Watched Accounts

Watched accounts are accounts that are not authenticated but are connected to the wallet.
They are useful for watching transactions on the network without the need to authenticate.

To enable watched accounts, pass `allowWatchAccounts={true}` to the Web3Wallet component.

```
<Web3Wallet allowWatchAccounts={true} />
```

### WalletConnect

If using WalletConnect you must obtain a Project ID from WalletConnect at https://cloud.walletconnect.com.
This must be passed to the Web3Wallet component as argument `wcProjectId`, i.e.:

const projectId = '[project id obtained from walletconnect cloud portal]';
<Web3Wallet {algodClient} availableWallets={['PeraWallet','WalletConnect']} wcProject={{
    projectId: '<project id from walletconnect cloud portal>',
    projectName: '<project name>',
    projectDescription: '<project description>',
    projectUrl: '<project url>',
    projectIcons: ['<icon url>']
}}>

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
Capture the selected account and app when the user clicks, before awaiting transaction parameters.
Use that signer for building and signing the entire request:
```svelte
<script lang="ts">
import { signAndSendTransactions, selectedWallet } from 'avm-wallet-svelte';
import algosdk from 'algosdk';

// Use the algodClient initialized above and supplied to <Web3Wallet>.
async function onSendClick() {
    const wallet = $selectedWallet;
    if (!wallet) throw new Error('No wallet selected');
    const signer = { address: wallet.address, app: wallet.app };
    const toWallet = 'ADDRESS_OF_WALLET_TO_SEND_TO';
    const params = await algodClient.getTransactionParams().do();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: signer.address,
        to: toWallet,
        amount: 1000, // amount to pay in microAlgos
        suggestedParams: params
    });
    const allTxns = [txn];

    try {
        const status = await signAndSendTransactions([allTxns], signer);
        // To use a different client, or if none was supplied to <Web3Wallet>:
        // const status = await signAndSendTransactions([allTxns], signer, algodClient);
        console.log(status);
    }
    catch (error) {
        console.error(error);
    }
}
</script>

<button on:click={onSendClick}>Send</button>
```

### Migrating from 0.9 to 0.10

Version 0.10.0 requires an explicit `TransactionSigner`, a readonly `{ address, app }` value,
for both `signTransactions(groups, signer)` and `signAndSendTransactions(groups, signer, algodClient?)`.
Capture a copy of `$selectedWallet`'s address and app at the click, before any asynchronous work;
build every transaction with `signer.address`. Changing the picker during the request does not
change its signer. Missing or malformed signers reject with a `TypeError`, including old calls
that pass an Algod client as argument two. There is no selected-wallet fallback or automatic
reconnect during signing.

The optional `algodClient` moves from argument two to argument three; if omitted, the client
provided to `<Web3Wallet>` is used. Every outer transaction must have the signer's sender address.
Mixed-sender groups are rejected as a whole before any wallet is contacted. Watch accounts cannot sign.

Three new runtime exports support callers: `SIGNER_API_VERSION` (currently `1`),
`SignerDisconnectedError` (`code: 'SIGNER_DISCONNECTED'`) for a missing exact account/app pair or
unavailable provider session, and `SignerTransactionMismatchError`
(`code: 'SIGNER_TRANSACTION_MISMATCH'`) for a different sender. The signer type is also exported.
Provider refusals propagate without retrying or switching apps. Lute and Kibisis have no
non-prompting session account check; the captured app may prompt. Kibisis retains its existing
connection/enable step.

One-line call migration after capturing `signer`: `signAndSendTransactions(groups, algodClient)`
becomes `signAndSendTransactions(groups, signer, algodClient)`; the one-argument form becomes
`signAndSendTransactions(groups, signer)`.

### Authentication

This section needs more documentation. Web3Wallet accepts an optional boolean parameter `showAuthButtons`.
If true, users will see an `auth` option after connecting their wallet. Clicking `auth` will send a validation
transaction to their wallet. Once authenticated, the signed transaction is stored as a token in the browser's
secure cookie storage and can be used for authentication. Token expiration is currently hard-coded for 90 days
with plans to be customizable in the future.

### Roadmap
* Improve layout flexibility and add styling options
* Consistent error handling

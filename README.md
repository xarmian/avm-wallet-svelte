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

- Fast wallet switching, detectable through a svelte store subscription (see below)
- Multiple wallets and accounts connected simultaneously
- Authentication token creation and storage
- Universal signing API to sign and transmit transactions using the current selected wallet

Current wallets supported:

- Pera Wallet - https://perawallet.app/
- Defly Wallet - https://defly.app/
- Kibisis - https://kibis.is/
- Lute - https://lute.app/
- WalletConnect - https://walletconnect.com/

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

### Signing (v2)

A `TransactionSigner` is an explicit `{ address, walletId }` pair. Use
`scope.signTransactions(groups, signer, options?)` to receive signed bytes, or
`scope.signAndSendTransactions(groups, signer, options?)` to sign, submit each group
in order and wait for confirmation using the scope's Algod client. The only signing
option is `message`.

The signer is required; there is no fallback to the selected account. Its exact
account and wallet pair must be connected in that scope. Every outer transaction
must have the signer's address as its sender, including every transaction in a
group. Mixed-sender groups are rejected before signing. Signed results are checked
against the requested transaction IDs before they are returned or submitted.
Transactions and group boundaries are snapshotted before signing, so caller mutations
during the wallet prompt do not change the request.

The API exports five typed errors with stable `code` fields:

- `SignerDisconnectedError`: the account pair or its wallet is disconnected.
- `SignerWatchOnlyError`: the account or adapter is watch-only.
- `SignerTransactionMismatchError`: a sender differs; includes `groupIndex` and `transactionIndex`.
- `SignerResultMismatchError`: returned signed bytes have an unexpected count, are empty,
  or do not match; includes the flat `index` and `reason` (`count`, `empty`, or `mismatch`).
- `SignerSubmissionError`: a group send or confirmation failed; includes the zero-based
  `groupIndex`, the original `cause`, and `groups` with one status per requested group,
  in order.

Each `SubmissionGroupStatus` contains `index`, `txIds`, and a `SubmissionGroupState`.
Every group's `txIds` are computed locally from the transaction snapshot before any
send, including groups never attempted. All of these IDs can be looked up on chain.

- `confirmed`: send and confirmation succeeded.
- `submitted-unconfirmed`: the group may have landed. This includes a confirmation
  failure or timeout, a send that errored without an algod rejection, and a 400
  "already in ledger" response.
- `not-sent`: the group was never attempted or algod definitely rejected the
  transaction itself with an HTTP 400 response. This describes this call only: if an
  earlier attempt sent the same signed transactions, they may already be on chain, so
  check the `txIds` before re-signing. Groups after the failing group have this state.

A retry must re-check on chain every txId of every `submitted-unconfirmed` group
before re-signing, because that group may have landed. The successful return value
still contains one algod txid per group. Errors raised before submission keep their
existing types and are not wrapped in `SignerSubmissionError`.

Capture the signer from the account shown to the user at the moment they confirm,
before any asynchronous work:

```ts
import { getScope, type ConnectedAccount, type TransactionSigner } from 'avm-wallet-svelte';
import type { Transaction } from 'algosdk';

async function confirmPayment(account: ConnectedAccount, groups: Transaction[][]) {
	const signer: TransactionSigner = { address: account.address, walletId: account.walletId };
	const scope = getScope('default'); // Scope registered by the mounted Web3Wallet
	if (!scope) throw new Error('Wallet scope not available');

	return scope.signAndSendTransactions(groups, signer, { message: 'Confirm payment' });
	// For signing only, use scope.signTransactions(groups, signer).
}
```

Adapter methods obtained from `scope.registry.getAdapter(...)` are the low-level
wallet-driver layer. They do not apply the explicit signer or sender check above.

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

### Authentication

This section needs more documentation. Web3Wallet accepts an optional boolean parameter `showAuthButtons`.
If true, users will see an `auth` option after connecting their wallet. Clicking `auth` will send a validation
transaction to their wallet. Once authenticated, the signed transaction is stored as a token in the browser's
secure cookie storage and can be used for authentication. Token expiration is currently hard-coded for 90 days
with plans to be customizable in the future.

### Roadmap

- Improve layout flexibility and add styling options
- Consistent error handling

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

- Fast wallet switching through reactive Svelte 5 state (see below)
- Multiple wallets and accounts connected simultaneously
- Authentication token creation and storage
- Explicit signer API to sign and transmit transactions for a connected account

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
initialize the component with `algodClient`. Signing and submission use the clients
from the signer's scope.

```
import algosdk from 'algosdk';

const token = 'ALGOD_TOKEN';
const server = 'ALGOD_HOST';
const port = 'ALGOD_PORT';

const algodClient = new algosdk.Algodv2(token, server, port);

<Web3Wallet {algodClient} />
```

Choose wallets with the `enabledWallets` prop and typed `WalletId` strings. For example,
to show only Pera and Kibisis:

```svelte
<Web3Wallet {algodClient} enabledWallets={['pera', 'kibisis']} />
```

### Styling

`Web3Wallet` includes its default styles automatically; there is nothing extra to import.
Override tokens in your application CSS:

```css
:root {
	--avm-color-primary: 79 70 229;
	--avm-radius-md: 0.75rem;
}
```

Dark mode follows `.dark` or `[data-theme='dark']`. The optional
`dropdownAlign="auto"` (default) aligns the dropdown to the end when needed to fit;
use `"start"` or `"end"` to choose explicitly. The existing
`avm-wallet-svelte/styles/theme.css` import still works.
See the [Theming Guide](./docs/THEMING.md) for tokens, overrides and contrast guidance.

### Watched Accounts

Watched accounts are accounts that are not authenticated but are connected to the wallet.
They are useful for watching transactions on the network without the need to authenticate.

To enable watched accounts, pass `allowWatchAccounts={true}` to the Web3Wallet component.

```
<Web3Wallet allowWatchAccounts={true} />
```

### WalletConnect

If using WalletConnect you must obtain a Project ID from WalletConnect at https://cloud.walletconnect.com.
Pass the configuration through the `wcConfig` prop:

```svelte
<Web3Wallet
	{algodClient}
	enabledWallets={['pera', 'walletconnect']}
	wcConfig={{
		projectId: '<project id>',
		name: 'My app',
		description: 'My wallet app',
		url: 'https://example.com',
		icons: ['https://example.com/icon.png']
	}}
/>
```

### Stores

`walletStore` exposes reactive accounts and selection. Read its properties in a template,
or use `$derived` for reactive local values:

```svelte
<script lang="ts">
	import { walletStore } from 'avm-wallet-svelte';
	let selected = $derived(walletStore.selectedAccount);
</script>

<div>{selected?.address ?? 'No account selected'}</div>
{#each walletStore.accounts as account}
	<div>Connected account: {account.address} with {account.walletId}</div>
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

### Default-scope signing

The package-root `signTransactions` and `signAndSendTransactions` aliases use the
`default` scope and require the same signer argument. Apps using multiple scopes
must call each scope's own methods.

```ts
import { signAndSendTransactions, walletStore, providerStore } from 'avm-wallet-svelte';
import algosdk from 'algosdk';

async function sendPayment(receiver: string) {
	const account = walletStore.selectedAccount;
	if (!account) throw new Error('No account selected');
	const signer = { address: account.address, walletId: account.walletId };
	const client = providerStore.algodClient;
	if (!client) throw new Error('Algod client not available');
	const params = await client.getTransactionParams().do();
	const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: signer.address,
		receiver,
		amount: 1000,
		suggestedParams: params
	});
	return signAndSendTransactions([[txn]], signer, { message: 'Confirm payment' });
}
```

### Authentication

Set `showSignInButton={true}` on `Web3Wallet` to show sign-in actions. Signing in
creates a zero-amount self-payment with an `avm-wallet-auth` expiry note. The signed
transaction is stored as a base64 token in a secure cookie for 90 days. Read the
stored token with `walletStore.getToken(address)`.

### Verifying sign-in tokens

`verifyToken(address, token)` checks the base64-encoded signed authentication
transaction produced by `adapter.authenticate(address)`. It checks the address,
self-payment receiver, validity rounds, note prefix, expiry and Ed25519 signature.
It returns `false` for a mismatch and throws `Error('Token expired, authenticate again')`
for an expired token, an expiry beyond 90 days plus 30 minutes ahead, or a missing or
non-numeric expiry. The expiry is a timestamp the signer wrote into the token's note, so
`verifyToken` accepts a token only while that stated expiry has not passed and is at most
90 days (plus 30 minutes) ahead; it cannot tell when the token was actually signed.
Malformed tokens can throw decoding errors.

```ts
import { verifyToken } from 'avm-wallet-svelte';

const valid = await verifyToken(address, token);
```

### Roadmap

- Improve layout flexibility and add styling options
- Consistent error handling

# Migrating from v2.x to v3.0

`Web3Wallet` includes its default theme automatically; the theme CSS import is no longer required.

The legacy v1 API is removed in v3.0. Use the v2 components, reactive state and
explicit signer API. The table covers the former legacy export section; the
three retained function names are listed with their current behavior.

| Former export                 | Replacement or status                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Web3WalletLegacy`            | `Web3Wallet`                                                                                                                 |
| `selectedWallet`              | `walletStore.selectedAccount`                                                                                                |
| `connectedWallets`            | `walletStore.accounts`                                                                                                       |
| `setOnAddHandler`             | `walletStore.onAdd(handler)`                                                                                                 |
| `setOnAuthHandler`            | `walletStore.onAuth(handler)`                                                                                                |
| `showWalletList`              | `uiStore.openWalletList()`, `uiStore.closeWalletList()`; read `uiState.showWalletList`                                       |
| `getSelectedWalletToken`      | `walletStore.getToken(address)`                                                                                              |
| `authenticateSelectedWallet`  | `registry.getAdapter(walletId)?.authenticate?.(address)`; save with `walletStore.setAuthenticated(walletId, address, token)` |
| `WalletOptions`               | `WalletId` strings: `'pera'`, `'defly'`, `'kibisis'`, `'lute'`, `'walletconnect'`, `'biatec'`, `'voiwallet'`, `'watch'`      |
| `WalletConnectionResult`      | `ConnectedAccount`                                                                                                           |
| `AVMWalletStore`              | No replacement for the Svelte writable interface; use `walletStore` or `createWalletStore()`                                 |
| `SelectedWalletStore`         | No replacement for the Svelte writable interface; read `walletStore.selectedAccount`                                         |
| `clearWalletConnectSessions`  | Use `registry.getAdapter(walletId)`, narrow to `WalletConnectAdapter`, then call `clearAllSessions()`                        |
| `forceWalletConnectReconnect` | Get the adapter with `registry.getAdapter(walletId)` and call `disconnect()` then `connect()`                                |
| `debugWalletConnectState`     | No replacement                                                                                                               |
| `signTransactions`            | Retained name; now `signTransactions(groups, signer, options?)` in the default scope                                         |
| `signAndSendTransactions`     | Retained name; now `signAndSendTransactions(groups, signer, options?)` in the default scope                                  |
| `verifyToken`                 | Retained, imported from `'avm-wallet-svelte'`; one outcome changed (see Token verification)                                  |

`clearAllSessions()` clears WalletConnect storage across sessions. Use it only when
that reset is intended. For multiple scopes, use the relevant scope's `walletStore`,
`uiStore`, `registry` and signing methods instead of default-scope singletons.

## A signer is required

Previously signing implicitly used the selected wallet:

```ts
await signTransactions(groups);
await signAndSendTransactions(groups, algodClient);
```

Capture the account when the user confirms, before any asynchronous work:

```ts
import { walletStore, signTransactions, signAndSendTransactions } from 'avm-wallet-svelte';

const account = walletStore.selectedAccount;
if (!account) throw new Error('No account selected');
const signer = { address: account.address, walletId: account.walletId };
const signed = await signTransactions(groups, signer, { message: 'Confirm signing' });
// To sign and submit instead, using the default scope's configured Algod client:
const result = await signAndSendTransactions(groups, signer, { message: 'Confirm payment' });
```

In an app with multiple scopes, call `scope.signTransactions(groups, signer, options)`
or `scope.signAndSendTransactions(groups, signer, options)` on the intended scope.
The exact address and wallet pair must be connected there. Every outer transaction
in every group must have the signer as its sender; mixed-sender groups are rejected
before opening the wallet. Returned signed transactions must match the request.

| Typed error                      | Meaning                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SignerDisconnectedError`        | The exact account pair or its adapter is disconnected in this scope.                                                    |
| `SignerWatchOnlyError`           | The account or adapter is watch-only and cannot sign.                                                                   |
| `SignerTransactionMismatchError` | A transaction sender differs from the signer; includes group and transaction indexes.                                   |
| `SignerResultMismatchError`      | The wallet returned an unexpected count, empty bytes or a different transaction; includes the flat index and reason.    |
| `SignerSubmissionError`          | Sending or confirming a group failed; includes `groupIndex`, `cause` and per-group statuses with local transaction IDs. |

For `SignerSubmissionError`, look up every transaction ID in a
`submitted-unconfirmed` group on chain before re-signing. `not-sent` describes this
call only; if an earlier attempt sent those transactions, check their IDs too. See
the [Signing section](./README.md#signing-v2) for submission status details.

## Token verification

`verifyToken(wallet: string, token: string): Promise<boolean>` keeps its name,
package-root import path and signature. It checks the base64 signed authentication
transaction, returns `false` on a mismatch, and throws
`Error('Token expired, authenticate again')` on expiry or an expiry too far ahead.
The expiry is a timestamp the signer wrote into the token's note: a token is accepted
only while that stated expiry has not passed and is at most 90 days (plus 30 minutes)
ahead, and `verifyToken` cannot tell when the token was actually signed. One outcome
changed in 3.0.0: a token whose expiry is missing or non-numeric is now treated as
expired and throws the same error (before, such a token never expired). Tokens minted
by the library always carry a numeric expiry, so they are unaffected. Malformed input
can throw decoding errors.

## Removed dependencies

`jose`, `ulujs` and `@zerodevx/svelte-toast` are no longer dependencies. If your app
relied on them transitively, declare them directly. `@noble/ed25519` and
`@noble/hashes` remain for token verification.

---

# Migration Guide: v1.x to v2.0

> **Historical guide.** This section describes moving from v1.x to v2.0. The v1 API it
> shows (the legacy stores, components and signing functions) was removed in v3.0, and the
> raw adapter signing shown for v2.0 skips the signer checks. For anything you write today,
> follow [Migrating from v2.x to v3.0](#migrating-from-v2x-to-v30) above.

This guide helps you migrate from avm-wallet-svelte v1.x to v2.0. The v2.0 release is a complete rewrite with a new architecture, improved type safety, and better customization options.

## Breaking Changes Summary

| Category             | v1.x                                   | v2.0                                                  |
| -------------------- | -------------------------------------- | ----------------------------------------------------- |
| Component Props      | `modalType`, `connectButtonType`       | `displayMode`, `buttonStyle`                          |
| Wallet Selection     | `availableWallets: string[]`           | `enabledWallets: WalletId[]`                          |
| WalletConnect Config | `wcProject`                            | `wcConfig`                                            |
| Styling              | `walletListClass` prop                 | CSS custom properties                                 |
| State Access         | `$connectedWallets`, `$selectedWallet` | `walletStore.accounts`, `walletStore.selectedAccount` |
| Event Handlers       | `setOnAddHandler()`                    | `walletStore.onAdd()`                                 |
| Signing              | `signTransactions()`                   | `adapter.signTransactions()` (v3.0: the signer API)   |

## Quick Migration

### Before (v1.x)

```svelte
<script>
  import { Web3Wallet, selectedWallet, connectedWallets, signTransactions } from 'avm-wallet-svelte';

  $: currentWallet = $selectedWallet;
  $: allWallets = $connectedWallets;
</script>

<Web3Wallet
  algodClient={client}
  modalType="dropdown"
  connectButtonType="wallet"
  availableWallets={['PeraWallet', 'DeflyWallet']}
  wcProject={{ projectId: '...', ... }}
  walletListClass="bg-white"
/>
```

### After (v2.0)

```svelte
<script>
  import { Web3Wallet, walletStore } from 'avm-wallet-svelte';

  // State is reactive - no need for $: statements
  let accounts = $derived(walletStore.accounts);
  let selectedAccount = $derived(walletStore.selectedAccount);
</script>

<Web3Wallet
  algodClient={client}
  displayMode="dropdown"
  buttonStyle="wallet"
  enabledWallets={['pera', 'defly']}
  wcConfig={{ projectId: '...', name: '...', ... }}
/>
```

## Detailed Changes

### 1. Component Props

#### Renamed Props

| v1.x                | v2.0             | Notes                                   |
| ------------------- | ---------------- | --------------------------------------- |
| `modalType`         | `displayMode`    | Values remain `"dropdown"` or `"modal"` |
| `connectButtonType` | `buttonStyle`    | Values remain `"wallet"` or `"static"`  |
| `availableWallets`  | `enabledWallets` | Now uses typed wallet IDs               |
| `wcProject`         | `wcConfig`       | Same structure, different name          |

#### Removed Props

| v1.x              | v2.0 Replacement                       |
| ----------------- | -------------------------------------- |
| `walletListClass` | Use CSS custom properties for theming  |
| `envoiName`       | Handled automatically by the component |

#### New Props

| Prop         | Type    | Description                                   |
| ------------ | ------- | --------------------------------------------- |
| `button`     | Snippet | Custom button content using Svelte 5 snippets |
| `walletIcon` | Snippet | Custom wallet icon renderer                   |

### 2. Wallet IDs

v2.0 uses strict TypeScript wallet IDs instead of strings:

```typescript
// v1.x - strings
availableWallets={['PeraWallet', 'DeflyWallet', 'Kibisis', 'LuteWallet']}

// v2.0 - typed WalletId
enabledWallets={['pera', 'defly', 'kibisis', 'lute']}
```

Available wallet IDs:

- `pera`
- `defly`
- `kibisis`
- `lute`
- `walletconnect`
- `biatec`
- `voiwallet`
- `watch`

### 3. State Management

#### Accessing State

```typescript
// v1.x
import { selectedWallet, connectedWallets } from 'avm-wallet-svelte';

$: wallet = $selectedWallet;
$: wallets = $connectedWallets;

// v2.0
import { walletStore } from 'avm-wallet-svelte';

// In Svelte 5 components, these are reactive:
let account = $derived(walletStore.selectedAccount);
let accounts = $derived(walletStore.accounts);
```

#### Event Handlers

```typescript
// v1.x
import { setOnAddHandler, setOnAuthHandler } from 'avm-wallet-svelte';

setOnAddHandler((wallet) => console.log('Added:', wallet));
setOnAuthHandler((wallet) => console.log('Authenticated:', wallet));

// v2.0
import { walletStore } from 'avm-wallet-svelte';

const unsubAdd = walletStore.onAdd((account) => console.log('Added:', account));
const unsubAuth = walletStore.onAuth((account) => console.log('Authenticated:', account));

// Clean up when done
unsubAdd();
unsubAuth();
```

### 4. Transaction Signing

```typescript
// v1.x
import { signTransactions, signAndSendTransactions } from 'avm-wallet-svelte';

const signed = await signTransactions(txnGroups);
await signAndSendTransactions(txnGroups, algodClient);

// v2.0 signed through a raw adapter (registry.getAdapter(id).signTransactions(txnGroups)),
// which does not check that the account is connected or that it sent the transactions.
// From v3.0, capture the signer when the user confirms and sign through the signer API:
import { signTransactions, signAndSendTransactions, walletStore } from 'avm-wallet-svelte';

const account = walletStore.selectedAccount;
if (!account) throw new Error('No account selected');
const signer = { address: account.address, walletId: account.walletId };
const signed = await signTransactions(txnGroups, signer);
const result = await signAndSendTransactions(txnGroups, signer);
```

### 5. Authentication

```typescript
// v1.x
import { authenticateSelectedWallet, getSelectedWalletToken } from 'avm-wallet-svelte';

await authenticateSelectedWallet();
const token = getSelectedWalletToken();

// v2.0
import { registry, walletStore } from 'avm-wallet-svelte';

const account = walletStore.selectedAccount;
const adapter = account && registry.getAdapter(account.walletId);
if (!account || !adapter?.authenticate) throw new Error('No account that can sign in');
const token = await adapter.authenticate(account.address);
walletStore.setAuthenticated(account.walletId, account.address, token);

// Get token
const storedToken = walletStore.getToken(address);
```

### 6. Styling with CSS Custom Properties

v2.0 uses CSS custom properties instead of class props for theming.

```css
/* Import the theme */
@import 'avm-wallet-svelte/styles/theme.css';

/* Customize colors */
:root {
	--avm-color-primary: 79 70 229; /* indigo-600 */
	--avm-bg-primary: 255 255 255;
	--avm-text-primary: 17 24 39;
	--avm-radius-md: 0.75rem;
}

/* Dark mode */
.dark {
	--avm-bg-primary: 17 24 39;
	--avm-text-primary: 249 250 251;
}
```

See [THEMING.md](./docs/THEMING.md) for the complete list of CSS custom properties.

### 7. WalletConnect Configuration

```typescript
// v1.x
wcProject={{
  projectId: 'xxx',
  projectName: 'My App',
  projectDescription: 'Description',
  projectUrl: 'https://example.com',
  projectIcons: ['https://example.com/icon.png']
}}

// v2.0
wcConfig={{
  projectId: 'xxx',
  name: 'My App',
  description: 'Description',
  url: 'https://example.com',
  icons: ['https://example.com/icon.png']
}}
```

## Type Definitions

### ConnectedAccount (v2.0)

```typescript
interface ConnectedAccount {
	address: string;
	walletId: WalletId;
	authenticated: boolean;
	name?: string;
	isWatch: boolean;
}
```

### WalletConnectionResult (v1.x - deprecated)

```typescript
interface WalletConnectionResult {
	address: string;
	app: string;
	token?: string;
	auth?: boolean;
	watch?: boolean;
	envoiName?: string;
}
```

## Using Legacy API

The legacy API was removed in v3.0. Use the replacements in
[Migrating from v2.x to v3.0](#migrating-from-v2x-to-v30) above. Package-root signing
names remain available with the required signer argument.

## Need Help?

If you encounter issues during migration, please:

1. Check the [API Reference](./docs/API.md) for detailed documentation
2. See [THEMING.md](./docs/THEMING.md) for styling options
3. Open an issue on GitHub

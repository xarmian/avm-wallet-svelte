# Migration Guide: v1.x to v2.0

This guide helps you migrate from avm-wallet-svelte v1.x to v2.0. The v2.0 release is a complete rewrite with a new architecture, improved type safety, and better customization options.

## Breaking Changes Summary

| Category | v1.x | v2.0 |
|----------|------|------|
| Component Props | `modalType`, `connectButtonType` | `displayMode`, `buttonStyle` |
| Wallet Selection | `availableWallets: string[]` | `enabledWallets: WalletId[]` |
| WalletConnect Config | `wcProject` | `wcConfig` |
| Styling | `walletListClass` prop | CSS custom properties |
| State Access | `$connectedWallets`, `$selectedWallet` | `walletStore.accounts`, `walletStore.selectedAccount` |
| Event Handlers | `setOnAddHandler()` | `walletStore.onAdd()` |
| Signing | `signTransactions()` | `adapter.signTransactions()` |

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
  const accounts = walletStore.accounts;
  const selectedAccount = walletStore.selectedAccount;
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

| v1.x | v2.0 | Notes |
|------|------|-------|
| `modalType` | `displayMode` | Values remain `"dropdown"` or `"modal"` |
| `connectButtonType` | `buttonStyle` | Values remain `"wallet"` or `"static"` |
| `availableWallets` | `enabledWallets` | Now uses typed wallet IDs |
| `wcProject` | `wcConfig` | Same structure, different name |

#### Removed Props

| v1.x | v2.0 Replacement |
|------|------------------|
| `walletListClass` | Use CSS custom properties for theming |
| `envoiName` | Handled automatically by the component |

#### New Props

| Prop | Type | Description |
|------|------|-------------|
| `button` | Snippet | Custom button content using Svelte 5 snippets |
| `walletIcon` | Snippet | Custom wallet icon renderer |

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
const account = walletStore.selectedAccount;
const accounts = walletStore.accounts;
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

// v2.0
import { registry } from 'avm-wallet-svelte';

// Get the adapter for the current wallet
const adapter = registry.getAdapter('pera');
const signed = await adapter.signTransactions(txnGroups);
const result = await adapter.signAndSendTransactions(txnGroups);
```

### 5. Authentication

```typescript
// v1.x
import { authenticateSelectedWallet, getSelectedWalletToken } from 'avm-wallet-svelte';

await authenticateSelectedWallet();
const token = getSelectedWalletToken();

// v2.0
import { registry, walletStore } from 'avm-wallet-svelte';

const adapter = registry.getAdapter(walletStore.selectedAccount.walletId);
const token = await adapter.authenticate(walletStore.selectedAccount.address);
walletStore.setAuthenticated(
  walletStore.selectedAccount.walletId,
  walletStore.selectedAccount.address,
  token
);

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

During migration, you can access the legacy API:

```typescript
// Legacy exports are still available but deprecated
import {
  Web3WalletLegacy,  // Old component
  selectedWallet,     // Old stores
  connectedWallets,
  signTransactions,   // Old functions
} from 'avm-wallet-svelte';
```

The legacy API will be removed in v3.0.

## Need Help?

If you encounter issues during migration, please:

1. Check the [API Reference](./docs/API.md) for detailed documentation
2. See [THEMING.md](./docs/THEMING.md) for styling options
3. Open an issue on GitHub

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Svelte 5 component library for AVM (Algorand) wallet connections. It provides a Web3Wallet component that supports multiple wallet types including Pera, Defly, Kibisis, Lute, and WalletConnect, with authentication and transaction signing capabilities.

**Version**: 2.0.0-alpha (complete rewrite from v1.x)

## Development Commands

- `npm run dev` - Start development server with Vite
- `npm run build` - Build and package the library (runs `vite build && npm run package`)
- `npm run package` - Create distributable package using svelte-kit and publint
- `npm run check` - Run Svelte type checking
- `npm run check:watch` - Run type checking in watch mode
- `npm run lint` - Run Prettier and ESLint checks
- `npm run format` - Format code with Prettier

## Architecture (v2.0)

### Directory Structure

```
src/lib/
├── adapters/           # Wallet adapter layer
│   ├── types.ts        # WalletAdapter interface, types
│   ├── base.ts         # BaseWalletAdapter abstract class
│   ├── pera.ts         # Pera Wallet adapter
│   ├── defly.ts        # Defly Wallet adapter
│   ├── kibisis.ts      # Kibisis adapter
│   ├── lute.ts         # Lute adapter
│   ├── walletconnect.ts # WalletConnect adapter (supports biatec, voiwallet)
│   ├── watch.ts        # Watch-only adapter
│   ├── registry.ts     # WalletRegistry for managing adapters
│   └── index.ts        # Public exports
├── state/              # State management with Svelte 5 runes
│   ├── types.ts        # State types
│   ├── wallet-store.svelte.ts  # Main wallet state ($state runes)
│   ├── ui-store.svelte.ts      # UI state (modals, dropdowns)
│   ├── provider-store.svelte.ts # Algod/Indexer clients
│   └── index.ts        # Public exports
├── components/         # Svelte 5 components ($props)
│   ├── Web3Wallet.svelte       # Main component
│   ├── WalletList.svelte       # Wallet list
│   ├── WalletItem.svelte       # Individual wallet
│   ├── AccountList.svelte      # Connected accounts
│   ├── AuthModal.svelte        # Authentication modal
│   ├── WalletConnectModal.svelte # QR code modal
│   └── index.ts        # Public exports
├── styles/             # CSS theming
│   └── theme.css       # CSS custom properties
├── icons/              # Wallet icons
└── index.ts            # Main library exports
```

### Core Layers

#### 1. Wallet Adapters (`src/lib/adapters/`)

Unified interface for all wallet types:

```typescript
interface WalletAdapter {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly supportsAuth: boolean;
  readonly isWatchOnly: boolean;

  initialize(config: WalletAdapterConfig): Promise<void>;
  connect(): Promise<WalletAccount[]>;
  disconnect(): Promise<void>;
  reconnect(): Promise<WalletAccount[] | null>;
  isConnected(): boolean;
  signTransactions(transactions: Transaction[][], options?: SigningOptions): Promise<Uint8Array[]>;
  signAndSendTransactions(transactions: Transaction[][], options?: SigningOptions): Promise<SignAndSendResult>;
  authenticate?(address: string): Promise<string>;
}
```

The `WalletRegistry` manages adapter instances and handles initialization.

#### 2. State Management (`src/lib/state/`)

Uses Svelte 5 runes for reactive state:

- **walletStore**: Connected accounts, selection, auth tokens
- **uiStore**: Modal visibility, errors
- **providerStore**: Algod/Indexer clients, genesis info

```typescript
// Reactive state access
const account = walletStore.selectedAccount;
const accounts = walletStore.accounts;
```

#### 3. Components (`src/lib/components/`)

Svelte 5 components using `$props()` and `$state()`:

- **Web3Wallet**: Main component, initializes adapters and state
- **WalletList**: Renders available wallets
- **WalletItem**: Individual wallet with connect/disconnect
- **AccountList**: Shows connected accounts for a wallet
- **AuthModal**: Authentication flow
- **WalletConnectModal**: QR code display

#### 4. Styling (`src/lib/styles/`)

CSS custom properties for theming:

```css
:root {
  --avm-color-primary: 59 130 246;
  --avm-bg-primary: 255 255 255;
  --avm-text-primary: 17 24 39;
  /* ... */
}
```

### Key Features

- **Multi-wallet support**: Connect multiple wallets simultaneously
- **Watch accounts**: Monitor addresses without signing capability
- **WalletConnect**: Supports generic WalletConnect, Biatec, and VoiWallet
- **Authentication**: Stateless auth with signed transactions (90-day expiration)
- **CSS Theming**: Full customization via CSS custom properties
- **Type Safety**: Strict TypeScript with WalletId types
- **Svelte 5**: Uses $props, $state, $derived, $effect runes

### Authentication Flow

1. Create auth transaction (payment to self, 0 amount, with expiry note)
2. Wallet signs the transaction
3. Token = base64-encoded signed transaction
4. Stored in secure cookie with 90-day expiration
5. Verified client-side using ed25519 signature validation

## Important Notes

- **Svelte 5 required**: Uses runes ($props, $state, $effect)
- **WalletConnect**: Requires `wcConfig` with project ID from WalletConnect Cloud
- **ESLint 9**: Uses flat config format (`eslint.config.js`)
- **Tailwind 3.4**: CSS-first theming, will upgrade to v4 later
- **Legacy API**: v1.x API still exported for migration (deprecated)

## File Types

- `.svelte.ts`: Contains Svelte 5 runes (must be processed by Svelte)
- `.ts`: Regular TypeScript
- `.svelte`: Svelte components
- `.css`: Theme and utilities

## Testing

Run the demo app:

```bash
npm run dev
```

The demo page is at `src/routes/+page.svelte`.

## Migration

See [MIGRATION.md](./MIGRATION.md) for upgrading from v1.x to v2.0.

See [docs/THEMING.md](./docs/THEMING.md) for styling options.

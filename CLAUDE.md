# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Svelte component library for AVM (Algorand) wallet connections. It provides a Web3Wallet component that supports multiple wallet types including Pera, Defly, Kibisis, Lute, and WalletConnect, with authentication and transaction signing capabilities.

## Development Commands

- `npm run dev` - Start development server with Vite
- `npm run build` - Build and package the library (runs `vite build && npm run package`)
- `npm run package` - Create distributable package using svelte-kit and publint
- `npm run check` - Run Svelte type checking
- `npm run check:watch` - Run type checking in watch mode
- `npm run lint` - Run Prettier and ESLint checks
- `npm run format` - Format code with Prettier

## Architecture

### Core Components

- **Web3Wallet.svelte**: Main component that renders the wallet connection button and handles wallet selection UI
- **WalletList.svelte**: Dropdown/modal component showing available wallets for connection
- **AuthModal.svelte**: Modal for wallet authentication flows
- **SimpleWalletConnectModal.svelte**: Modal for WalletConnect QR code display

### State Management

The library uses Svelte stores for global state:

- **store.ts**: Contains `connectedWallets`, `selectedWallet`, `showWalletList`, and other core stores
- **selectedWallet**: Currently active wallet (automatically saved to localStorage)
- **connectedWallets**: Array of all connected wallets with authentication status
- **ProviderStore**: Holds algodClient and indexerClient instances

### Wallet Integration

- **wallets.ts**: Central wallet registry and transaction signing logic
- Individual wallet modules: `perawallet.ts`, `deflywallet.ts`, `kibisiswallet.ts`, `lutewallet.ts`, `walletconnect.ts`
- Each wallet implements the `Wallet` interface with connect, disconnect, signTxns, and authenticate methods

### Authentication

Uses stateless authentication based on signed transactions:
- Wallets sign an authentication transaction with 90-day expiration
- Auth tokens stored as secure cookies with prefix `avm-wallet-token-{address}`
- Token verification uses ed25519 signature validation

### Key Features

- **Multi-wallet support**: Connect multiple wallets simultaneously with fast switching
- **Watch accounts**: Monitor addresses without authentication
- **WalletConnect**: Requires project configuration from WalletConnect Cloud
- **Envoi integration**: Resolves human-readable names for Algorand addresses
- **Transaction signing**: Universal API for signing and broadcasting transactions

## Important Notes

- The library requires Svelte 5 as a peer dependency
- WalletConnect integration needs `wcProject` configuration with valid project ID
- Lute wallet requires genesis ID from algodClient for connection
- Authentication tokens have 90-day expiration with client-side validation
- All wallet connections are persisted in browser localStorage
- The package is marked as alpha and should only be used on testnets

## File Structure

- `src/lib/index.ts` - Main exports and public API
- `src/lib/Web3Wallet.svelte` - Primary component
- `src/lib/store.ts` - Svelte stores for state management
- `src/lib/wallets.ts` - Wallet registry and signing logic
- `src/lib/[wallet].ts` - Individual wallet implementations
- `src/lib/icons/` - Wallet icons and assets
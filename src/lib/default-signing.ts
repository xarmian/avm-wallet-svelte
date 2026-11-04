import { createWalletScope } from './state/scope.svelte.js';

const scope = createWalletScope('default');
export const signTransactions = scope.signTransactions;
export const signAndSendTransactions = scope.signAndSendTransactions;

import type { TransactionSigner } from './wallets.js';

export class SignerDisconnectedError extends Error {
	readonly code = 'SIGNER_DISCONNECTED' as const;
	readonly address: string;
	readonly app: string;

	constructor(signer: TransactionSigner) {
		super(`Account ${signer.address}: its wallet (${signer.app}) is disconnected.`);
		this.name = 'SignerDisconnectedError';
		this.address = signer.address;
		this.app = signer.app;
	}
}

export class SignerTransactionMismatchError extends Error {
	readonly code = 'SIGNER_TRANSACTION_MISMATCH' as const;
	readonly sender: string;
	readonly address: string;
	readonly groupIndex: number;
	readonly transactionIndex: number;

	constructor(
		sender: string,
		signer: TransactionSigner,
		groupIndex: number,
		transactionIndex: number
	) {
		super(`Transaction sender ${sender} does not match signer account ${signer.address}.`);
		this.name = 'SignerTransactionMismatchError';
		this.sender = sender;
		this.address = signer.address;
		this.groupIndex = groupIndex;
		this.transactionIndex = transactionIndex;
	}
}

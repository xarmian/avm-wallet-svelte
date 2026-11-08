import { describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import { LuteWalletAdapter } from './lute.js';

const a = algosdk.generateAccount();
const b = algosdk.generateAccount();

function payment(amount = 1) {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: a.addr,
		receiver: b.addr,
		amount,
		suggestedParams: {
			fee: 1000,
			minFee: 1000,
			flatFee: true,
			firstValid: 1,
			lastValid: 100,
			genesisHash: new Uint8Array(32),
			genesisID: 'test-v1'
		}
	});
}

function adapterReturning(result: unknown) {
	const adapter = new LuteWalletAdapter();
	const signTxns = vi.fn(async () => result);
	(adapter as unknown as { wallet: unknown }).wallet = { signTxns };
	return { adapter, signTxns };
}

describe('LuteWalletAdapter.signTransactions', () => {
	it('returns the raw signed bytes lute-connect resolves with', async () => {
		const txn = payment();
		const signed = txn.signTxn(a.sk);
		const { adapter } = adapterReturning([signed]);
		const out = await adapter.signTransactions([[txn]]);
		expect(out).toHaveLength(1);
		expect(algosdk.decodeSignedTransaction(out[0]).txn.txID()).toBe(txn.txID());
	});

	it('still accepts results wrapped as { blob }', async () => {
		const txn = payment();
		const signed = txn.signTxn(a.sk);
		const { adapter } = adapterReturning([{ blob: signed }]);
		const out = await adapter.signTransactions([[txn]]);
		expect(algosdk.decodeSignedTransaction(out[0]).txn.txID()).toBe(txn.txID());
	});

	it('returns an empty entry for an unsigned (null) result so the signer refuses it', async () => {
		const txn = payment();
		const { adapter } = adapterReturning([null]);
		const out = await adapter.signTransactions([[txn]]);
		expect(out).toHaveLength(1);
		expect(out[0].length).toBe(0);
	});

	it('keeps one entry per requested transaction across groups', async () => {
		const t1 = payment(1);
		const t2 = payment(2);
		const { adapter } = adapterReturning([t1.signTxn(a.sk), t2.signTxn(a.sk)]);
		const out = await adapter.signTransactions([[t1], [t2]]);
		expect(out.map((blob) => algosdk.decodeSignedTransaction(blob).txn.txID())).toEqual([
			t1.txID(),
			t2.txID()
		]);
	});
});

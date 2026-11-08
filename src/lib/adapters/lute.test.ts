import { describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import vm from 'node:vm';
import { LuteWalletAdapter } from './lute.js';
import { createWalletStore } from '../state/wallet-store.svelte.js';
import type { WalletScope } from '../state/scope.svelte.js';
import { createSigning, SignerResultMismatchError } from '../signing.js';

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

	it('accepts signed bytes created in another realm', async () => {
		const txn = payment();
		const foreign = vm.runInNewContext('new Uint8Array(bytes)', { bytes: txn.signTxn(a.sk) });
		expect(foreign instanceof Uint8Array).toBe(false);
		const { adapter } = adapterReturning([foreign]);
		const out = await adapter.signTransactions([[txn]]);
		expect(algosdk.decodeSignedTransaction(out[0]).txn.txID()).toBe(txn.txID());
	});

	it('returns empty bytes for an entry that is neither bytes nor { blob }', async () => {
		const { adapter } = adapterReturning([{ blob: 'abc' }]);
		const out = await adapter.signTransactions([[payment()]]);
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

describe('Lute adapter through the signer', () => {
	const signer = { address: a.addr.toString(), walletId: 'lute' as const };

	function signing(result: unknown) {
		const { adapter } = adapterReturning(result);
		vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
		const walletStore = createWalletStore('lute-signing-test');
		walletStore.addAccounts([{ ...signer, authenticated: false, isWatch: false }]);
		const scope = {
			walletStore,
			registry: { getAdapter: () => adapter },
			providerStore: { algodClient: null }
		} as unknown as Pick<WalletScope, 'walletStore' | 'registry' | 'providerStore'>;
		return createSigning(scope);
	}

	it('accepts raw signed bytes for the requested transaction', async () => {
		const txn = payment();
		const out = await signing([txn.signTxn(a.sk)]).signTransactions([[txn]], signer);
		expect(out).toHaveLength(1);
	});

	it('still refuses a different transaction', async () => {
		const error = await signing([payment(2).signTxn(a.sk)])
			.signTransactions([[payment(1)]], signer)
			.catch((e) => e);
		expect(error).toBeInstanceOf(SignerResultMismatchError);
		expect(error).toMatchObject({ reason: 'mismatch', index: 0 });
	});

	it('refuses a null entry as empty', async () => {
		const error = await signing([null])
			.signTransactions([[payment()]], signer)
			.catch((e) => e);
		expect(error).toMatchObject({ reason: 'empty', index: 0 });
	});

	it('refuses a result shorter than the request', async () => {
		const t1 = payment(1);
		const t2 = payment(2);
		const error = await signing([t1.signTxn(a.sk)])
			.signTransactions([[t1, t2]], signer)
			.catch((e) => e);
		expect(error).toBeInstanceOf(SignerResultMismatchError);
		expect(error).toMatchObject({ reason: 'count' });
	});
});

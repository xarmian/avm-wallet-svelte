import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import algosdk from 'algosdk';
import { Buffer } from 'buffer';
import { verifyToken } from './verify.js';

const owner = algosdk.generateAccount();
const other = algosdk.generateAccount();
const address = owner.addr.toString();
const now = Date.UTC(2026, 0, 1);
const day90 = 90 * 24 * 60 * 60 * 1000;
const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const;

function token({
	receiver = address,
	firstValid = 10,
	lastValid = 10,
	prefix = 'avm-wallet-auth',
	expiry = now + day90,
	note = `${prefix} ${expiry}`,
	key = owner.sk
} = {}) {
	const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: address,
		receiver,
		amount: 0,
		suggestedParams: {
			fee: 0,
			flatFee: true,
			firstValid,
			lastValid,
			genesisHash: new Uint8Array(32),
			genesisID: 'test-v1',
			minFee: 1000
		},
		note: Uint8Array.from(new TextEncoder().encode(note))
	});
	return Buffer.from(txn.signTxn(key)).toString('base64');
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	for (const method of consoleMethods) vi.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => {
	try {
		for (const method of consoleMethods) expect(console[method]).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

describe('verifyToken', () => {
	it('accepts a signed auth token for its own address', async () => {
		await expect(verifyToken(address, token())).resolves.toBe(true);
	});
	it('rejects the same token for another address', async () => {
		await expect(verifyToken(other.addr.toString(), token())).resolves.toBe(false);
	});
	it('rejects a signature made by another key', async () => {
		await expect(verifyToken(address, token({ key: other.sk }))).resolves.toBe(false);
	});
	it('rejects a receiver different from the sender', async () => {
		await expect(verifyToken(address, token({ receiver: other.addr.toString() }))).resolves.toBe(
			false
		);
	});
	it.each([{ firstValid: 9 }, { lastValid: 11 }])(
		'rejects wrong validity rounds: %j',
		async (rounds) => {
			await expect(verifyToken(address, token(rounds))).resolves.toBe(false);
		}
	);
	it('rejects a wrong note prefix', async () => {
		await expect(verifyToken(address, token({ prefix: 'other-auth' }))).resolves.toBe(false);
	});
	it.each([
		['past', now - 1],
		['too far ahead', now + day90 + 30 * 60 * 1000 + 1]
	])('throws when expiry is %s', async (_label, expiry) => {
		await expect(verifyToken(address, token({ expiry: Number(expiry) }))).rejects.toThrow(
			'Token expired, authenticate again'
		);
	});
	it.each([
		['non-numeric', 'avm-wallet-auth nope'],
		['Infinity', 'avm-wallet-auth Infinity'],
		['beyond the double range', 'avm-wallet-auth 1e999'],
		['empty', 'avm-wallet-auth '],
		['absent', 'avm-wallet-auth']
	])('throws when the expiry is %s', async (_label, note) => {
		await expect(verifyToken(address, token({ note }))).rejects.toThrow(
			'Token expired, authenticate again'
		);
	});
	it('accepts a valid numeric expiry shortly ahead', async () => {
		await expect(verifyToken(address, token({ expiry: now + 1000 }))).resolves.toBe(true);
	});
	it.each(['not base64!!!', Buffer.from('not a transaction').toString('base64')])(
		'rejects malformed token %s',
		async (garbage) => {
			await expect(verifyToken(address, garbage)).rejects.toThrow();
		}
	);
});

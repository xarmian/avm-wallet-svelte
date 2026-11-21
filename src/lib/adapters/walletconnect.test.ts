import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import algosdk from 'algosdk';
import { Buffer } from 'buffer';
import type { Algodv2 } from 'algosdk';

// The real UniversalProvider runs; only its SignClient is replaced by the fake below.
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@walletconnect/universal-provider', async (importOriginal) => {
	const real = await importOriginal<typeof import('@walletconnect/universal-provider')>();
	class TestProvider extends real.UniversalProvider {
		static async init(opts: Parameters<typeof real.UniversalProvider.init>[0]) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return real.UniversalProvider.init({ ...opts, client: holder.client as any });
		}
	}
	return { ...real, UniversalProvider: TestProvider, default: TestProvider };
});

import { WalletConnectAdapter } from './walletconnect.js';

const genesisHash = 'r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=';
const chain = `algorand:${genesisHash.substring(0, 32).replace(/\//g, '_')}`;
const account = algosdk.generateAccount();
const NS_KEY = 'wc@2:universal_provider:/namespaces';

interface FakeSession {
	topic: string;
	expiry: number;
	namespaces: Record<string, { accounts: string[]; methods: string[]; chains: string[] }>;
	peer: { metadata: { name: string } };
}

function session(topic: string, expiry: number): FakeSession {
	return {
		topic,
		expiry,
		namespaces: {
			algorand: {
				accounts: [`${chain}:${account.addr.toString()}`],
				methods: ['algo_signTxn'],
				chains: [chain]
			}
		},
		peer: { metadata: { name: 'Wallet' } }
	};
}

function payment() {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: account.addr,
		receiver: account.addr,
		amount: 0,
		suggestedParams: {
			fee: 1000,
			minFee: 1000,
			flatFee: true,
			firstValid: 1,
			lastValid: 100,
			genesisHash: new Uint8Array(Buffer.from(genesisHash, 'base64')),
			genesisID: 'test-v1'
		}
	});
}

function fakeClient(sessions: FakeSession[]) {
	const store = new Map(sessions.map((s) => [s.topic, s]));
	const kv = new Map<string, unknown>();
	for (const s of sessions) kv.set(`${NS_KEY}${s.topic}`, s.namespaces);
	const events = new EventEmitter();
	let pending: FakeSession | null = null;
	const client = {
		session: {
			getAll: () => [...store.values()],
			get: (topic: string) => store.get(topic),
			get keys() {
				return [...store.keys()];
			},
			get length() {
				return store.size;
			}
		},
		pairing: { getAll: () => [] },
		core: {
			projectId: 'test',
			expirer: { set: vi.fn() },
			relayer: { subscriber: { unsubscribe: vi.fn() } },
			storage: {
				getItem: async (k: string) => kv.get(k),
				setItem: async (k: string, v: unknown) => void kv.set(k, v),
				removeItem: async (k: string) => void kv.delete(k),
				getKeys: async () => [...kv.keys()]
			}
		},
		on: (e: string, l: (...a: unknown[]) => void) => events.on(e, l),
		once: (e: string, l: (...a: unknown[]) => void) => events.once(e, l),
		off: (e: string, l: (...a: unknown[]) => void) => events.off(e, l),
		removeListener: (e: string, l: (...a: unknown[]) => void) => events.off(e, l),
		request: vi.fn(async () => [Buffer.from(payment().signTxn(account.sk)).toString('base64')]),
		disconnect: vi.fn(async ({ topic }: { topic: string }) => void store.delete(topic)),
		// Pairing approval: the next connect() settles with the session queued by approveNext().
		connect: vi.fn(async () => ({
			uri: 'wc:test@2',
			approval: async () => {
				const s = pending!;
				store.set(s.topic, s);
				return s;
			}
		})),
		approveNext(s: FakeSession) {
			pending = s;
		},
		/** Delete or expire a session the way sign-client does: drop it, then emit. */
		drop(event: 'session_delete' | 'session_expire', topic: string) {
			store.delete(topic);
			events.emit(event, event === 'session_delete' ? { id: 1, topic } : { topic });
		},
		topics: () => [...store.keys()]
	};
	return client;
}

type Client = ReturnType<typeof fakeClient>;
// One project id per fake client: adapters on the same client share the provider singleton.
const projects = new WeakMap<Client, string>();

async function adapterOn(client: Client, variant: 'voiwallet' | 'biatec' = 'voiwallet') {
	holder.client = client;
	if (!projects.has(client)) projects.set(client, `project-${Math.random()}`);
	const adapter = new WalletConnectAdapter(variant);
	adapter.setWalletConnectConfig({
		projectId: projects.get(client)!,
		name: 'test',
		description: 'test',
		url: 'https://example.test',
		icons: []
	});
	await adapter.initialize({
		genesisHash,
		genesisId: 'test-v1',
		chainId: chain,
		algodClient: {} as Algodv2
	});
	await adapter.reconnect();
	return adapter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = (adapter: WalletConnectAdapter) => adapter as any;
const requestedTopic = (client: Client) =>
	(client.request.mock.calls.at(-1) as unknown as [{ topic: string }])[0].topic;

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('WalletConnectAdapter restored sessions', () => {
	it('signs on the newest eligible session after a reload', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('old', 1000), session('new', 2000)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(true);
		await adapter.signTransactions([[payment()]]);
		expect(requestedTopic(client)).toBe('new');
	});

	it('sends the request on the session the adapter restored, not the provider session', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('voi', 1000)]);
		const voi = await adapterOn(client);
		const biatec = await adapterOn(client, 'biatec');
		client.approveNext(session('biatec', 2000));
		await biatec.connect();
		await voi.signTransactions([[payment()]]);
		expect(requestedTopic(client)).toBe(internals(voi).session.topic);
		expect(requestedTopic(client)).toBe('voi');
	});

	it('prunes its own stale sessions and leaves another adapter session alone', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-session-topic-biatec', 'biatec');
		const client = fakeClient([
			session('old', 1000),
			session('biatec', 3000),
			session('new', 2000)
		]);
		await adapterOn(client);
		const pruned = client.disconnect.mock.calls.map((c) => (c as [{ topic: string }])[0].topic);
		expect(pruned).toEqual(['old']);
		expect(client.topics()).toEqual(['biatec', 'new']);
	});

	it('does not prune when another adapter may own the unrecorded sessions', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		const client = fakeClient([session('old', 1000), session('new', 2000)]);
		await adapterOn(client);
		expect(client.disconnect).not.toHaveBeenCalled();
	});

	it('disconnect leaves the provider off the deleted topic', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('only', 1000)]);
		const adapter = await adapterOn(client);
		await adapter.disconnect();
		const providerTopic = internals(adapter).provider.session?.topic;
		expect(providerTopic === undefined || client.topics().includes(providerTopic)).toBe(true);
		expect(adapter.isConnected()).toBe(false);
	});

	it('connect removes a session left by the 0.9.x owner key', async () => {
		localStorage.setItem('wc-session-owner', 'VoiWallet');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-session-topic-biatec', 'biatec');
		const client = fakeClient([session('legacy', 1000), session('biatec', 1500)]);
		const adapter = await adapterOn(client);
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(client.topics()).toEqual(['biatec', 'fresh']);
		expect(localStorage.getItem('wc-session-owner')).toBeNull();
	});

	it('connect removes its own session whose delete failed earlier', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('stale', 1000)]);
		const adapter = await adapterOn(client);
		const offline = new Error('offline');
		client.disconnect.mockRejectedValueOnce(offline).mockRejectedValueOnce(offline);
		await adapter.disconnect().catch(() => {});
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(client.topics()).toEqual(['fresh']);
	});

	it.each(['session_expire', 'session_delete'] as const)(
		'%s on the SignClient for its topic disconnects the adapter',
		async (event) => {
			localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
			const client = fakeClient([session('voi', 1000), session('other', 900)]);
			const voi = await adapterOn(client);
			const biatec = await adapterOn(client, 'biatec');
			client.approveNext(session('biatec', 2000));
			await biatec.connect();
			client.drop(event, 'other');
			expect(voi.isConnected()).toBe(true);
			client.drop(event, 'voi');
			expect(voi.isConnected()).toBe(false);
			expect(biatec.isConnected()).toBe(true);
		}
	);

	it('rejects signTransactions when the wallet request expires', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('only', 1000)]);
		const adapter = await adapterOn(client);
		client.request.mockRejectedValueOnce(new Error('Request expired. Please try again.'));
		await expect(adapter.signTransactions([[payment()]])).rejects.toThrow('Request expired');
	});
});

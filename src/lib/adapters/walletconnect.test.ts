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

import { WalletConnectAdapter, onSessionStateChange } from './walletconnect.js';

const genesisHash = 'r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=';
const chainOf = (hash: string) => `algorand:${hash.substring(0, 32).replace(/\//g, '_')}`;
const chain = chainOf(genesisHash);
const otherGenesisHash = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';
const otherChain = chainOf(otherGenesisHash);
// Session expiries are in seconds; keep them in the future so nothing counts as expired.
const NOW = Math.floor(Date.now() / 1000) + 86400;
const account = algosdk.generateAccount();
const NS_KEY = 'wc@2:universal_provider:/namespaces';

interface FakeSession {
	topic: string;
	expiry: number;
	namespaces: Record<string, { accounts: string[]; methods: string[]; chains: string[] }>;
	peer: { metadata: { name: string } };
}

function session(topic: string, expiry: number, onChain = chain): FakeSession {
	return {
		topic,
		expiry: NOW + expiry,
		namespaces: {
			algorand: {
				accounts: [`${onChain}:${account.addr.toString()}`],
				methods: ['algo_signTxn'],
				chains: [onChain]
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
		/**
		 * Delete or expire a session the way sign-client does: drop it, then emit. A peer
		 * delete emits session_delete with the request id; an expiry emits session_delete
		 * (id 0) and then session_expire.
		 */
		drop(event: 'session_delete' | 'session_expire', topic: string) {
			store.delete(topic);
			if (event === 'session_delete') {
				events.emit('session_delete', { id: 1, topic });
			} else {
				events.emit('session_delete', { id: 0, topic });
				events.emit('session_expire', { topic });
			}
		},
		topics: () => [...store.keys()],
		kv
	};
	return client;
}

type Client = ReturnType<typeof fakeClient>;
// One project id per fake client: adapters on the same client share the provider singleton.
const projects = new WeakMap<Client, string>();

async function adapterOn(
	client: Client,
	variant: 'voiwallet' | 'biatec' | 'walletconnect' = 'voiwallet',
	{ scope, hash = genesisHash }: { scope?: string; hash?: string } = {}
) {
	holder.client = client;
	if (!projects.has(client)) projects.set(client, `project-${Math.random()}`);
	const adapter = new WalletConnectAdapter(variant);
	if (scope) adapter.setScopeId(scope);
	adapter.setWalletConnectConfig({
		projectId: projects.get(client)!,
		name: 'test',
		description: 'test',
		url: 'https://example.test',
		icons: []
	});
	await adapter.initialize({
		genesisHash: hash,
		genesisId: 'test-v1',
		chainId: chain,
		algodClient: {} as Algodv2
	});
	await adapter.reconnect();
	return adapter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = (adapter: WalletConnectAdapter) => adapter as any;
const lastRequest = (client: Client) =>
	(client.request.mock.calls.at(-1) as unknown as [{ topic: string; chainId: string }])[0];
const requestedTopic = (client: Client) => lastRequest(client).topic;

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	vi.useRealTimers();
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
		const voi = await adapterOn(client);
		const biatec = await adapterOn(client, 'biatec');
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(voi.isConnected()).toBe(false);
		expect(biatec.isConnected()).toBe(false);
	});

	it('adopts no unrecorded session while another adapter also claims them', async () => {
		for (const id of ['voiwallet', 'walletconnect']) {
			localStorage.setItem(`wc-session-owner-${id}`, id);
			localStorage.setItem(`wc-chainId-${id}`, chain);
		}
		const client = fakeClient([session('V', 1000), session('W', 2000)]);
		const voi = await adapterOn(client);
		const wc = await adapterOn(client, 'walletconnect');
		expect(voi.isConnected()).toBe(false);
		expect(wc.isConnected()).toBe(false);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(client.topics()).toEqual(['V', 'W']);
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBeNull();
		expect(localStorage.getItem('wc-session-topic-walletconnect')).toBeNull();
	});

	it('restores nothing and forgets its keys when its recorded session is gone', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-voiwallet', chain);
		localStorage.setItem('wc-session-topic-voiwallet', 'gone');
		const client = fakeClient([session('other', 1000)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(client.topics()).toEqual(['other']);
		expect(localStorage.getItem('wc-session-owner-voiwallet')).toBeNull();
		expect(localStorage.getItem('wc-chainId-voiwallet')).toBeNull();
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBeNull();
	});

	it('signs with a chain the restored session holds when it matched the stored chain', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-voiwallet', otherChain);
		const client = fakeClient([session('voi', 1000, otherChain)]);
		const adapter = await adapterOn(client);
		await adapter.signTransactions([[payment()]]);
		expect(lastRequest(client).chainId).toBe(otherChain);
	});

	it('does not adopt the session another scope claims on its own chain', async () => {
		localStorage.setItem('wc-session-owner-a-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-a-voiwallet', chain);
		localStorage.setItem('wc-session-owner-b-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-b-voiwallet', otherChain);
		const client = fakeClient([session('b', 1000, otherChain)]);
		const a = await adapterOn(client, 'voiwallet', { scope: 'a' });
		expect(a.isConnected()).toBe(false);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(localStorage.getItem('wc-chainId-a-voiwallet')).toBe(chain);
		const b = await adapterOn(client, 'voiwallet', { scope: 'b', hash: otherGenesisHash });
		expect(b.isConnected()).toBe(true);
		expect(localStorage.getItem('wc-session-topic-b-voiwallet')).toBe('b');
	});

	it('restores a session recorded only by the 0.9.x owner key', async () => {
		localStorage.setItem('wc-session-owner', 'VoiWallet');
		const client = fakeClient([session('legacy', 1000)]);
		const biatec = await adapterOn(client, 'biatec');
		expect(biatec.isConnected()).toBe(false);
		const voi = await adapterOn(client);
		expect(voi.isConnected()).toBe(true);
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('legacy');
		expect(localStorage.getItem('wc-session-owner-voiwallet')).toBe('voiwallet');
		expect(localStorage.getItem('wc-session-owner')).toBeNull();
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

	it('disconnect without a session leaves another adapter session alone', async () => {
		const client = fakeClient([]);
		const voi = await adapterOn(client);
		const biatec = await adapterOn(client, 'biatec');
		client.approveNext(session('biatec', 2000));
		await biatec.connect();
		await voi.disconnect();
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(client.topics()).toEqual(['biatec']);
		expect(biatec.isConnected()).toBe(true);
	});

	it('removes the provider keys of a session that is not the provider session', async () => {
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-session-topic-biatec', 'b');
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-topic-voiwallet', 'v');
		const client = fakeClient([session('b', 1000), session('v', 2000)]);
		for (const key of ['optionalNamespaces', 'sessionProperties']) {
			for (const t of ['b', 'v']) client.kv.set(`wc@2:universal_provider:/${key}${t}`, {});
		}
		const adapter = await adapterOn(client);
		expect(internals(adapter).provider.session?.topic).toBe('b');
		await adapter.disconnect();
		expect(client.topics()).toEqual(['b']);
		const keys = [...client.kv.keys()].filter((k) => k.startsWith('wc@2:universal_provider:/'));
		expect(keys.filter((k) => k.endsWith('v'))).toEqual([]);
		expect(keys.filter((k) => k.endsWith('b'))).toHaveLength(3);
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
		// Every delete fails while offline; the store keeps the session.
		const online = client.disconnect.getMockImplementation()!;
		client.disconnect.mockRejectedValue(new Error('offline'));
		await adapter.disconnect().catch(() => {});
		expect(client.topics()).toEqual(['stale']);
		client.disconnect.mockImplementation(online);
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(client.topics()).toEqual(['fresh']);
	});

	it('keeps the recorded topic until removing its session succeeds', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('stale', 1000)]);
		const adapter = await adapterOn(client);
		const online = client.disconnect.getMockImplementation()!;
		client.disconnect.mockRejectedValue(new Error('offline'));
		await adapter.disconnect().catch(() => {});
		client.connect.mockImplementationOnce(async () => ({
			uri: 'wc:test@2',
			approval: async () => {
				throw new Error('Pairing rejected');
			}
		}));
		await expect(adapter.connect()).rejects.toThrow('Pairing rejected');
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('stale');
		expect(client.topics()).toEqual(['stale']);
		client.disconnect.mockImplementation(online);
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(client.topics()).toEqual(['fresh']);
	});

	it.each(['session_expire', 'session_delete'] as const)(
		'%s on the SignClient for its topic disconnects the adapter',
		async (event) => {
			const states: string[] = [];
			onSessionStateChange((e) => states.push(e.type));
			localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
			const client = fakeClient([session('voi', 1000), session('other', 900)]);
			const voi = await adapterOn(client);
			const biatec = await adapterOn(client, 'biatec');
			client.approveNext(session('biatec', 2000));
			await biatec.connect();
			// An expiry fires once the session's expiry time has passed.
			if (event === 'session_expire') {
				vi.useFakeTimers({ toFake: ['Date'] });
				vi.setSystemTime((NOW + 1500) * 1000);
			}
			client.drop(event, 'other');
			expect(voi.isConnected()).toBe(true);
			client.drop(event, 'voi');
			expect(voi.isConnected()).toBe(false);
			expect(biatec.isConnected()).toBe(true);
			expect(states).toEqual([event === 'session_expire' ? 'expired' : 'deleted']);
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

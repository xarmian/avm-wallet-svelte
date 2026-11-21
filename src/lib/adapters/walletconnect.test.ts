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

import {
	WalletConnectAdapter,
	onSessionStateChange,
	onWalletConnectModal,
	type WalletConnectModalEvent
} from './walletconnect.js';

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
		// Like sign-client, a delete waits on the relay before the session leaves the store
		disconnect: vi.fn(async ({ topic }: { topic: string }) => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			store.delete(topic);
		}),
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
		/** Emit a SignClient event without touching the store. */
		emit(event: string, payload: unknown) {
			events.emit(event, payload);
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
	{
		scope,
		hash = genesisHash,
		restore = true
	}: { scope?: string; hash?: string; restore?: boolean } = {}
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
	if (restore) await adapter.reconnect();
	return adapter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = (adapter: WalletConnectAdapter) => adapter as any;
const lastRequest = (client: Client) =>
	(client.request.mock.calls.at(-1) as unknown as [{ topic: string; chainId: string }])[0];
const requestedTopic = (client: Client) => lastRequest(client).topic;
const deleted = (client: Client) =>
	client.disconnect.mock.calls.map((c) => (c as [{ topic: string }])[0].topic);
const quarantined = () =>
	JSON.parse(localStorage.getItem('wc-session-topic-unattributed') ?? '[]') as string[];
/** A page reload: a new SignClient over the same stored sessions, localStorage kept. */
const reloaded = (client: Client) => fakeClient(client.session.getAll() as FakeSession[]);

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

	it('restores the newest unrecorded session for the sole claim and prunes the rest', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-voiwallet', chain);
		const client = fakeClient([session('old', 1000), session('new', 2000)]);
		const voi = await adapterOn(client);
		expect(internals(voi).session.topic).toBe('new');
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('new');
		expect(deleted(client)).toEqual(['old']);
		expect(client.topics()).toEqual(['new']);
	});

	it('quarantines unrecorded sessions when a claim sits beside recorded topics', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-session-topic-biatec', 'biatec');
		const client = fakeClient([
			session('old', 1000),
			session('biatec', 3000),
			session('new', 2000)
		]);
		const voi = await adapterOn(client);
		expect(voi.isConnected()).toBe(false);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(client.topics()).toEqual(['old', 'biatec', 'new']);
		expect(quarantined()).toEqual(['old', 'new']);
	});

	it('drops a stale 0.9.x owner key and lets the one 3.x claim restore', async () => {
		localStorage.setItem('wc-session-owner', 'WalletConnect');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-chainId-biatec', chain);
		const client = fakeClient([session('B', 1000)]);
		const wc = await adapterOn(client, 'walletconnect');
		const biatec = await adapterOn(client, 'biatec');
		expect(wc.isConnected()).toBe(false);
		expect(biatec.isConnected()).toBe(true);
		expect(internals(biatec).session.topic).toBe('B');
		expect(localStorage.getItem('wc-session-owner')).toBeNull();
		expect(localStorage.getItem('wc-session-topic-biatec')).toBe('B');
		expect(localStorage.getItem('wc-session-topic-walletconnect')).toBeNull();
	});

	it('keeps quarantined sessions out of a later reload after one adapter reconnects', async () => {
		for (const id of ['biatec', 'voiwallet']) {
			localStorage.setItem(`wc-session-owner-${id}`, id);
			localStorage.setItem(`wc-chainId-${id}`, chain);
		}
		const client = fakeClient([session('oldB', 1000), session('oldV', 2000)]);
		const biatec = await adapterOn(client, 'biatec');
		const voi = await adapterOn(client);
		expect(biatec.isConnected()).toBe(false);
		expect(voi.isConnected()).toBe(false);
		expect(quarantined()).toEqual(['oldB', 'oldV']);
		client.approveNext(session('N', 3000));
		await voi.connect();
		expect(client.topics()).toEqual(['oldB', 'oldV', 'N']);

		const next = reloaded(client);
		const biatec2 = await adapterOn(next, 'biatec');
		const voi2 = await adapterOn(next);
		expect(biatec2.isConnected()).toBe(false);
		expect(next.disconnect).not.toHaveBeenCalled();
		expect(next.topics()).toEqual(['oldB', 'oldV', 'N']);
		expect(internals(voi2).session.topic).toBe('N');
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
		expect(quarantined()).toEqual(['old', 'new']);
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

	it('signs with the stored session chain, then proposes the configured chain again', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-voiwallet', otherChain);
		const client = fakeClient([session('voi', 1000, otherChain)]);
		const adapter = await adapterOn(client);
		await adapter.signTransactions([[payment()]]);
		expect(lastRequest(client).chainId).toBe(otherChain);
		await adapter.disconnect();
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		const proposal = (
			client.connect.mock.calls.at(-1) as unknown as [
				{ optionalNamespaces: { algorand: { chains: string[] } } }
			]
		)[0];
		expect(proposal.optionalNamespaces.algorand.chains).toEqual([chain]);
	});

	it('does not adopt the session of another scope', async () => {
		localStorage.setItem('wc-session-owner-a-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-a-voiwallet', chain);
		localStorage.setItem('wc-session-owner-b-voiwallet', 'voiwallet');
		localStorage.setItem('wc-chainId-b-voiwallet', otherChain);
		const client = fakeClient([session('a', 1000), session('b', 1000, otherChain)]);
		const a = await adapterOn(client, 'voiwallet', { scope: 'a' });
		const b = await adapterOn(client, 'voiwallet', { scope: 'b', hash: otherGenesisHash });
		expect(a.isConnected()).toBe(false);
		expect(b.isConnected()).toBe(false);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(localStorage.getItem('wc-session-topic-a-voiwallet')).toBeNull();
		expect(localStorage.getItem('wc-session-topic-b-voiwallet')).toBeNull();
		expect(quarantined()).toEqual(['a', 'b']);
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

	it('keeps the topic of an invalid recorded session whose removal failed', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-topic-voiwallet', 'bad');
		const bad = session('bad', 1000);
		bad.namespaces.algorand.methods = [];
		const client = fakeClient([bad]);
		client.disconnect.mockRejectedValue(new Error('offline'));
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(deleted(client)).toContain('bad');
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('bad');
	});

	it.each([true, false])(
		'disconnect before restoring removes the recorded session (delete succeeds: %s)',
		async (online) => {
			localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
			localStorage.setItem('wc-chainId-voiwallet', chain);
			localStorage.setItem('wc-session-topic-voiwallet', 'v');
			const client = fakeClient([session('v', 1000)]);
			if (!online) client.disconnect.mockRejectedValue(new Error('offline'));
			const adapter = await adapterOn(client, 'voiwallet', { restore: false });
			await adapter.disconnect();
			expect(deleted(client)).toContain('v');
			expect(adapter.isConnected()).toBe(false);
			expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe(online ? null : 'v');
			expect(client.topics()).toEqual(online ? [] : ['v']);
		}
	);

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

	it('treats the 0.9.x owner key as stale next to a 3.x claim and quarantines its session', async () => {
		localStorage.setItem('wc-session-owner', 'VoiWallet');
		localStorage.setItem('wc-session-owner-biatec', 'biatec');
		localStorage.setItem('wc-session-topic-biatec', 'biatec');
		const client = fakeClient([session('legacy', 1000), session('biatec', 1500)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(localStorage.getItem('wc-session-owner')).toBeNull();
		expect(quarantined()).toEqual(['legacy']);
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(client.topics()).toEqual(['legacy', 'biatec', 'fresh']);
	});

	it('prunes quarantined topics that are no longer stored', async () => {
		localStorage.setItem('wc-session-topic-unattributed', JSON.stringify(['gone', 'q']));
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('q', 1000)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(quarantined()).toEqual(['q']);
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

	it('does not restore a session the user disconnected while offline; it removes it instead', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('stale', 1000)]);
		const adapter = await adapterOn(client);
		client.disconnect.mockRejectedValue(new Error('offline'));
		await adapter.disconnect().catch(() => {});
		expect(client.topics()).toEqual(['stale']);

		// Reload while still offline: nothing restored, the topic stays for a retry
		const offline = reloaded(client);
		offline.disconnect.mockRejectedValue(new Error('offline'));
		const again = await adapterOn(offline);
		expect(again.isConnected()).toBe(false);
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('stale');

		// Reload online: still nothing restored, and the pending removal goes through
		const online = reloaded(offline);
		const third = await adapterOn(online);
		expect(third.isConnected()).toBe(false);
		expect(online.topics()).toEqual([]);
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBeNull();
	});

	it('keeps a disconnect pending when the provider could not initialize', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-topic-voiwallet', 'v');
		const client = fakeClient([session('v', 1000)]);
		// A new page whose provider init does not complete, then a disconnect
		const adapter = await adapterOn(client, 'voiwallet', { restore: false });
		internals(adapter).provider = null;
		internals(adapter).ensureInitialized = async () => {
			throw new Error('init');
		};
		await adapter.disconnect();
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('v');
		expect(localStorage.getItem('wc-session-owner-voiwallet')).toBeNull();

		// The next load removes it rather than restoring it
		const next = reloaded(client);
		const again = await adapterOn(next);
		expect(again.isConnected()).toBe(false);
		expect(next.topics()).toEqual([]);
	});

	it('consumes leftover owner claims so a later unrecorded session is not credited to them', async () => {
		localStorage.setItem('wc-session-owner-walletconnect', 'walletconnect');
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		localStorage.setItem('wc-session-topic-voiwallet', 'v');
		const client = fakeClient([session('v', 1000)]);
		await adapterOn(client);
		await adapterOn(client, 'walletconnect');
		expect(localStorage.getItem('wc-session-owner-walletconnect')).toBeNull();

		// V later loses its record (for example an older tab clears the keys)
		localStorage.removeItem('wc-session-owner-voiwallet');
		localStorage.removeItem('wc-session-topic-voiwallet');
		const next = reloaded(client);
		const generic = await adapterOn(next, 'walletconnect');
		expect(generic.isConnected()).toBe(false);
		expect(quarantined()).toEqual(['v']);
	});

	it('attributes once when several adapters start together on one page load', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('old', 1000), session('new', 2000)]);
		const [voi, biatec, generic] = await Promise.all([
			adapterOn(client),
			adapterOn(client, 'biatec'),
			adapterOn(client, 'walletconnect')
		]);
		expect(voi.isConnected()).toBe(true);
		expect(biatec.isConnected()).toBe(false);
		expect(generic.isConnected()).toBe(false);
		await voi.signTransactions([[payment()]]);
		expect(requestedTopic(client)).toBe('new');
		// Only the old session may be removed; nothing else is touched
		expect(deleted(client).every((t) => t === 'old')).toBe(true);
		expect(client.topics()).toContain('new');
		// The claimant keeps its record even though the others attributed while it pruned
		expect(localStorage.getItem('wc-session-owner-voiwallet')).toBe('voiwallet');
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('new');
		expect(quarantined().every((t) => t === 'old')).toBe(true);
	});

	it('quarantines unrecorded sessions when the sole claim has none it can use', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('elsewhere', 1000, otherChain)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(quarantined()).toEqual(['elsewhere']);
		expect(localStorage.getItem('wc-session-owner-voiwallet')).toBeNull();
		expect(client.disconnect).not.toHaveBeenCalled();
	});

	it('quarantines an old session whose removal never went through once a new one pairs', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('stale', 1000)]);
		const adapter = await adapterOn(client);
		// The delete keeps being refused, but pairing works
		client.disconnect.mockRejectedValue(new Error('refused'));
		await adapter.disconnect();
		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBe('fresh');
		expect(quarantined()).toEqual(['stale']);
		// A later reload restores the new session, not the old one
		const next = reloaded(client);
		const again = await adapterOn(next);
		await again.signTransactions([[payment()]]);
		expect(requestedTopic(next)).toBe('fresh');
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

	it('session_expire alone for its topic disconnects the adapter as expired', async () => {
		const states: string[] = [];
		onSessionStateChange((e) => states.push(e.type));
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('voi', 1000)]);
		const voi = await adapterOn(client);
		client.emit('session_expire', { topic: 'other' });
		expect(voi.isConnected()).toBe(true);
		client.emit('session_expire', { topic: 'voi' });
		expect(voi.isConnected()).toBe(false);
		expect(states).toEqual(['expired']);
		expect(localStorage.getItem('wc-session-topic-voiwallet')).toBeNull();
	});

	it('propagates a client request rejection from signTransactions', async () => {
		localStorage.setItem('wc-session-owner-voiwallet', 'voiwallet');
		const client = fakeClient([session('only', 1000)]);
		const adapter = await adapterOn(client);
		client.request.mockRejectedValueOnce(new Error('Request expired. Please try again.'));
		await expect(adapter.signTransactions([[payment()]])).rejects.toThrow('Request expired');
		expect(adapter.isConnected()).toBe(true);
	});
});

describe('WalletConnectAdapter pairing URI', () => {
	const rejectNextPairing = (client: Client) =>
		client.connect.mockImplementationOnce(async () => ({
			uri: 'wc:test@2',
			approval: async () => {
				throw new Error('Pairing rejected');
			}
		}));

	it('shows a later pairing URI only in the scope of the adapter that is connecting', async () => {
		const seen: Record<string, WalletConnectModalEvent[]> = { a: [], b: [] };
		const off = ['a', 'b'].map((scope) => onWalletConnectModal((e) => seen[scope].push(e), scope));
		try {
			const client = fakeClient([]);
			const a = await adapterOn(client, 'voiwallet', { scope: 'a' });
			const b = await adapterOn(client, 'biatec', { scope: 'b' });
			client.approveNext(session('A', 1000));
			await a.connect();
			seen.a = [];
			client.approveNext(session('B', 2000));
			await b.connect();
			expect(seen.a).toEqual([]);
			expect(seen.b.filter((e) => e.type === 'show')).toEqual([
				{ type: 'show', uri: 'wc:test@2', walletName: b.name }
			]);
		} finally {
			off.forEach((f) => f());
		}
	});

	it('stops showing pairing URIs to an adapter whose connect failed', async () => {
		const seen: WalletConnectModalEvent[] = [];
		const off = onWalletConnectModal((e) => seen.push(e), 'a');
		try {
			const client = fakeClient([]);
			const a = await adapterOn(client, 'voiwallet', { scope: 'a' });
			rejectNextPairing(client);
			await expect(a.connect()).rejects.toThrow('Pairing rejected');
			seen.length = 0;
			internals(a).provider.events.emit('display_uri', 'wc:later@2');
			expect(seen).toEqual([]);
		} finally {
			off();
		}
	});
});

describe('WalletConnectAdapter pending removals', () => {
	const OWNER = 'wc-session-owner-voiwallet';
	const TOPIC = 'wc-session-topic-voiwallet';
	const PENDING = 'wc-session-pending-voiwallet';

	it('restores a recorded session whose owner key is missing and no removal is pending', async () => {
		localStorage.setItem(TOPIC, 'v');
		localStorage.setItem('wc-chainId-voiwallet', chain);
		const client = fakeClient([session('v', 1000)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(true);
		expect((await adapter.connect()).map((a) => a.address)).toEqual([account.addr.toString()]);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(client.topics()).toEqual(['v']);
		expect(localStorage.getItem(OWNER)).toBe('voiwallet');
		expect(localStorage.getItem(TOPIC)).toBe('v');
	});

	it('removes a recorded session marked as a pending removal and clears its keys', async () => {
		localStorage.setItem(TOPIC, 'v');
		localStorage.setItem(PENDING, 'v');
		const client = fakeClient([session('v', 1000)]);
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(deleted(client)).toEqual(['v']);
		expect(client.topics()).toEqual([]);
		expect(localStorage.getItem(TOPIC)).toBeNull();
		expect(localStorage.getItem(PENDING)).toBeNull();
	});

	it.each(['restore', 'connect'] as const)(
		'a failed disconnect marks its topic pending until a later %s removes it',
		async (later) => {
			localStorage.setItem(OWNER, 'voiwallet');
			const client = fakeClient([session('stale', 1000)]);
			const adapter = await adapterOn(client);
			const online = client.disconnect.getMockImplementation()!;
			client.disconnect.mockRejectedValue(new Error('offline'));
			await adapter.disconnect();
			expect(client.topics()).toEqual(['stale']);
			expect(localStorage.getItem(TOPIC)).toBe('stale');
			expect(localStorage.getItem(PENDING)).toBe('stale');

			if (later === 'restore') {
				const next = reloaded(client);
				const again = await adapterOn(next);
				expect(again.isConnected()).toBe(false);
				expect(next.topics()).toEqual([]);
				expect(localStorage.getItem(TOPIC)).toBeNull();
			} else {
				client.disconnect.mockImplementation(online);
				client.approveNext(session('fresh', 2000));
				await adapter.connect();
				expect(client.topics()).toEqual(['fresh']);
				expect(localStorage.getItem(TOPIC)).toBe('fresh');
			}
			expect(localStorage.getItem(PENDING)).toBeNull();
		}
	);

	it('an invalid session whose removal failed is marked pending until a connect succeeds', async () => {
		localStorage.setItem(OWNER, 'voiwallet');
		localStorage.setItem(TOPIC, 'bad');
		const bad = session('bad', 1000);
		bad.namespaces.algorand.methods = [];
		const client = fakeClient([bad]);
		client.disconnect.mockRejectedValue(new Error('offline'));
		const adapter = await adapterOn(client);
		expect(adapter.isConnected()).toBe(false);
		expect(localStorage.getItem(TOPIC)).toBe('bad');
		expect(localStorage.getItem(PENDING)).toBe('bad');

		client.approveNext(session('fresh', 2000));
		await adapter.connect();
		expect(localStorage.getItem(TOPIC)).toBe('fresh');
		expect(localStorage.getItem(OWNER)).toBe('voiwallet');
		expect(localStorage.getItem(PENDING)).toBeNull();
	});
});

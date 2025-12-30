import { UniversalProvider } from '@walletconnect/universal-provider';
import type { SessionTypes } from '@walletconnect/types';
import { connectedWallets, wcProjectStore, ProviderStore } from './store.js';
import { type WalletConnectionResult } from './wallets.js';
import algosdk from 'algosdk';
import { Buffer } from 'buffer';
import { get, writable } from 'svelte/store';
import { BROWSER } from 'esm-env';

export const WalletName = 'WalletConnect';

let provider: InstanceType<typeof UniversalProvider> | null = null;
let session: SessionTypes.Struct | null = null;
let subscribed = false;

let CHAIN_ID: string | null = null;

let initialized = false;
let initializationPromise: Promise<void> | null = null;

// Track the intended wallet name for WalletConnect connections
let intendedWalletName: string = WalletName;

// Track which wallet type owns the current WalletConnect session
let sessionOwner: string | null = null;

async function initialize() {
	if (initialized) return;
	if (initializationPromise) return initializationPromise;

	initializationPromise = (async () => {
		try {
			const universalProvider = await createUniversalProvider();
			if (!universalProvider) return;

			// Try to restore session owner from localStorage
			if (typeof window !== 'undefined' && window.localStorage) {
				const storedOwner = localStorage.getItem('wc-session-owner');
				if (storedOwner) {
					sessionOwner = storedOwner;
					intendedWalletName = storedOwner;
					console.log('Restored session owner from localStorage:', sessionOwner);
				}
			}

			// Get existing sessions
			const sessions = universalProvider.session ? [universalProvider.session] : [];

			// Find the most recent active session
			const lastSession = sessions[0];

			if (lastSession) {
				// Validate that the session has the required Algorand namespace configuration
				const algorandNamespace = lastSession.namespaces['algorand'];
				const hasRequiredMethods = algorandNamespace?.methods?.includes('algo_signTxn');
				const hasRequiredChain = algorandNamespace?.chains?.includes(CHAIN_ID!);

				if (
					algorandNamespace &&
					algorandNamespace.accounts &&
					hasRequiredMethods &&
					hasRequiredChain
				) {
					session = lastSession;

					// Only restore wallets if we have a session owner
					if (sessionOwner) {
						// Restore connected wallets from session with the correct wallet type
						const wallets = algorandNamespace.accounts.map((account: string) => {
							const [, , address] = account.split(':');
							return { address, app: sessionOwner };
						});

						connectedWallets.add(wallets);
						console.log('Restored valid WalletConnect session for', sessionOwner);
					} else {
						console.log('Session found but no owner - will be claimed on next connect');
					}
				} else {
					// Session is invalid - disconnect it
					console.log('Found invalid WalletConnect session, cleaning up...');
					try {
						await universalProvider.disconnect();
					} catch (e) {
						console.warn('Failed to disconnect invalid session:', e);
					}
					session = null;
					sessionOwner = null;
					if (typeof window !== 'undefined' && window.localStorage) {
						localStorage.removeItem('wc-session-owner');
					}
				}
			}

			initialized = true;
		} catch (error) {
			console.error('Failed to initialize WalletConnect:', error);
		} finally {
			initializationPromise = null;
		}
	})();

	return initializationPromise;
}

async function getGenesisHash(algodClient: algosdk.Algodv2) {
	try {
		const params = await algodClient.getTransactionParams().do();
		return Buffer.from(params.genesisHash).toString('base64').substring(0, 32).replaceAll('/', '_');
	} catch (error) {
		console.error('An error occurred:', error);
		return null;
	}
}

async function createUniversalProvider() {
	const wcProject = get(wcProjectStore);
	const PROJECT_ID = wcProject.projectId;

	if (!PROJECT_ID) {
		throw new Error('Missing WalletConnect project ID');
	}

	const providerStoreValue = get(ProviderStore);
	if (!providerStoreValue.algodClient) {
		return null;
	}

	const genesisHash = await getGenesisHash(providerStoreValue.algodClient);

	if (!genesisHash) {
		throw new Error('Genesis ID not found: algodClient handle needed to connect to WalletConnect');
	}

	CHAIN_ID = 'algorand:' + genesisHash;

	if (!provider) {
		provider = await UniversalProvider.init({
			projectId: PROJECT_ID,
			metadata: {
				name: wcProject.projectName,
				description: wcProject.projectDescription,
				url: wcProject.projectUrl,
				icons: wcProject.projectIcons
			}
		});
		await subscribeToEvents(provider);
	}
	return provider;
}

// Simple modal state stores
export const showModal = writable(false);
export const connectionUri = writable('');
export const modalWalletName = writable('');

// Export functions to control the modal from components
export function showWalletConnectModal(uri: string, walletName?: string) {
	connectionUri.set(uri);
	modalWalletName.set(walletName || WalletName);
	showModal.set(true);
}

export function hideWalletConnectModal() {
	showModal.set(false);
	connectionUri.set('');
	modalWalletName.set('');
}

export async function hasActiveSession(): Promise<boolean> {
	await initialize();
	const universalProvider = await createUniversalProvider();
	if (!universalProvider || !session) return false;

	// Check if session topics match
	if (universalProvider.session?.topic !== session.topic) return false;

	// Validate that the session has the correct Algorand namespace configuration
	const algorandNamespace = session.namespaces['algorand'];
	const hasRequiredMethods = algorandNamespace?.methods?.includes('algo_signTxn');
	const hasRequiredChain = algorandNamespace?.chains?.includes(CHAIN_ID!);

	return !!(algorandNamespace && hasRequiredMethods && hasRequiredChain);
}

export async function connect(walletName?: string): Promise<WalletConnectionResult[] | null> {
	// Set the intended wallet name if provided, otherwise use the default
	if (walletName) {
		intendedWalletName = walletName;
	}

	try {
		await initialize();
		const universalProvider = await createUniversalProvider();

		if (!universalProvider) {
			throw new Error('Failed to initialize provider');
		}

		// Check if another wallet type owns the current session
		if (sessionOwner && sessionOwner !== intendedWalletName && (await hasActiveSession())) {
			console.log(
				`Existing session owned by ${sessionOwner}, disconnecting to connect ${intendedWalletName}...`
			);
			try {
				await universalProvider.disconnect();
				session = null;
				sessionOwner = null;
			} catch (e) {
				console.warn('Failed to disconnect existing session:', e);
			}
		}

		// Check if we have a valid existing session for this wallet type
		if (sessionOwner === intendedWalletName && (await hasActiveSession())) {
			const algorandNamespace = session!.namespaces['algorand'];
			if (algorandNamespace && algorandNamespace.accounts) {
				console.log('Using existing valid WalletConnect session for', intendedWalletName);
				return algorandNamespace.accounts.map((account: string) => {
					const [, , address] = account.split(':');
					return { address, app: intendedWalletName };
				});
			}
		}

		// If we reach here, we need a new connection or the existing session is invalid
		if (universalProvider.session && session) {
			console.log('Existing session is invalid, disconnecting...');
			try {
				await universalProvider.disconnect();
			} catch (e) {
				console.warn('Failed to disconnect invalid session:', e);
			}
			session = null;
			sessionOwner = null;
		}

		// Connect provider and get URI
		console.log('Connecting provider with CHAIN_ID:', CHAIN_ID);
		console.log('Required namespace configuration:', {
			algorand: {
				chains: [CHAIN_ID!],
				methods: ['algo_signTxn'],
				events: []
			}
		});

		// Listen for display_uri event to show our custom modal
		universalProvider.on('display_uri', (uri: string) => {
			console.log('Display URI:', uri);
			showWalletConnectModal(uri, intendedWalletName);
		});

		const namespaceConfig = {
			requiredNamespaces: {
				algorand: {
					chains: [CHAIN_ID!],
					methods: ['algo_signTxn'],
					events: []
				}
			}
		};

		console.log('🔗 Connecting with namespace config:', JSON.stringify(namespaceConfig, null, 2));

		const sessionData = await universalProvider.connect(namespaceConfig);

		console.log('📋 Session data received:', JSON.stringify(sessionData, null, 2));
		session = sessionData || null;

		if (session) {
			console.log('✅ Session created successfully');
			console.log('Session topic:', session.topic);
			console.log('Session namespaces:', JSON.stringify(session.namespaces, null, 2));
			// Set the session owner to the wallet that created this session
			sessionOwner = intendedWalletName;
			console.log('Session owner set to:', sessionOwner);
			// Persist session owner to localStorage
			if (typeof window !== 'undefined' && window.localStorage) {
				localStorage.setItem('wc-session-owner', sessionOwner);
			}
		} else {
			console.error('❌ No session data received');
		}

		// Hide modal after connection
		hideWalletConnectModal();

		if (session) {
			const algorandNamespace = session.namespaces['algorand'];
			if (algorandNamespace && algorandNamespace.accounts) {
				return algorandNamespace.accounts.map((account: string) => {
					const [, , address] = account.split(':');
					return { address, app: intendedWalletName };
				});
			}
		}

		return [];
	} catch (error) {
		console.error(error);
		hideWalletConnectModal();
		return null;
	}
}

async function subscribeToEvents(universalProvider: InstanceType<typeof UniversalProvider>) {
	if (!universalProvider) throw Error('Unable to subscribe to events. Provider does not exist.');
	if (subscribed) return;
	try {
		universalProvider.on('session_delete', () => {
			console.log('The user has disconnected the session from their wallet.');
		});
		subscribed = true;
		/*universalProvider.on("session_connect", () => {
            console.log("The user has connected their wallet.");
        });*/
	} catch (e) {
		console.log(e);
	}
}

export async function disconnect() {
	await initialize();
	if (session && provider) {
		await provider.disconnect();
		session = null;
	}
	// Clear session ownership
	sessionOwner = null;
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.removeItem('wc-session-owner');
	}
	hideWalletConnectModal();
	initialized = false;
}

// Force reconnect function for troubleshooting
export async function forceReconnect(): Promise<WalletConnectionResult[] | null> {
	await disconnect();
	return await connect();
}

// Clear all WalletConnect sessions and storage
export async function clearSessions(): Promise<void> {
	try {
		if (provider) {
			await provider.disconnect();
		}

		// Clear localStorage entries related to WalletConnect
		if (typeof window !== 'undefined' && window.localStorage) {
			const keysToRemove = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && (key.startsWith('wc@2:') || key.startsWith('@walletconnect/'))) {
					keysToRemove.push(key);
				}
			}
			keysToRemove.forEach((key) => localStorage.removeItem(key));
			// Also clear session ownership
			localStorage.removeItem('wc-session-owner');
		}

		session = null;
		provider = null;
		sessionOwner = null;
		initialized = false;
		console.log('Cleared all WalletConnect sessions and storage');
	} catch (error) {
		console.error('Error clearing WalletConnect sessions:', error);
	}
}

// Debug function to check current WalletConnect state
export async function debugWalletConnectState(): Promise<void> {
	console.log('🔍 WalletConnect Debug State:');
	console.log('CHAIN_ID:', CHAIN_ID);
	console.log('initialized:', initialized);
	console.log('provider exists:', !!provider);
	console.log('session exists:', !!session);

	if (provider) {
		console.log('Provider session exists:', !!provider.session);
		console.log('Provider session topic:', provider.session?.topic);
		console.log(
			'Provider session namespaces:',
			JSON.stringify(provider.session?.namespaces, null, 2)
		);
	}

	if (session) {
		console.log('Local session topic:', session.topic);
		console.log('Local session namespaces:', JSON.stringify(session.namespaces, null, 2));
	}

	// Check localStorage for WalletConnect data
	if (typeof window !== 'undefined' && window.localStorage) {
		const wcKeys = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && (key.startsWith('wc@2:') || key.startsWith('@walletconnect/'))) {
				wcKeys.push(key);
			}
		}
		console.log('WalletConnect localStorage keys:', wcKeys);
	}
}

export async function signAndSendTransactions(
	client: algosdk.Algodv2,
	txnGroups: algosdk.Transaction[][]
) {
	await initialize();
	const signed = await signTransactions(txnGroups);

	const groups = txnGroups.map((group) => {
		return <Uint8Array[]>group
			.map((txn) => {
				const txId = txn.txID();
				const matchedTxn = signed.find((signedTxn) => {
					if (!signedTxn) return;
					try {
						return algosdk.decodeSignedTransaction(signedTxn).txn.txID() === txId;
					} catch (err) {
						console.error(err);
					}
				});
				return matchedTxn;
			})
			.filter(Boolean);
	});

	for (const group of groups) {
		const { txid } = await client.sendRawTransaction(group).do();
		try {
			await algosdk.waitForConfirmation(client, txid, 1);
		} catch (error) {
			console.warn((<Error>error).message);
		}
	}

	return true;
}

export async function signTransactions(txnGroups: algosdk.Transaction[][]) {
	await initialize();
	if (!session || !provider) {
		throw new Error('No active session');
	}

	// Debug logging
	console.log('🔍 WalletConnect Signing Debug:');
	console.log('CHAIN_ID:', CHAIN_ID);
	console.log('Session topic:', session.topic);
	console.log('Provider session topic:', provider.session?.topic);
	console.log('Session namespaces:', JSON.stringify(session.namespaces, null, 2));
	console.log(
		'Provider session namespaces:',
		JSON.stringify(provider.session?.namespaces, null, 2)
	);

	// Ensure the provider session is still active and matches
	if (!provider.session || provider.session.topic !== session.topic) {
		throw new Error('Session is no longer active. Please reconnect.');
	}

	// Check if the namespace is properly configured
	const algorandNamespace = session.namespaces['algorand'];
	if (!algorandNamespace) {
		console.error('❌ No algorand namespace found in session');
		throw new Error('Algorand namespace not configured. Please reconnect.');
	}

	if (!algorandNamespace.methods?.includes('algo_signTxn')) {
		console.error(
			'❌ algo_signTxn method not found in namespace methods:',
			algorandNamespace.methods
		);
		throw new Error('algo_signTxn method not configured. Please reconnect.');
	}

	if (!algorandNamespace.chains?.includes(CHAIN_ID!)) {
		console.error(
			'❌ Chain ID not found in namespace chains:',
			algorandNamespace.chains,
			'Expected:',
			CHAIN_ID
		);
		throw new Error(`Chain ${CHAIN_ID} not configured in namespace. Please reconnect.`);
	}

	console.log('✅ Namespace validation passed, proceeding with signing...');

	const txnsToSign = txnGroups.flat().map((txn) => {
		const encodedTxn = Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64');
		return {
			txn: encodedTxn,
			message: 'Transaction to sign'
		};
	});

	console.log('📝 Transactions to sign:', txnsToSign.length);

	try {
		const requestPayload = {
			method: 'algo_signTxn',
			params: [txnsToSign]
		};

		console.log('🚀 Making request with payload:', JSON.stringify(requestPayload, null, 2));
		console.log('🎯 Using chainId:', CHAIN_ID);
		console.log('📋 Session topic:', session.topic);

		// Use the correct format: request(payload, chainId) instead of request(payload, topic)
		const result = await provider.request(requestPayload, CHAIN_ID!);

		console.log(
			'✅ Signing successful, result type:',
			typeof result,
			'length:',
			Array.isArray(result) ? result.length : 'not array'
		);
		return (result as any[]).map((signedTxn: any) =>
			signedTxn ? new Uint8Array(Buffer.from(signedTxn, 'base64')) : null
		);
	} catch (error) {
		console.error('❌ Signing failed with error:', error);
		console.error('Error details:', {
			message: error.message,
			code: error.code,
			data: error.data
		});
		throw error;
	}
}

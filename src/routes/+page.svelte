<script lang="ts">
	import {
		Web3Wallet,
		walletStore,
		uiState,
		providerStore,
		registry,
		getScope
	} from '$lib/index.js';
	import algosdk from 'algosdk';
	import { PUBLIC_WALLETCONNECT_PROJECT_ID as PROJECT_ID } from '$env/static/public';
	import { onMount } from 'svelte';

	// Theme state
	let darkMode = $state(false);

	// Component options
	let displayMode = $state<'dropdown' | 'modal'>('dropdown');
	let autoSignIn = $state(false);
	let showSignInButton = $state(false);
	let showSignInStatus = $state(true);
	let allowWatchAccounts = $state(true);

	// Primary color options
	const colorOptions = [
		{ name: 'Blue', value: '59 130 246' },
		{ name: 'Indigo', value: '99 102 241' },
		{ name: 'Purple', value: '139 92 246' },
		{ name: 'Pink', value: '236 72 153' },
		{ name: 'Green', value: '34 197 94' },
		{ name: 'Orange', value: '249 115 22' }
	];
	let selectedColor = $state(colorOptions[0].value);

	// Transaction testing state
	type TransactionResult = {
		txId: string;
		sender: string;
		receiver: string;
		amount: bigint;
		fee: bigint;
		note: string | null;
		firstValid: bigint;
		lastValid: bigint;
		genesisId: string;
		signedBytes: Uint8Array;
		signature: string;
		isValid: boolean;
	};

	let txAmount = $state(0);
	let txReceiver = $state('');
	let txNote = $state('Test transaction from AVM Wallet');
	let txSigning = $state(false);
	let txError = $state<string | null>(null);
	let txResult = $state<TransactionResult | null>(null);

	// Network config
	const server = 'https://mainnet-api.voi.nodely.dev';
	const algodClient = new algosdk.Algodv2('', server, '443');
	const indexerClient = new algosdk.Indexer('', 'https://mainnet-idx.voi.nodely.dev', '443');

	// WalletConnect config
	const wcConfig = {
		projectId: PROJECT_ID,
		name: 'AVM Wallet Test',
		description: 'Testing the AVM Wallet component',
		url: 'https://example.com',
		icons: ['https://example.com/icon.png']
	};

	// Initialize theme from localStorage
	onMount(() => {
		console.log('[Test Page] onMount called');
		darkMode = localStorage.getItem('darkMode') === 'true';
		if (darkMode) {
			document.documentElement.classList.add('dark');
		}

		// Apply saved color
		const savedColor = localStorage.getItem('primaryColor');
		if (savedColor) {
			selectedColor = savedColor;
			document.documentElement.style.setProperty('--avm-color-primary', savedColor);
		}
		console.log('[Test Page] onMount complete, darkMode:', darkMode);
	});

	function toggleDarkMode() {
		console.log('[Test Page] toggleDarkMode called, current:', darkMode);
		darkMode = !darkMode;
		localStorage.setItem('darkMode', darkMode.toString());
		document.documentElement.classList.toggle('dark');
		console.log('[Test Page] toggleDarkMode done, new:', darkMode);
	}

	function updateColor(color: string) {
		console.log('[Test Page] updateColor called:', color);
		selectedColor = color;
		localStorage.setItem('primaryColor', color);
		document.documentElement.style.setProperty('--avm-color-primary', color);
	}

	// Transaction testing functions
	async function createAndSignTransaction() {
		const selectedAccount = walletStore.selectedAccount;
		if (!selectedAccount) {
			txError = 'No account selected';
			return;
		}

		txSigning = true;
		txError = null;
		txResult = null;

		try {
			// Get the adapter for this wallet
			const adapter = registry.getAdapter(selectedAccount.walletId);
			if (!adapter) {
				throw new Error(`Adapter not found for wallet: ${selectedAccount.walletId}`);
			}

			// Get suggested params from the network
			const suggestedParams = await algodClient.getTransactionParams().do();

			// Determine receiver (use provided or self)
			const receiver = txReceiver.trim() || selectedAccount.address;

			// Validate receiver address
			if (!algosdk.isValidAddress(receiver)) {
				throw new Error('Invalid receiver address');
			}

			// Create payment transaction
			const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
				sender: selectedAccount.address,
				receiver: receiver,
				amount: BigInt(txAmount),
				note: txNote ? new TextEncoder().encode(txNote) : undefined,
				suggestedParams
			});

			// Sign the transaction (do NOT send)
			const signedTxns = await adapter.signTransactions([[txn]], {
				message: 'Sign this test transaction (it will NOT be broadcast)'
			});

			// Decode the signed transaction for display
			const signedTxn = algosdk.decodeSignedTransaction(signedTxns[0]);
			const txnObj = signedTxn.txn;

			// Extract signature (base64)
			const signature = signedTxn.sig
				? btoa(String.fromCharCode(...signedTxn.sig))
				: 'No signature';

			// Verify the signature
			let isValid = false;
			try {
				if (signedTxn.sig) {
					// Get the public key from the sender address
					const senderAddr = algosdk.decodeAddress(selectedAccount.address);
					// Get the bytes that were signed (includes "TX" prefix)
					const bytesToSign = txnObj.bytesToSign();
					// Use nacl to verify the ed25519 signature directly
					// (verifyBytes adds "MX" prefix which is wrong for transactions)
					const nacl = await import('tweetnacl');
					isValid = nacl.sign.detached.verify(bytesToSign, signedTxn.sig, senderAddr.publicKey);
				}
			} catch (verifyError) {
				console.warn('Signature verification failed:', verifyError);
			}

			// Extract note if present
			let noteStr: string | null = null;
			if (txnObj.note && txnObj.note.length > 0) {
				try {
					noteStr = new TextDecoder().decode(txnObj.note);
				} catch {
					noteStr = `[Binary: ${txnObj.note.length} bytes]`;
				}
			}

			// Get sender and receiver addresses - handle algosdk v3 structure
			const senderAddress = txnObj.sender?.toString() || selectedAccount.address;
			const receiverAddress = txnObj.payment?.receiver?.toString() || receiver;

			// Build result
			txResult = {
				txId: txnObj.txID(),
				sender: senderAddress,
				receiver: receiverAddress,
				amount: txnObj.payment?.amount ?? BigInt(0),
				fee: txnObj.fee,
				note: noteStr,
				firstValid: txnObj.firstValid,
				lastValid: txnObj.lastValid,
				genesisId: txnObj.genesisID || '',
				signedBytes: signedTxns[0],
				signature: signature.slice(0, 20) + '...' + signature.slice(-20),
				isValid
			};
		} catch (error) {
			console.error('Transaction signing failed:', error);
			txError = error instanceof Error ? error.message : 'Transaction signing failed';
		} finally {
			txSigning = false;
		}
	}

	function clearTxResult() {
		txResult = null;
		txError = null;
	}

	function useSelfAsReceiver() {
		const selectedAccount = walletStore.selectedAccount;
		if (selectedAccount) {
			txReceiver = selectedAccount.address;
		}
	}

	// Debug: access store state directly in template
	// (Svelte 5 will track these when accessed in the template)
</script>

<div class="test-page" class:dark={darkMode}>
	<header class="test-header">
		<h1>AVM Wallet v2 Test</h1>
		<button class="theme-toggle" onclick={toggleDarkMode}>
			{darkMode ? '☀️ Light' : '🌙 Dark'}
		</button>
	</header>

	<div class="test-layout">
		<!-- Controls Panel -->
		<aside class="controls-panel">
			<h2>Options</h2>

			<div class="control-group">
				<label class="control-label">Display Mode</label>
				<div class="radio-group">
					<label class="radio-option">
						<input type="radio" bind:group={displayMode} value="dropdown" />
						Dropdown
					</label>
					<label class="radio-option">
						<input type="radio" bind:group={displayMode} value="modal" />
						Modal
					</label>
				</div>
			</div>

			<div class="control-group">
				<label class="control-label">Features</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={autoSignIn} />
					Auto Sign-In
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={showSignInButton} />
					Show Sign-In Button
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={showSignInStatus} />
					Show Sign-In Status
				</label>
				<label class="checkbox-option">
					<input type="checkbox" bind:checked={allowWatchAccounts} />
					Allow Watch Accounts
				</label>
			</div>

			<div class="control-group">
				<label class="control-label">Primary Color</label>
				<div class="color-options">
					{#each colorOptions as color (color.value)}
						<button
							class="color-swatch"
							class:selected={selectedColor === color.value}
							style="background-color: rgb({color.value})"
							onclick={() => updateColor(color.value)}
							title={color.name}
						></button>
					{/each}
				</div>
			</div>

			<hr class="divider" />

			<h2>State Debug</h2>
			<div class="debug-section">
				<div class="debug-item">
					<span class="debug-label">View:</span>
					<span class="debug-value">{uiState.currentView}</span>
				</div>
				<div class="debug-item">
					<span class="debug-label">Accounts:</span>
					<span class="debug-value">{walletStore.accounts.length}</span>
				</div>
				<div class="debug-item">
					<span class="debug-label">Selected:</span>
					<span class="debug-value">
						{#if walletStore.selectedAccount}
							{walletStore.selectedAccount.address.slice(0, 8)}...
						{:else}
							None
						{/if}
					</span>
				</div>
			</div>

			<div class="debug-section" style="margin-top: 0.75rem;">
				<div class="debug-item">
					<span class="debug-label">Network:</span>
					<span class="debug-value">{providerStore.genesisId || 'Not connected'}</span>
				</div>
				<div class="debug-item">
					<span class="debug-label">Chain ID:</span>
					<span class="debug-value" style="font-size: 0.625rem">{providerStore.chainId || '—'}</span
					>
				</div>
			</div>

			{#if walletStore.accounts.length > 0}
				<div class="accounts-list">
					<h3>Connected Accounts</h3>
					{#each walletStore.accounts as account (account.address)}
						<div class="account-debug">
							<code>{account.address.slice(0, 8)}...{account.address.slice(-4)}</code>
							<span class="account-meta">
								{account.walletId}
								{account.authenticated ? '✓' : ''}
								{#if account.networkId}
									<span class="account-network">{account.networkId}</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</aside>

		<!-- Main Demo Area -->
		<main class="demo-area">
			<div class="demo-card">
				<h2>Account Selector</h2>
				<p class="demo-description">
					The Web3Wallet component acts as an account selector. Click to see connected accounts or
					add new ones.
				</p>

				<div class="wallet-container">
					{#key `${displayMode}-${autoSignIn}-${showSignInButton}-${showSignInStatus}-${allowWatchAccounts}`}
						<Web3Wallet
							id="main"
							{algodClient}
							{indexerClient}
							{displayMode}
							{autoSignIn}
							{showSignInButton}
							{showSignInStatus}
							{allowWatchAccounts}
							{wcConfig}
						/>
					{/key}
				</div>
			</div>

			<div class="demo-card">
				<h2>Custom Trigger</h2>
				<p class="demo-description">Using a custom trigger button via the snippet prop.</p>

				<div class="wallet-container">
					{#key `custom-${displayMode}`}
						<Web3Wallet id="custom" {algodClient} {displayMode} {allowWatchAccounts} {wcConfig}>
							{#snippet trigger({ selectedAccount: acct, toggle })}
								<button class="custom-trigger" onclick={toggle}>
									{#if acct}
										<span class="custom-trigger-dot"></span>
										{acct.name || `${acct.address.slice(0, 6)}...`}
									{:else}
										Connect
									{/if}
								</button>
							{/snippet}
						</Web3Wallet>
					{/key}
				</div>
			</div>

			<div class="demo-card demo-card--wide">
				<h2>Inline Usage</h2>
				<p class="demo-description">
					Multiple instances without a <code>scope</code> prop share the default scope (same wallet store
					state).
				</p>

				<div class="inline-demo">
					<div class="inline-item">
						<span>Primary:</span>
						<Web3Wallet id="inline-primary" {algodClient} {wcConfig} displayMode="dropdown" />
					</div>
					<div class="inline-item">
						<span>Secondary:</span>
						<Web3Wallet id="inline-secondary" {algodClient} {wcConfig} displayMode="dropdown" />
					</div>
				</div>
			</div>

			<div class="demo-card demo-card--wide">
				<h2>Scoped Multi-Chain</h2>
				<p class="demo-description">
					Each <code>Web3Wallet</code> with a different <code>scope</code> prop gets its own isolated
					wallet store, provider, and registry. Connecting an account in one scope does not affect the
					other. In production you would point each scope at a different chain's algod client.
				</p>

				<div class="inline-demo">
					<div class="inline-item">
						<span>Scope "voi":</span>
						<Web3Wallet
							scope="voi"
							id="scope-voi"
							{algodClient}
							{allowWatchAccounts}
							{wcConfig}
							displayMode="dropdown"
						/>
					</div>
					<div class="inline-item">
						<span>Scope "test":</span>
						<Web3Wallet
							scope="test"
							id="scope-test"
							{algodClient}
							{allowWatchAccounts}
							{wcConfig}
							displayMode="dropdown"
						/>
					</div>
				</div>

				<div class="debug-section" style="margin-top: 0.75rem;">
					<div class="debug-item">
						<span class="debug-label">Voi scope accounts:</span>
						<span class="debug-value">{getScope('voi')?.walletStore?.accounts?.length ?? 0}</span>
					</div>
					<div class="debug-item">
						<span class="debug-label">Test scope accounts:</span>
						<span class="debug-value">{getScope('test')?.walletStore?.accounts?.length ?? 0}</span>
					</div>
				</div>
			</div>

			<div class="demo-card demo-card--wide">
				<h2>Transaction Signing Test</h2>
				<p class="demo-description">
					Create a transaction, sign it with the connected wallet, and verify the signature. The
					transaction will NOT be broadcast to the network.
				</p>

				{#if !walletStore.selectedAccount}
					<div class="tx-notice">
						<p>Connect an account to test transaction signing.</p>
					</div>
				{:else}
					<div class="tx-form">
						<div class="tx-form-row">
							<label class="tx-label">
								<span>Receiver Address</span>
								<div class="tx-input-group">
									<input
										type="text"
										class="tx-input"
										bind:value={txReceiver}
										placeholder={walletStore.selectedAccount.address}
									/>
									<button type="button" class="tx-btn-small" onclick={useSelfAsReceiver}>
										Self
									</button>
								</div>
								<span class="tx-hint">Leave empty to send to self</span>
							</label>
						</div>

						<div class="tx-form-row tx-form-row--split">
							<label class="tx-label">
								<span>Amount (microAlgos)</span>
								<input
									type="number"
									class="tx-input"
									bind:value={txAmount}
									min="0"
									placeholder="0"
								/>
								<span class="tx-hint">0 = test transaction</span>
							</label>

							<label class="tx-label">
								<span>Note</span>
								<input
									type="text"
									class="tx-input"
									bind:value={txNote}
									placeholder="Optional note"
								/>
							</label>
						</div>

						<div class="tx-actions">
							<button
								type="button"
								class="tx-btn tx-btn--primary"
								onclick={createAndSignTransaction}
								disabled={txSigning}
							>
								{txSigning ? 'Signing...' : 'Sign Transaction'}
							</button>
							{#if txResult || txError}
								<button type="button" class="tx-btn tx-btn--secondary" onclick={clearTxResult}>
									Clear
								</button>
							{/if}
						</div>
					</div>

					{#if txError}
						<div class="tx-error">
							<strong>Error:</strong>
							{txError}
						</div>
					{/if}

					{#if txResult}
						<div class="tx-result">
							<h3>Signed Transaction Details</h3>

							<div class="tx-result-grid">
								<div class="tx-result-item">
									<span class="tx-result-label">Transaction ID</span>
									<code class="tx-result-value tx-result-value--mono">{txResult.txId}</code>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Sender</span>
									<code class="tx-result-value tx-result-value--mono tx-result-value--truncate"
										>{txResult.sender}</code
									>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Receiver</span>
									<code class="tx-result-value tx-result-value--mono tx-result-value--truncate"
										>{txResult.receiver}</code
									>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Amount</span>
									<span class="tx-result-value">{txResult.amount.toString()} microAlgos</span>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Fee</span>
									<span class="tx-result-value">{txResult.fee.toString()} microAlgos</span>
								</div>

								{#if txResult.note}
									<div class="tx-result-item">
										<span class="tx-result-label">Note</span>
										<span class="tx-result-value">{txResult.note}</span>
									</div>
								{/if}

								<div class="tx-result-item">
									<span class="tx-result-label">Valid Rounds</span>
									<span class="tx-result-value"
										>{txResult.firstValid.toString()} - {txResult.lastValid.toString()}</span
									>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Genesis ID</span>
									<span class="tx-result-value">{txResult.genesisId}</span>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Signature</span>
									<code class="tx-result-value tx-result-value--mono tx-result-value--truncate"
										>{txResult.signature}</code
									>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Signature Valid</span>
									<span
										class="tx-result-value tx-result-value--status"
										class:tx-result-value--valid={txResult.isValid}
										class:tx-result-value--invalid={!txResult.isValid}
									>
										{txResult.isValid ? '✓ Valid' : '✗ Invalid'}
									</span>
								</div>

								<div class="tx-result-item">
									<span class="tx-result-label">Signed Bytes</span>
									<span class="tx-result-value">{txResult.signedBytes.length} bytes</span>
								</div>
							</div>

							<div class="tx-warning">
								<strong>Note:</strong> This transaction was NOT broadcast to the network. It exists only
								in memory for testing purposes.
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</main>
	</div>
</div>

<style>
	.test-page {
		min-height: 100vh;
		background-color: rgb(var(--avm-bg-secondary));
		color: rgb(var(--avm-text-primary));
		font-family: var(--avm-font-family);
		transition:
			background-color 0.2s,
			color 0.2s;
	}

	.test-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		background-color: rgb(var(--avm-bg-primary));
		border-bottom: 1px solid rgb(var(--avm-border-color));
	}

	.test-header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.theme-toggle {
		padding: 0.5rem 1rem;
		background-color: rgb(var(--avm-bg-tertiary));
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.theme-toggle:hover {
		background-color: rgb(var(--avm-bg-hover));
	}

	.test-layout {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 1.5rem;
		padding: 1.5rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	/* Controls Panel */
	.controls-panel {
		background-color: rgb(var(--avm-bg-primary));
		border: 1px solid rgb(var(--avm-border-color));
		border-radius: 0.75rem;
		padding: 1.25rem;
		height: fit-content;
		position: sticky;
		top: 1.5rem;
	}

	.controls-panel h2 {
		margin: 0 0 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(var(--avm-text-secondary));
	}

	.controls-panel h3 {
		margin: 0.75rem 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgb(var(--avm-text-secondary));
	}

	.control-group {
		margin-bottom: 1.25rem;
	}

	.control-label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: rgb(var(--avm-text-primary));
	}

	.radio-group {
		display: flex;
		gap: 1rem;
	}

	.radio-option,
	.checkbox-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.checkbox-option {
		margin-bottom: 0.5rem;
	}

	.color-options {
		display: flex;
		gap: 0.5rem;
	}

	.color-swatch {
		width: 28px;
		height: 28px;
		border: 2px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		transition:
			transform 0.15s,
			border-color 0.15s;
	}

	.color-swatch:hover {
		transform: scale(1.1);
	}

	.color-swatch.selected {
		border-color: rgb(var(--avm-text-primary));
	}

	.divider {
		border: none;
		border-top: 1px solid rgb(var(--avm-border-color));
		margin: 1.25rem 0;
	}

	.debug-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.debug-item {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.debug-label {
		color: rgb(var(--avm-text-secondary));
	}

	.debug-value {
		font-family: var(--avm-font-mono);
		color: rgb(var(--avm-text-primary));
	}

	.accounts-list {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgb(var(--avm-border-color));
	}

	.account-debug {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.375rem 0;
		font-size: 0.75rem;
	}

	.account-debug code {
		font-family: var(--avm-font-mono);
		color: rgb(var(--avm-text-primary));
	}

	.account-meta {
		color: rgb(var(--avm-text-tertiary));
		font-size: 0.6875rem;
		text-align: right;
	}

	.account-network {
		display: block;
		font-size: 0.625rem;
		color: rgb(var(--avm-color-primary));
	}

	/* Demo Area */
	.demo-area {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
	}

	.demo-card {
		background-color: rgb(var(--avm-bg-primary));
		border: 1px solid rgb(var(--avm-border-color));
		border-radius: 0.75rem;
		padding: 1.5rem;
	}

	.demo-card--wide {
		grid-column: span 2;
	}

	.demo-card h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.demo-description {
		margin: 0 0 1.25rem;
		font-size: 0.8125rem;
		color: rgb(var(--avm-text-secondary));
		line-height: 1.5;
	}

	.wallet-container {
		display: flex;
		justify-content: flex-start;
	}

	/* Custom trigger example */
	.custom-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		background: linear-gradient(
			135deg,
			rgb(var(--avm-color-primary)),
			rgb(var(--avm-color-primary-hover))
		);
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		border: none;
		border-radius: 2rem;
		cursor: pointer;
		transition:
			transform 0.15s,
			box-shadow 0.15s;
	}

	.custom-trigger:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgb(var(--avm-color-primary) / 0.3);
	}

	.custom-trigger-dot {
		width: 8px;
		height: 8px;
		background-color: #4ade80;
		border-radius: 50%;
	}

	/* Inline demo */
	.inline-demo {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		align-items: center;
	}

	.inline-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: rgb(var(--avm-text-secondary));
	}

	/* Transaction Testing */
	.tx-notice {
		padding: 1rem;
		background-color: rgb(var(--avm-bg-secondary));
		border-radius: 0.5rem;
		text-align: center;
		color: rgb(var(--avm-text-secondary));
	}

	.tx-notice p {
		margin: 0;
		font-size: 0.875rem;
	}

	.tx-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.tx-form-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tx-form-row--split {
		flex-direction: row;
		gap: 1rem;
	}

	.tx-form-row--split .tx-label {
		flex: 1;
	}

	.tx-label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.tx-label > span:first-child {
		font-size: 0.8125rem;
		font-weight: 500;
		color: rgb(var(--avm-text-primary));
	}

	.tx-hint {
		font-size: 0.75rem;
		color: rgb(var(--avm-text-tertiary));
	}

	.tx-input-group {
		display: flex;
		gap: 0.5rem;
	}

	.tx-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		background-color: rgb(var(--avm-bg-secondary));
		border: 1px solid rgb(var(--avm-border-color));
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		font-family: var(--avm-font-mono);
		color: rgb(var(--avm-text-primary));
		transition: border-color 0.15s;
	}

	.tx-input::placeholder {
		color: rgb(var(--avm-text-tertiary));
		font-family: var(--avm-font-mono);
		font-size: 0.75rem;
	}

	.tx-input:focus {
		outline: none;
		border-color: rgb(var(--avm-color-primary));
	}

	.tx-btn-small {
		padding: 0.5rem 0.75rem;
		background-color: rgb(var(--avm-bg-tertiary));
		border: 1px solid rgb(var(--avm-border-color));
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgb(var(--avm-text-secondary));
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}

	.tx-btn-small:hover {
		background-color: rgb(var(--avm-bg-hover));
		color: rgb(var(--avm-text-primary));
	}

	.tx-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.tx-btn {
		padding: 0.625rem 1.25rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.15s,
			transform 0.1s;
	}

	.tx-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.tx-btn--primary {
		background-color: rgb(var(--avm-color-primary));
		color: white;
	}

	.tx-btn--primary:hover:not(:disabled) {
		background-color: rgb(var(--avm-color-primary-hover));
	}

	.tx-btn--secondary {
		background-color: rgb(var(--avm-bg-tertiary));
		color: rgb(var(--avm-text-secondary));
	}

	.tx-btn--secondary:hover {
		background-color: rgb(var(--avm-bg-hover));
		color: rgb(var(--avm-text-primary));
	}

	.tx-error {
		padding: 0.75rem 1rem;
		margin-top: 1rem;
		background-color: rgb(239 68 68 / 0.1);
		border: 1px solid rgb(239 68 68 / 0.3);
		border-radius: 0.5rem;
		color: rgb(239 68 68);
		font-size: 0.8125rem;
	}

	.tx-result {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgb(var(--avm-border-color));
	}

	.tx-result h3 {
		margin: 0 0 1rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: rgb(var(--avm-text-primary));
	}

	.tx-result-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem 1.5rem;
	}

	.tx-result-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.tx-result-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgb(var(--avm-text-secondary));
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.tx-result-value {
		font-size: 0.8125rem;
		color: rgb(var(--avm-text-primary));
	}

	.tx-result-value--mono {
		font-family: var(--avm-font-mono);
		font-size: 0.75rem;
	}

	.tx-result-value--truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tx-result-value--status {
		font-weight: 600;
	}

	.tx-result-value--valid {
		color: rgb(34 197 94);
	}

	.tx-result-value--invalid {
		color: rgb(239 68 68);
	}

	.tx-warning {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		background-color: rgb(251 191 36 / 0.1);
		border: 1px solid rgb(251 191 36 / 0.3);
		border-radius: 0.5rem;
		color: rgb(var(--avm-text-secondary));
		font-size: 0.8125rem;
	}

	.tx-warning strong {
		color: rgb(217 119 6);
	}

	/* Responsive */
	@media (max-width: 900px) {
		.test-layout {
			grid-template-columns: 1fr;
		}

		.controls-panel {
			position: static;
		}

		.demo-area {
			grid-template-columns: 1fr;
		}

		.demo-card--wide {
			grid-column: span 1;
		}

		.tx-form-row--split {
			flex-direction: column;
		}

		.tx-result-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

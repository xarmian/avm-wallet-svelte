<script lang="ts">
	import QRCode from 'qrcode';
	import { getContext } from 'svelte';
	import { SCOPE_CONTEXT_KEY, type WalletScope } from '../state/scope.svelte.js';

	const { uiStore } = getContext<WalletScope>(SCOPE_CONTEXT_KEY);

	const wcModal = $derived(uiStore.wcModal);

	let qrCanvas = $state<HTMLCanvasElement | null>(null);
	let copied = $state(false);

	// Generate QR code when URI changes
	$effect(() => {
		if (wcModal.show && wcModal.uri && qrCanvas) {
			generateQRCode();
		}
	});

	async function generateQRCode() {
		if (!qrCanvas || !wcModal.uri) return;

		try {
			await QRCode.toCanvas(qrCanvas, wcModal.uri, {
				width: 280,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			});
		} catch (error) {
			console.error('Failed to generate QR code:', error);
		}
	}

	function handleClose() {
		uiStore.closeWalletConnectModal();
	}

	async function handleCopyUri() {
		if (!wcModal.uri) return;

		try {
			await navigator.clipboard.writeText(wcModal.uri);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy URI:', error);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

{#if wcModal.show}
	<div
		class="avm-wc-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="wc-modal-title"
		onclick={handleClose}
		onkeydown={handleKeydown}
	>
		<div class="avm-wc-modal" onclick={(e) => e.stopPropagation()} role="document">
			<header class="avm-wc-modal-header">
				<h2 id="wc-modal-title" class="avm-wc-modal-title">
					Connect to {wcModal.walletName}
				</h2>
				<button type="button" class="avm-wc-modal-close" onclick={handleClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</header>

			<div class="avm-wc-modal-body">
				<div class="avm-wc-modal-qr">
					<canvas bind:this={qrCanvas}></canvas>
				</div>

				<p class="avm-wc-modal-instructions">
					Scan this QR code with your mobile wallet or click below to copy the connection link.
				</p>

				<button
					type="button"
					class="avm-wc-modal-copy"
					onclick={handleCopyUri}
					aria-label="Copy connection URI"
				>
					{#if copied}
						<svg class="avm-wc-modal-copy-icon" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
								clip-rule="evenodd"
							/>
						</svg>
						Copied!
					{:else}
						<svg class="avm-wc-modal-copy-icon" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5v-3.25A2.25 2.25 0 0011.25 8.5H8.5V5.25a2.25 2.25 0 012.25-2.25h5.238a2.25 2.25 0 011.988 1.012zm-6.238 6.738a.75.75 0 00-.75-.75H4.25a.75.75 0 00-.75.75v6.5c0 .414.336.75.75.75h4.75a.75.75 0 00.75-.75v-6.5z"
								clip-rule="evenodd"
							/>
						</svg>
						Copy Link
					{/if}
				</button>
			</div>

			<footer class="avm-wc-modal-footer">
				<a
					href="https://walletconnect.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="avm-wc-modal-powered"
				>
					Powered by WalletConnect
				</a>
			</footer>
		</div>
	</div>
{/if}

<style>
	.avm-wc-modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgb(var(--avm-bg-overlay) / var(--avm-bg-overlay-opacity));
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--avm-z-modal-backdrop);
	}

	.avm-wc-modal {
		width: var(--avm-modal-width);
		max-width: var(--avm-modal-max-width);
		background-color: rgb(var(--avm-bg-primary));
		border-radius: var(--avm-radius-xl);
		box-shadow: var(--avm-shadow-xl);
		z-index: var(--avm-z-modal);
	}

	.avm-wc-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--avm-spacing-md);
		border-bottom: 1px solid rgb(var(--avm-border-color));
	}

	.avm-wc-modal-title {
		margin: 0;
		font-size: var(--avm-font-size-lg);
		font-weight: var(--avm-font-weight-semibold);
		color: rgb(var(--avm-text-primary));
	}

	.avm-wc-modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: none;
		border: none;
		border-radius: var(--avm-radius-md);
		color: rgb(var(--avm-text-secondary));
		cursor: pointer;
	}

	.avm-wc-modal-close:hover {
		background-color: rgb(var(--avm-bg-hover));
	}

	.avm-wc-modal-close svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.avm-wc-modal-body {
		padding: var(--avm-spacing-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--avm-spacing-md);
	}

	.avm-wc-modal-qr {
		padding: var(--avm-spacing-md);
		background-color: #ffffff;
		border-radius: var(--avm-radius-lg);
		box-shadow: var(--avm-shadow-sm);
	}

	.avm-wc-modal-qr canvas {
		display: block;
	}

	.avm-wc-modal-instructions {
		margin: 0;
		text-align: center;
		color: rgb(var(--avm-text-secondary));
		font-size: var(--avm-font-size-sm);
	}

	.avm-wc-modal-copy {
		display: flex;
		align-items: center;
		gap: var(--avm-spacing-sm);
		padding: var(--avm-spacing-sm) var(--avm-spacing-md);
		background-color: rgb(var(--avm-bg-secondary));
		color: rgb(var(--avm-text-primary));
		font-size: var(--avm-font-size-sm);
		font-weight: var(--avm-font-weight-medium);
		border: 1px solid rgb(var(--avm-border-color));
		border-radius: var(--avm-radius-md);
		cursor: pointer;
		transition:
			background-color var(--avm-transition-fast),
			border-color var(--avm-transition-fast);
	}

	.avm-wc-modal-copy:hover {
		background-color: rgb(var(--avm-bg-tertiary));
		border-color: rgb(var(--avm-color-primary));
	}

	.avm-wc-modal-copy-icon {
		width: 1rem;
		height: 1rem;
	}

	.avm-wc-modal-footer {
		padding: var(--avm-spacing-sm) var(--avm-spacing-md);
		border-top: 1px solid rgb(var(--avm-border-color));
		text-align: center;
	}

	.avm-wc-modal-powered {
		font-size: var(--avm-font-size-xs);
		color: rgb(var(--avm-text-tertiary));
		text-decoration: none;
	}

	.avm-wc-modal-powered:hover {
		color: rgb(var(--avm-text-secondary));
		text-decoration: underline;
	}
</style>

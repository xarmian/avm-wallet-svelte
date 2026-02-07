<script lang="ts">
	import { getContext } from 'svelte';
	import { SCOPE_CONTEXT_KEY, type WalletScope } from '../state/scope.svelte.js';

	const { uiStore } = getContext<WalletScope>(SCOPE_CONTEXT_KEY);

	const authModal = $derived(uiStore.authModal);

	function handleClose() {
		uiStore.closeAuthModal();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

{#if authModal.show}
	<div
		class="avm-auth-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="auth-modal-title"
		onclick={handleClose}
		onkeydown={handleKeydown}
	>
		<div class="avm-auth-modal" onclick={(e) => e.stopPropagation()} role="document">
			<header class="avm-auth-modal-header">
				<h2 id="auth-modal-title" class="avm-auth-modal-title">Authenticating</h2>
				<button type="button" class="avm-auth-modal-close" onclick={handleClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</header>

			<div class="avm-auth-modal-body">
				{#if authModal.error}
					<div class="avm-auth-modal-error">
						<svg class="avm-auth-modal-error-icon" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
								clip-rule="evenodd"
							/>
						</svg>
						<p>{authModal.error}</p>
					</div>
				{:else}
					<div class="avm-auth-modal-spinner-container">
						<div class="avm-auth-modal-spinner"></div>
						<p class="avm-auth-modal-message">
							Please approve the authentication request in your wallet
						</p>
					</div>
				{/if}

				<p class="avm-auth-modal-address">
					Address: <code>{authModal.address.slice(0, 8)}...{authModal.address.slice(-8)}</code>
				</p>
			</div>

			{#if authModal.error}
				<footer class="avm-auth-modal-footer">
					<button type="button" class="avm-auth-modal-button" onclick={handleClose}> Close </button>
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.avm-auth-modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgb(var(--avm-bg-overlay) / var(--avm-bg-overlay-opacity));
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--avm-z-modal-backdrop);
	}

	.avm-auth-modal {
		width: var(--avm-modal-width);
		max-width: var(--avm-modal-max-width);
		background-color: rgb(var(--avm-bg-primary));
		border-radius: var(--avm-radius-xl);
		box-shadow: var(--avm-shadow-xl);
		z-index: var(--avm-z-modal);
	}

	.avm-auth-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--avm-spacing-md);
		border-bottom: 1px solid rgb(var(--avm-border-color));
	}

	.avm-auth-modal-title {
		margin: 0;
		font-size: var(--avm-font-size-lg);
		font-weight: var(--avm-font-weight-semibold);
		color: rgb(var(--avm-text-primary));
	}

	.avm-auth-modal-close {
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

	.avm-auth-modal-close:hover {
		background-color: rgb(var(--avm-bg-hover));
	}

	.avm-auth-modal-close svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.avm-auth-modal-body {
		padding: var(--avm-spacing-lg);
		text-align: center;
	}

	.avm-auth-modal-spinner-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--avm-spacing-md);
	}

	.avm-auth-modal-spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid rgb(var(--avm-border-color));
		border-top-color: rgb(var(--avm-color-primary));
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.avm-auth-modal-message {
		margin: 0;
		color: rgb(var(--avm-text-secondary));
	}

	.avm-auth-modal-address {
		margin: var(--avm-spacing-md) 0 0;
		font-size: var(--avm-font-size-sm);
		color: rgb(var(--avm-text-tertiary));
	}

	.avm-auth-modal-address code {
		font-family: var(--avm-font-mono);
	}

	.avm-auth-modal-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--avm-spacing-sm);
		padding: var(--avm-spacing-md);
		background-color: rgb(var(--avm-color-error) / 0.1);
		border-radius: var(--avm-radius-md);
		color: rgb(var(--avm-color-error));
	}

	.avm-auth-modal-error-icon {
		width: 2rem;
		height: 2rem;
	}

	.avm-auth-modal-error p {
		margin: 0;
	}

	.avm-auth-modal-footer {
		padding: var(--avm-spacing-md);
		border-top: 1px solid rgb(var(--avm-border-color));
		display: flex;
		justify-content: flex-end;
	}

	.avm-auth-modal-button {
		padding: var(--avm-spacing-sm) var(--avm-spacing-md);
		background-color: rgb(var(--avm-color-primary));
		color: rgb(var(--avm-text-inverse));
		font-size: var(--avm-font-size-sm);
		font-weight: var(--avm-font-weight-medium);
		border: none;
		border-radius: var(--avm-radius-md);
		cursor: pointer;
	}

	.avm-auth-modal-button:hover {
		background-color: rgb(var(--avm-color-primary-hover));
	}
</style>

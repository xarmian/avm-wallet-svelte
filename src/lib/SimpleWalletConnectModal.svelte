<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import QRCode from 'qrcode';
  import { onMount, onDestroy } from 'svelte';

  export let show = false;
  export let uri = '';

  const dispatch = createEventDispatcher();

  let qrCodeDataUrl = '';
  let qrCodeDataUrlDark = '';
  let copySuccess = false;
  let modalElement: HTMLDivElement;
  let portalTarget: HTMLElement;

  onMount(() => {
    if (uri) {
      generateQRCode();
    }

    // Create portal target at body level
    portalTarget = document.createElement('div');
    portalTarget.id = 'wallet-modal-portal';
    document.body.appendChild(portalTarget);

    return () => {
      if (portalTarget && document.body.contains(portalTarget)) {
        document.body.removeChild(portalTarget);
      }
    };
  });

  $: if (uri && show) {
    generateQRCode();
  }

  $: if (portalTarget && modalElement) {
    portalTarget.appendChild(modalElement);
  }

  async function generateQRCode() {
    try {
      // Generate QR code for light theme
      qrCodeDataUrl = await QRCode.toDataURL(uri, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1f2937', // gray-800
          light: '#ffffff'
        }
      });

      // Generate QR code for dark theme
      qrCodeDataUrlDark = await QRCode.toDataURL(uri, {
        width: 300,
        margin: 2,
        color: {
          dark: '#f9fafb', // gray-50
          light: '#374151'  // gray-700
        }
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  }

  function openWallet() {
    window.open(uri, '_self');
    dispatch('wallet-opened');
  }

  function closeModal() {
    show = false;
    dispatch('close');
  }

  async function copyUri() {
    try {
      await navigator.clipboard.writeText(uri);
      copySuccess = true;
      dispatch('uri-copied');
      setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy URI:', error);
    }
  }
</script>

{#if show}
  <!-- Modal backdrop with blur effect - will be portaled to body -->
  <div bind:this={modalElement} class="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-4 transition-opacity duration-300 z-50">
    <!-- Modal container -->
    <div class="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full shadow-2xl transform transition-all duration-300 scale-100 border border-gray-200 dark:border-gray-700">
      <!-- Header -->
      <div class="relative p-6 pb-4 border-b border-gray-100 dark:border-gray-800">
        <h3 class="text-2xl font-bold text-center text-gray-900 dark:text-white">Connect Your Wallet</h3>
        <p class="text-sm text-center text-gray-500 dark:text-gray-400 mt-2">Scan the QR code or open on your mobile device</p>
        <button
          on:click={closeModal}
          class="absolute top-4 right-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close modal"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-8 space-y-6">
        <!-- QR Code Section -->
        <div class="flex flex-col items-center">
          {#if qrCodeDataUrl && qrCodeDataUrlDark}
            <div class="relative p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-inner">
              <!-- Light theme QR code -->
              <img
                src={qrCodeDataUrl}
                alt="WalletConnect QR Code"
                class="w-72 h-72 block dark:hidden rounded-xl"
              />
              <!-- Dark theme QR code -->
              <img
                src={qrCodeDataUrlDark}
                alt="WalletConnect QR Code"
                class="w-72 h-72 hidden dark:block rounded-xl"
              />
              <!-- Decorative corner accents -->
              <div class="absolute top-3 left-3 w-6 h-6 border-t-3 border-l-3 border-blue-500 rounded-tl-lg"></div>
              <div class="absolute top-3 right-3 w-6 h-6 border-t-3 border-r-3 border-blue-500 rounded-tr-lg"></div>
              <div class="absolute bottom-3 left-3 w-6 h-6 border-b-3 border-l-3 border-blue-500 rounded-bl-lg"></div>
              <div class="absolute bottom-3 right-3 w-6 h-6 border-b-3 border-r-3 border-blue-500 rounded-br-lg"></div>
            </div>
          {:else}
            <div class="w-72 h-72 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl flex items-center justify-center shadow-inner">
              <div class="flex flex-col items-center space-y-3">
                <div class="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                <div class="text-gray-600 dark:text-gray-400 text-sm font-medium">Generating QR Code...</div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Action Buttons -->
        <div class="space-y-3 pt-2">
          <!-- Primary Connect Button -->
          <button
            on:click={openWallet}
            class="w-full flex items-center justify-center px-6 py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] group"
          >
            <svg class="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Connect to Wallet
          </button>

          <!-- Copy URI Button -->
          <button
            on:click={copyUri}
            class="{copySuccess
              ? 'bg-green-500 dark:bg-green-600 text-white border-green-500 dark:border-green-600'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-400 dark:hover:border-gray-500'}
              w-full flex items-center justify-center px-6 py-4 font-medium rounded-xl border-2 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] group"
          >
            {#if copySuccess}
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Copied to Clipboard!
            {:else}
              <svg class="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Connection Link
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure smooth animations and modal positioning */
  :global(.modal-backdrop) {
    backdrop-filter: blur(4px);
  }

  /* Custom focus styles for accessibility */
  button:focus-visible {
    outline: 2px solid theme('colors.blue.500');
    outline-offset: 2px;
  }
</style>

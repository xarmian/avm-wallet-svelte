<script lang="ts">
    import { authModalStore } from './store.js';
</script>

{#if $authModalStore.show}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
    <div class="bg-white dark:bg-gray-500 p-4 rounded-lg relative">
      <h2 class="text-lg font-bold">Authenticate Wallet</h2>
      <p>A zero-cost transaction has been sent to your wallet for signing.</p>
      <p>This transaction will not be broadcast to the network and has no cost.</p>
      <p>Please sign the transaction to authenticate.</p>
      {#if $authModalStore.error === ''}
        <div class="flex justify-center">
          <div class="spinner"></div>
        </div>
      {:else}
        <p class="text-red-600 flex justify-center m-4">{$authModalStore.error}</p>
      {/if}
      <button class="absolute top-0 right-0 p-2" on:click={() => authModalStore.set({ show: false, error: '', address: '' })}>X</button>
      <button class="absolute bottom-0 right-0 p-2" on:click={() => authModalStore.set({ show: false, error: '', address: '' })}>Cancel</button>
    </div>
  </div>
{/if}

<style>
.spinner {
  border: 16px solid #f3f3f3;
  border-top: 16px solid #3498db;
  border-radius: 50%;
  width: 120px;
  height: 120px;
  animation: spin 2s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style> 
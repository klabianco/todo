<?php
require __DIR__ . '/../config/config.php';
require __DIR__ . '/includes/head.php';
require __DIR__ . '/includes/footer.php';
require __DIR__ . '/includes/theme-toggle.php';
require __DIR__ . '/includes/container.php';

// Get store ID from URL
$storeId = $_GET['id'] ?? '';

renderHead('Store Details - Todo', [], true);
renderContainerStart();
renderThemeToggle();
?>
        <header class="text-center mb-6">
            <h1 id="store-name" class="text-3xl font-bold text-gray-700 dark:text-gray-200 mb-4">Loading...</h1>
            <div class="mt-3">
                <a href="/stores.php" class="inline-block text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition-colors">
                    ← Back to Stores
                </a>
            </div>
        </header>
        
        <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800">
            <div id="loading" class="text-center py-12">
                <svg class="animate-spin h-12 w-12 text-purple-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="text-gray-600 dark:text-gray-400">Loading store...</p>
            </div>
            
            <div id="store-container" class="hidden">
                <div id="store-details" class="mb-6">
                    <div id="store-info" class="mb-4">
                        <!-- Store info will be inserted here -->
                    </div>
                </div>
                
                <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button 
                        id="delete-store-button"
                        class="w-full text-sm bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md inline-flex items-center justify-center"
                        title="Delete store"
                    >
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        Delete Store
                    </button>
                </div>
            </div>
            
            <div id="error-state" class="hidden text-center py-12">
                <p class="text-red-600 dark:text-red-400 mb-4">Failed to load store</p>
                <button id="retry-button" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md">
                    Retry
                </button>
            </div>
        </div>
        
        <!-- Photo Modal -->
        <div id="photo-modal" class="hidden fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
            <div class="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
                <button id="close-photo-modal" class="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700 z-10">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
                <img id="photo-modal-image" src="" alt="Store photo" class="max-w-full max-h-full object-contain">
            </div>
        </div>
        
        <?php renderContainerEnd(); ?>
        <?php renderFooter(); ?>
    </body>
    <script type="module">
        import { loadStore, setupPhotoUpload, setupPhotoDelete, setupPhotoModal, handleStoreDelete, setupSectionManagement } from '/assets/js/modules/store-detail.js';
        import { $ } from '/assets/js/modules/utils.js';
        
        const storeId = new URLSearchParams(window.location.search).get('id');
        
        if (!storeId) {
            window.location.href = '/stores.php';
        }
        
        const elements = {
            loading: $('loading'),
            container: $('store-container'),
            error: $('error-state'),
            name: $('store-name'),
            info: $('store-info')
        };
        
        const reloadStore = () => {
            loadStore(storeId, elements).then(() => {
                // setupSectionManagement checks internally if already set up
                // Since we use event delegation, we only need to set it up once
                setupSectionManagement(storeId, reloadStore);
            });
        };
        
        // Setup photo modal (for viewing section photos)
        setupPhotoModal();
        $('delete-store-button')?.addEventListener('click', () => handleStoreDelete(storeId));
        $('retry-button')?.addEventListener('click', reloadStore);
        
        // Initial load
        reloadStore();
    </script>
</html>


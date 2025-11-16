<?php
require __DIR__ . '/../config/config.php';
require __DIR__ . '/includes/head.php';
require __DIR__ . '/includes/footer.php';
require __DIR__ . '/includes/theme-toggle.php';
require __DIR__ . '/includes/container.php';

renderHead('Grocery Stores - Todo', ['jspdf', 'xlsx'], true);
renderContainerStart();
renderThemeToggle();
?>
        <header class="text-center mb-6">
            <h1 class="text-3xl font-bold text-gray-700 dark:text-gray-200 mb-4">Grocery Stores</h1>
            <div class="mt-3 flex flex-col gap-2">
                <a href="/" class="inline-block text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition-colors">
                    ← Back to Todo List
                </a>
                <div class="flex gap-2 justify-center">
                    <button id="share-stores-button" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                        </svg>
                        Share Stores
                    </button>
                    <button id="export-stores-button" class="text-sm bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Export
                    </button>
                    <button id="import-stores-button" class="text-sm bg-purple-500 hover:bg-purple-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14v-2m0 0V8m0 2h2m-2 0H10m8 6H6a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Import
                    </button>
                </div>
                <input type="file" id="import-stores-file-input" accept=".json" class="hidden">
                <?php 
                require __DIR__ . '/includes/share-url.php';
                renderShareUrlContainer('stores');
                ?>
            </div>
        </header>
        
        <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800">
            <div id="loading"></div>
            <div id="stores-container" class="hidden">
                <div id="empty-state" class="hidden"></div>
                <div id="stores-list" class="space-y-4">
                    <!-- Stores will be inserted here -->
                </div>
            </div>
            <div id="error-state" class="hidden"></div>
        </div>
        
        <!-- Export Modal -->
        <div id="export-stores-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Export Stores</h2>
                </div>
                <div class="p-6">
                    <p class="text-gray-600 dark:text-gray-400 mb-4">Choose format:</p>
                    <div class="space-y-3 mb-6">
                        <label class="flex items-start cursor-pointer">
                            <input type="radio" name="export-stores-format" value="json" class="mt-1 mr-3" checked>
                            <div>
                                <div class="font-medium text-gray-800 dark:text-gray-200">JSON</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Machine-readable format for backup</div>
                            </div>
                        </label>
                        <label class="flex items-start cursor-pointer">
                            <input type="radio" name="export-stores-format" value="pdf" class="mt-1 mr-3">
                            <div>
                                <div class="font-medium text-gray-800 dark:text-gray-200">PDF</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Printable document format</div>
                            </div>
                        </label>
                        <label class="flex items-start cursor-pointer">
                            <input type="radio" name="export-stores-format" value="excel" class="mt-1 mr-3">
                            <div>
                                <div class="font-medium text-gray-800 dark:text-gray-200">Excel</div>
                                <div class="text-sm text-gray-500 dark:text-gray-400">Spreadsheet format (.xlsx)</div>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    <button id="cancel-export-stores" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        Cancel
                    </button>
                    <button id="confirm-export-stores" class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md">
                        Export
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Import Modal -->
        <div id="import-stores-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Import Stores</h2>
                </div>
                <div class="p-6">
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from File</label>
                        <button id="import-stores-file-button" class="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md">
                            Choose JSON File
                        </button>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Select a JSON file exported from this app</p>
                    </div>
                </div>
                <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    <button id="cancel-import-stores" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    <?php renderContainerEnd(); ?>
    
    <?php renderFooter(false); ?>
    
    <script type="module">
        import { 
            loadStoresFromAPI, 
            renderStoreCard, 
            renderLoadingSpinner, 
            renderEmptyState, 
            renderErrorState,
            exportStoresToPDF,
            exportStoresToExcel,
            exportStoresToJSON
        } from '/assets/js/modules/stores-page.js';
        import { setupShareUrlHandlers, showShareUrl } from '/assets/js/modules/share-utils.js';
        import { setupModalCloseHandlers, setupFileInputButton } from '/assets/js/modules/modal-utils.js';
        
        let currentStores = [];
        
        const loading = document.getElementById('loading');
        const container = document.getElementById('stores-container');
        const emptyState = document.getElementById('empty-state');
        const storesList = document.getElementById('stores-list');
        const errorState = document.getElementById('error-state');
        
        // Load and display stores
        const loadStores = async () => {
            try {
                loading.innerHTML = renderLoadingSpinner('Loading stores...');
                loading.classList.remove('hidden');
                container.classList.add('hidden');
                errorState.classList.add('hidden');
                
                currentStores = await loadStoresFromAPI();
                
                loading.classList.add('hidden');
                
                if (currentStores.length === 0) {
                    emptyState.innerHTML = renderEmptyState();
                    emptyState.classList.remove('hidden');
                    container.classList.remove('hidden');
                } else {
                    emptyState.classList.add('hidden');
                    storesList.innerHTML = currentStores.map(store => renderStoreCard(store)).join('');
                    container.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Error loading stores:', error);
                loading.classList.add('hidden');
                container.classList.add('hidden');
                errorState.innerHTML = renderErrorState();
                errorState.classList.remove('hidden');
                
                // Set up retry button
                const retryButton = document.getElementById('retry-button');
                if (retryButton) {
                    retryButton.addEventListener('click', loadStores);
                }
            }
        };
        
        // Share stores
        const handleShareStores = () => {
            const shareUrl = `${window.location.origin}${window.location.pathname}`;
            showShareUrl(shareUrl, 'stores');
        };
        
        // Export stores
        const handleExportStores = () => {
            document.getElementById('export-stores-modal')?.classList.remove('hidden');
        };
        
        const handleConfirmExportStores = () => {
            const exportModal = document.getElementById('export-stores-modal');
            const format = document.querySelector('input[name="export-stores-format"]:checked')?.value || 'json';
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `grocery-stores-${dateStr}`;
            
            if (format === 'pdf') {
                exportStoresToPDF(currentStores, `${filename}.pdf`);
            } else if (format === 'excel') {
                exportStoresToExcel(currentStores, `${filename}.xlsx`);
            } else {
                exportStoresToJSON(currentStores, `${filename}.json`);
            }
            
            exportModal?.classList.add('hidden');
        };
        
        // Import stores
        const handleImportStores = () => {
            document.getElementById('import-stores-modal')?.classList.remove('hidden');
        };
        
        const handleImportStoresFile = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const storesToImport = data.stores || (Array.isArray(data) ? data : []);
                
                if (!Array.isArray(storesToImport) || storesToImport.length === 0) {
                    alert('Invalid file format. Please select a valid stores export file.');
                    return;
                }
                
                // Import stores via API
                for (const store of storesToImport) {
                    if (store.name) {
                        await fetch('/api/grocery-stores', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: store.name })
                        });
                    }
                }
                
                // Reload stores
                await loadStores();
                
                const importModal = document.getElementById('import-stores-modal');
                if (importModal) {
                    importModal.classList.add('hidden');
                }
                
                // Reset file input
                event.target.value = '';
            } catch (error) {
                console.error('Error importing stores:', error);
                alert('Failed to import stores. Please check the file format and try again.');
            }
        };
        
        // Setup shared handlers
        setupShareUrlHandlers('stores');
        setupModalCloseHandlers('export-stores-modal', null, 'cancel-export-stores');
        setupModalCloseHandlers('import-stores-modal', null, 'cancel-import-stores');
        setupFileInputButton('import-stores-file-button', 'import-stores-file-input');
        
        // Event listeners
        document.getElementById('share-stores-button')?.addEventListener('click', handleShareStores);
        document.getElementById('export-stores-button')?.addEventListener('click', handleExportStores);
        document.getElementById('import-stores-button')?.addEventListener('click', handleImportStores);
        document.getElementById('confirm-export-stores')?.addEventListener('click', handleConfirmExportStores);
        document.getElementById('import-stores-file-input')?.addEventListener('change', handleImportStoresFile);
        
        // Initial load
        loadStores();
    </script>
</body>
</html>


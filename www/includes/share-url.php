<?php
/**
 * Render share URL container
 * @param string $prefix Prefix for element IDs (e.g., 'stores' for 'share-stores-url')
 */
function renderShareUrlContainer($prefix = '') {
    $idPrefix = $prefix ? $prefix . '-' : '';
    ?>
    <div id="<?php echo $idPrefix; ?>share-url-container" class="hidden mt-2 bg-gray-100 p-2 rounded-md max-w-md mx-auto dark:bg-gray-800">
        <div class="flex items-center">
            <input id="<?php echo $idPrefix; ?>share-url" type="text" readonly class="bg-white px-2 py-1 rounded text-sm flex-grow mr-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
            <button id="copy-<?php echo $idPrefix; ?>share-url" class="text-sm bg-gray-300 hover:bg-gray-400 px-2 py-1 rounded dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 mr-1">
                Copy
            </button>
            <button id="close-<?php echo $idPrefix; ?>share-url" class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    </div>
<?php
}
?>


<?php
require __DIR__ . '/../config/config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>Todo</title>
    <!-- Tailwind CSS (production version) -->
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <!-- SortableJS for drag and drop functionality - use minified version from CDN -->
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>
    <!-- jsPDF for PDF generation -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <!-- SheetJS for Excel generation -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <!-- Minimal styles without animations -->
    <link rel="stylesheet" href="/assets/css/todo.css">
</head>
<body class="bg-gray-50 text-gray-800 min-h-screen dark:bg-gray-900 dark:text-gray-200">
    <div class="container mx-auto px-4 py-6 max-w-lg">
        <header class="text-center mb-6">
            <h1 class="text-3xl font-bold text-gray-700 dark:text-gray-200">Todo</h1>
            <div class="mt-3 flex flex-col gap-2">
                <!-- Back to My List button (only shown for shared lists) -->
                <button id="back-to-personal-button" class="hidden text-sm bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1 rounded-md flex items-center mx-auto">
                    <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back to My List
                </button>

                <div class="flex gap-2 justify-center">
                    <button id="share-button" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                        </svg>
                        Share List
                    </button>
                    <button id="export-button" class="text-sm bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Export
                    </button>
                    <button id="import-button" class="text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-1 rounded-md flex items-center">
                        <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14v-2m0 0V8m0 2h2m-2 0H10m8 6H6a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Import
                    </button>
                </div>
                <input type="file" id="import-file-input" accept=".json" class="hidden">
                <button id="theme-toggle" class="p-1 rounded-full opacity-40 hover:opacity-80 transition-opacity absolute top-4 right-4" title="Toggle dark/light mode" aria-label="Toggle dark/light mode">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path class="sun-icon" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path>
                        <path class="moon-icon" d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                    </svg>
                </button>
                <div id="share-url-container" class="hidden mt-2 bg-gray-100 p-2 rounded-md max-w-md mx-auto dark:bg-gray-800">
                    <div class="flex items-center">
                        <input id="share-url" type="text" readonly class="bg-white px-2 py-1 rounded text-sm flex-grow mr-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
                        <button id="copy-share-url" class="text-sm bg-gray-300 hover:bg-gray-400 px-2 py-1 rounded dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 mr-1">
                            Copy
                        </button>
                        <button id="close-share-url" class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
            </div>
        </header>
        
        <!-- Breadcrumb navigation for focus mode -->
        <div id="task-breadcrumb" class="mb-4 hidden">
            <div class="flex items-center flex-wrap text-sm mb-2 breadcrumb-trail">
                <button class="text-blue-500 hover:text-blue-700 dark:text-gray-300 dark:hover:text-white" data-level="root">All Tasks</button>
                <div id="breadcrumb-items" class="flex items-center flex-wrap"></div>
            </div>
            <div id="focus-title" class="text-lg font-semibold"></div>
        </div>
        
        <div class="bg-white rounded-lg shadow-md p-6 dark:bg-gray-800">
            <!-- Add task form -->
            <form id="task-form" class="flex items-center mb-6">
                <input 
                    type="text" 
                    id="task-input" 
                    placeholder="Add a new task..." 
                    class="flex-1 py-2 px-4 rounded-l-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                    required
                >
                <button 
                    type="submit" 
                    class="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-r-lg transition duration-200"
                >
                    Add
                </button>
            </form>
            
            <!-- Task list -->
            <div id="tasks-container">
                <!-- Active tasks -->
                <div class="flex justify-between items-center mb-4">
                    <div class="flex gap-2">
                        <button id="ai-sort-button" class="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md flex items-center" title="Sort list order by grocery store layout (AI-powered)">
                            <svg class="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"></path>
                            </svg>
                            Sort
                        </button>
                        <button id="get-recipe-button" class="text-xs bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md flex items-center" title="Generate a recipe based on your ingredients (AI-powered)">
                            <svg class="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                            </svg>
                            Get Recipe
                        </button>
                    </div>
                    <span id="task-count" class="text-sm text-gray-500 dark:text-gray-400">0 tasks</span>
                </div>
                
                <ul id="active-task-list" class="space-y-2 mb-6">
                    <!-- Active tasks will be inserted here by JavaScript -->
                </ul>
                
                <!-- Empty state for active tasks -->
                <div id="empty-state" class="text-center py-6">
                    <p class="text-gray-500 dark:text-gray-400">Your list is empty</p>
                    <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Add a task to get started</p>
                </div>
                
                <!-- Recipe Modal -->
                <div id="recipe-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full flex flex-col" style="max-height: 90vh;">
                        <div class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
                            <h2 id="recipe-modal-title" class="text-2xl font-bold text-gray-800 dark:text-gray-200">Recipe</h2>
                            <button id="close-recipe-modal" class="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-md font-medium transition-colors">
                                Close
                            </button>
                        </div>
                        <div id="recipe-content" class="flex-1 overflow-y-auto p-6" style="overflow-y: auto; overflow-x: hidden;">
                            <!-- Recipe will be displayed here -->
                        </div>
                        <div id="recipe-footer" class="hidden flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
                            <button id="get-next-recipe-button" class="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center">
                                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                </svg>
                                Next Recipe
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Export Modal -->
                <div id="export-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Export List</h2>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-600 dark:text-gray-400 mb-4">Choose what to export:</p>
                            <div class="space-y-3 mb-6">
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-option" value="all" class="mt-1 mr-3" checked>
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Everything (Recommended)</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Export all tasks including nested sub-lists</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-option" value="current" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Current View Only</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Export only the tasks you're currently viewing</div>
                                    </div>
                                </label>
                            </div>
                            <p class="text-gray-600 dark:text-gray-400 mb-4">Choose format:</p>
                            <div class="space-y-3 mb-6">
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-format" value="json" class="mt-1 mr-3" checked>
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">JSON</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Machine-readable format for backup</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-format" value="pdf" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">PDF</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Printable document format</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-format" value="excel" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Excel</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Spreadsheet format (.xlsx)</div>
                                    </div>
                                </label>
                            </div>
                            <p class="text-gray-600 dark:text-gray-400 mb-4">Include completed tasks:</p>
                            <div class="space-y-3">
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-completed" value="include" class="mt-1 mr-3" checked>
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Yes</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Include both active and completed tasks</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="export-completed" value="exclude" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">No</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Export only uncompleted tasks</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button id="cancel-export" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                Cancel
                            </button>
                            <button id="confirm-export" class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md">
                                Export
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Import Modal -->
                <div id="import-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Import List</h2>
                        </div>
                        <div class="p-6">
                            <div class="mb-6">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from URL</label>
                                <input 
                                    type="url" 
                                    id="import-url-input" 
                                    placeholder="https://example.com/recipe" 
                                    class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                >
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Paste a recipe or article URL to extract ingredients and create a list</p>
                            </div>
                            <div class="mb-6">
                                <div class="text-center text-gray-500 dark:text-gray-400 mb-2">OR</div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from File</label>
                                <button 
                                    id="import-file-button" 
                                    class="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-600"
                                >
                                    Choose JSON File
                                </button>
                            </div>
                        </div>
                        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button id="cancel-import" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                Cancel
                            </button>
                            <button id="confirm-import-url" class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md">
                                Import from URL
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Completed tasks section -->
                <div id="completed-section" class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700" style="display: none;">
                    <button id="completed-toggle" class="flex justify-between items-center w-full mb-4 text-left hover:opacity-80 transition-opacity">
                        <h2 class="text-lg font-medium text-gray-600 dark:text-gray-300">Completed</h2>
                        <div class="flex items-center gap-2">
                            <span id="completed-count" class="text-sm text-gray-500 dark:text-gray-400">0 completed</span>
                            <svg id="completed-chevron" class="h-5 w-5 text-gray-500 dark:text-gray-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                    </button>
                    
                    <ul id="completed-task-list" class="space-y-2 hidden">
                        <!-- Completed tasks will be inserted here by JavaScript -->
                    </ul>
                </div>
            </div>
        </div>
        
    </div>
    <script>
        function loadMain(version) {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = `/assets/js/main.js?v=${version}`;
            document.head.appendChild(script);
        }

        fetch('/assets/js/main.js', { method: 'HEAD', cache: 'no-cache' })
            .then(r => r.headers.get('Last-Modified'))
            .then(t => t ? new Date(t).getTime() : Date.now())
            .then(loadMain)
            .catch(() => loadMain(Date.now()));
    </script>
</body>
</html>
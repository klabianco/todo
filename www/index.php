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

                <button id="share-button" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded-md flex items-center mx-auto">
                    <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                    </svg>
                    Share List
                </button>
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
                    <button id="ai-sort-button" class="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md flex items-center" title="Sort list order by grocery store layout (AI-powered)">
                        <svg class="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"></path>
                        </svg>
                        Sort
                    </button>
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
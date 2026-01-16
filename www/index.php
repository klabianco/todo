<?php
require __DIR__ . '/../config/config.php';
require __DIR__ . '/includes/head.php';
require __DIR__ . '/includes/footer.php';
require __DIR__ . '/includes/theme-toggle.php';
require __DIR__ . '/includes/container.php';
require __DIR__ . '/api/db/Database.php';

// Get page title - check for shared list
$pageTitle = 'Todo';
$shareId = $_GET['share'] ?? null;

if ($shareId) {
    try {
        $db = Database::getInstance();
        $stmt = $db->prepare('SELECT title, list_type FROM lists WHERE share_id = ?');
        $stmt->execute([$shareId]);
        $list = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($list && !empty($list['title'])) {
            $pageTitle = $list['title'];
        } elseif ($list) {
            // Fallback based on list type
            $pageTitle = match($list['list_type']) {
                'schedule' => 'Schedule',
                'grocery' => 'Grocery List',
                default => 'Shared List'
            };
        }
    } catch (Exception $e) {
        // Silently fail, use default title
    }
}

renderHead($pageTitle, ['sortablejs', 'jspdf', 'xlsx'], true);
renderContainerStart();
?>
        <header class="text-center mb-8">
            <div class="flex items-center justify-center gap-2">
                <h1 id="list-title" class="text-2xl font-semibold text-gray-900 dark:text-white">My List</h1>
                <button id="edit-title-button" class="hidden text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-white p-1" title="Edit list name">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                </button>
                <button id="ai-title-button" class="hidden text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-white p-1" title="Generate name with AI">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
                    </svg>
                </button>
                <span id="list-type-badge" class="hidden text-xs px-2 py-1 rounded-md font-medium"></span>
            </div>
            <!-- Edit title input (hidden by default) -->
            <div id="edit-title-container" class="hidden mt-2">
                <div class="flex items-center justify-center gap-2 max-w-md mx-auto">
                    <input type="text" id="edit-title-input" class="flex-1 px-3 py-2 text-lg border-0 bg-gray-100 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 dark:text-gray-100">
                    <button id="save-title-button" class="bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium px-3 py-2 rounded-md">Save</button>
                    <button id="cancel-title-button" class="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-md">Cancel</button>
                </div>
            </div>
            <div class="mt-4 flex flex-col gap-3">
                <!-- Back to My List button (only shown for shared lists) -->
                <button id="back-to-personal-button" class="hidden text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 px-4 py-2 rounded-lg flex items-center mx-auto transition-colors">
                    <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back to My List
                </button>

                <div class="flex gap-3 justify-center flex-wrap">
                    <button id="create-list-button" class="text-sm bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-colors font-medium">
                        <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        New List
                    </button>
                    <button id="share-button" class="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 px-3 py-2 rounded-lg flex items-center transition-colors">
                        <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                        </svg>
                        Share
                    </button>
                    <button id="export-button" class="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 px-3 py-2 rounded-lg flex items-center transition-colors">
                        <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Export
                    </button>
                    <button id="import-button" class="text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 px-3 py-2 rounded-lg flex items-center transition-colors">
                        <svg class="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                        </svg>
                        Import
                    </button>
                </div>
                <input type="file" id="import-file-input" accept=".json" class="hidden">
                <?php renderThemeToggle(); ?>
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
                <button class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white" data-level="root">All Tasks</button>
                <div id="breadcrumb-items" class="flex items-center flex-wrap"></div>
            </div>
            <div id="focus-title" class="text-lg font-semibold dark:text-white"></div>
        </div>
        
        <div class="bg-white rounded-2xl shadow-sm p-8 dark:bg-gray-800">
            <!-- Add task form -->
            <form id="task-form" class="flex items-center mb-8">
                <input
                    type="time"
                    id="task-time-input"
                    class="hidden py-3 px-4 rounded-l-xl border-0 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-gray-500"
                >
                <input
                    type="text"
                    id="task-input"
                    placeholder="Add task..."
                    class="flex-1 py-3 px-4 rounded-l-xl border-0 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-gray-500"
                    required
                >
                <button
                    type="submit"
                    class="bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white py-3 px-6 rounded-r-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
                >
                    Add
                </button>
            </form>

            <!-- Schedule "Now" Header -->
            <div id="schedule-now-header" class="hidden mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl font-semibold text-blue-600 dark:text-blue-400" id="schedule-current-time">--:-- --</div>
                        <div class="text-gray-800 dark:text-gray-100" id="schedule-current-event">
                            <span class="text-gray-500 dark:text-gray-400">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Task list -->
            <div id="tasks-container">
                <!-- Active tasks -->
                <div class="flex justify-between items-center mb-6">
                    <div class="flex gap-3 items-center flex-wrap">
                        <button id="import-text-button" class="hidden text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg flex items-center transition-colors" title="Import tasks from pasted text (AI)">
                            <svg class="h-3.5 w-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Import
                        </button>
                        <button id="ai-sort-button" class="text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg flex items-center transition-colors" title="Assign aisle/department to each item (AI) and sort">
                            <svg class="h-3.5 w-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"></path>
                            </svg>
                            Sort
                        </button>
                        <select id="grocery-store-select" class="text-xs bg-transparent text-gray-600 dark:text-gray-400 px-2 py-1.5 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-500 cursor-pointer">
                            <option value="">Auto</option>
                        </select>
                        <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 select-none cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            <input id="show-locations-toggle" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-400 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            <span>Locations</span>
                        </label>
                        <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 select-none cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            <input id="show-times-toggle" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-400 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            <span>Times</span>
                        </label>
                    </div>
                    <span id="task-count" class="text-sm text-gray-400 dark:text-gray-500">0 tasks</span>
                </div>
                
                <ul id="active-task-list" class="space-y-3 mb-6">
                    <!-- Active tasks will be inserted here by JavaScript -->
                </ul>

                <!-- Empty state for active tasks -->
                <div id="empty-state" class="text-center py-12">
                    <p class="text-gray-400 dark:text-gray-500 text-lg">No tasks yet</p>
                    <p class="text-sm text-gray-300 dark:text-gray-600 mt-2">Add something above to get started</p>
                </div>
                
                <!-- Share Modal -->
                <div id="share-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Share List</h2>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-600 dark:text-gray-400 mb-4">Choose list type:</p>
                            <div class="space-y-3">
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="share-list-type" value="todo" class="mt-1 mr-3" checked>
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">To-Do List</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">General purpose task list</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="share-list-type" value="grocery" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Grocery List</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Shopping list with store locations</div>
                                    </div>
                                </label>
                                <label class="flex items-start cursor-pointer">
                                    <input type="radio" name="share-list-type" value="schedule" class="mt-1 mr-3">
                                    <div>
                                        <div class="font-medium text-gray-800 dark:text-gray-200">Daily Schedule</div>
                                        <div class="text-sm text-gray-500 dark:text-gray-400">Time-based schedule with sorted activities</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button id="cancel-share" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                Cancel
                            </button>
                            <button id="confirm-share" class="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium rounded-md">
                                Share
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Export Modal -->
                <div id="export-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full">
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
                            <button id="confirm-export" class="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium rounded-md">
                                Export
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Import Modal -->
                <div id="import-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Import List</h2>
                        </div>
                        <div class="p-6">
                            <div class="mb-6">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from URL</label>
                                <input
                                    type="url"
                                    id="import-url-input"
                                    placeholder="https://todo.o9p.net?share=... or recipe URL"
                                    class="w-full px-4 py-2 border-0 bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-gray-500"
                                >
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Paste a share link to import a list, or a recipe/article URL to extract items</p>
                            </div>
                            <div class="mb-6">
                                <div class="text-center text-gray-500 dark:text-gray-400 mb-2">OR</div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from Text (AI)</label>
                                <textarea
                                    id="import-text-input"
                                    rows="5"
                                    placeholder="Paste your schedule, todo list, or any text with tasks..."
                                    class="w-full px-4 py-2 border-0 bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-gray-500 resize-none"
                                ></textarea>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">AI will parse times and tasks from plain text</p>
                            </div>
                            <div class="mb-6">
                                <div class="text-center text-gray-500 dark:text-gray-400 mb-2">OR</div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import from File</label>
                                <button
                                    id="import-file-button"
                                    class="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md"
                                >
                                    Choose JSON File
                                </button>
                            </div>
                        </div>
                        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button id="cancel-import" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                Cancel
                            </button>
                            <button id="confirm-import-text" class="hidden px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium rounded-md">
                                Import Text
                            </button>
                            <button id="confirm-import-url" class="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium rounded-md">
                                Import from URL
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Edit Task Modal -->
                <div id="edit-task-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md w-full">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-200">Edit Task</h2>
                        </div>
                        <div class="p-6 space-y-4">
                            <input type="hidden" id="edit-task-id">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Task</label>
                                <input
                                    type="text"
                                    id="edit-task-text"
                                    class="w-full px-4 py-2 border-0 bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-gray-500"
                                >
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Location</label>
                                <input
                                    type="text"
                                    id="edit-task-location"
                                    placeholder="e.g., Aisle 5, Produce, etc."
                                    class="w-full px-4 py-2 border-0 bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-gray-500"
                                >
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scheduled Time</label>
                                <input
                                    type="time"
                                    id="edit-task-time"
                                    class="w-full px-4 py-2 border-0 bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-gray-500"
                                >
                            </div>
                        </div>
                        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button id="cancel-edit-task" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                Cancel
                            </button>
                            <button id="save-edit-task" class="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-medium rounded-md">
                                Save
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Completed tasks section -->
                <div id="completed-section" class="mt-10 pt-8 border-t border-gray-100 dark:border-gray-700/50" style="display: none;">
                    <button id="completed-toggle" class="flex justify-between items-center w-full mb-4 text-left hover:opacity-80 transition-opacity">
                        <h2 class="text-base font-medium text-gray-400 dark:text-gray-500">Completed</h2>
                        <div class="flex items-center gap-2">
                            <span id="completed-count" class="text-sm text-gray-400 dark:text-gray-500">0 completed</span>
                            <svg id="completed-chevron" class="h-5 w-5 text-gray-400 dark:text-gray-500 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                    </button>
                    <div class="mb-4">
                        <button id="clear-completed-button" class="hidden text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 px-2 py-1 rounded transition-colors" title="Clear all completed tasks">
                            Clear All
                        </button>
                    </div>

                    <ul id="completed-task-list" class="space-y-3 hidden">
                        <!-- Completed tasks will be inserted here by JavaScript -->
                    </ul>
                </div>
            </div>
        </div>
        
    <?php renderContainerEnd(); ?>
    
    <?php renderFooter(); ?>
    
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
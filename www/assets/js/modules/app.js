/**
 * Main application module for the Todo app
 * Connects all the other modules and handles app initialization
 */
import * as utils from './utils.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as tasks from './tasks.js';
import * as groceryStores from './grocery-stores.js';
import { showLoadingOverlay, hideLoadingOverlay } from './overlay-utils.js';

// App state
let taskNavigationStack = [];
let currentFocusedTaskId = null;
let draggedTaskId = null;


// Wrappers to update UI after task modifications
const handleToggleCompletion = async (id) => {
    await tasks.toggleTaskCompletion(id);
    await renderTasks();
};

const handleDeleteTask = async (id) => {
    await tasks.deleteTask(id);
    await renderTasks();
};

const handleToggleSticky = async (id) => {
    await tasks.toggleTaskSticky(id);
    await renderTasks();
};

// Initialize grocery store dropdown
const initializeGroceryStoreDropdown = async () => {
    const select = document.getElementById('grocery-store-select');
    if (!select) return;
    
    // Load stores and populate dropdown
    const stores = await groceryStores.loadGroceryStores();
    const selectedStore = groceryStores.getSelectedGroceryStore();
    
    // Clear existing options except "No Store"
    select.innerHTML = '<option value="">No Store</option>';
    
    // Add stores to dropdown
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        // Show first line (name) in dropdown, or full text if single line
        const displayName = store.name.split('\n')[0];
        option.textContent = displayName;
        if (selectedStore && selectedStore.id === store.id) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Handle selection change
    select.addEventListener('change', async (e) => {
        const storeId = e.target.value;
        if (storeId) {
            const store = await groceryStores.getGroceryStoreById(storeId);
            if (store) {
                groceryStores.setSelectedGroceryStore(store);
            }
        } else {
            groceryStores.setSelectedGroceryStore(null);
        }
    });
};

// Initialize the application
export const init = async () => {
    // Initialize storage state
    const { isSharedList, shareId } = storage.initializeStorageState();

    // Check if we're returning from a shared list and need to refresh the lists UI
    const urlParams = new URLSearchParams(window.location.search);
    const shouldRefreshLists = urlParams.has('refreshLists');
    
    // Remove the refresh parameter if it exists
    if (shouldRefreshLists) {
        urlParams.delete('refreshLists');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, document.title, newUrl);
    }

    // Initialize storage system
    await storage.initializeStorage();

    // Always load the user's lists so subscriptions are accurate
    await storage.loadUserLists();

    // Determine ownership after loading lists
    const isOwner = isSharedList && storage.isOwnedList(shareId);
    
    // Setup UI for shared list if needed
    ui.setupSharedUI(isOwner);
    
    // Set up event listeners
    await setupEventListeners();
    
    // Process subscriptions from localStorage
    if (!isSharedList) {
        try {
            const processSubscription = async (key) => {
                const subJson = localStorage.getItem(key);
                if (!subJson) return false;
                
                const sub = JSON.parse(subJson);
                const isRecent = (Date.now() - sub.timestamp) < 300000; // 5 minutes
                
                if (isRecent && sub.id) {
                    const currentLists = storage.getSubscribedLists();
                    if (!currentLists.some(list => list.id === sub.id)) {
                        await storage.subscribeToSharedList(
                            sub.id,
                            sub.title || 'Shared List',
                            sub.url || window.location.origin
                        );
                    }
                }
                
                localStorage.removeItem(key);
                return true;
            };
            
            await processSubscription('todo_force_subscription');
            await processSubscription('todo_pending_subscription');
        } catch (err) {
            console.error('Error processing subscription from localStorage:', err);
        }
    }
    
    // Setup subscribed lists or auto-subscribe when visiting a shared list
    if (!isSharedList) {
        // Always reload the user lists from the server to get the most up-to-date subscriptions
        // This ensures any lists subscribed to in other tabs/sessions are reflected
        await storage.loadUserLists();
        
        // Get the current list of subscriptions after reloading
        const subscribedLists = storage.getSubscribedLists();
        
        if (subscribedLists.length > 0) {
            // Validate lists in parallel
            const validatedLists = await Promise.all(
                subscribedLists.map(async (list) => {
                    try {
                        const response = await fetch(`/api/lists/${list.id}?t=${Date.now()}`, {
                            headers: { 'Accept': 'application/json' },
                            cache: 'no-store'
                        });
                        return response.ok ? list : null;
                    } catch (err) {
                        console.error(`Error checking list ${list.id}:`, err);
                        return null;
                    }
                })
            ).then(lists => lists.filter(Boolean));
            
            if (validatedLists.length < subscribedLists.length) {
                await storage.saveSubscribedLists(validatedLists);
            }
            
            if (validatedLists.length > 0 || shouldRefreshLists) {
                ui.addSubscribedListsUI(validatedLists, handleSubscribedListClick);
            }
        } else if (shouldRefreshLists) {
            // If we have no lists but are coming back from a shared view,
            // try loading lists again to catch any recent subscriptions
            await storage.loadUserLists();
            const refreshedLists = storage.getSubscribedLists();
            if (refreshedLists.length > 0) {
                ui.addSubscribedListsUI(refreshedLists, handleSubscribedListClick);
            }
        }
    } else {
        if (!isOwner) {
            await autoSubscribeSharedList(shareId);
        }
    }
    
    // Render initial task list
    await renderTasks();

    // Set up real-time updates
    if (isSharedList) {
        // Connect to updates for the current shared list
        const shareId = window.location.search.split('share=')[1]?.split('&')[0];
        
        storage.connectToUpdates(shareId, (updatedData) => {
            if (updatedData.tasks) {
                // Update the tasks in storage
                storage.updateTasks(updatedData.tasks);
                
                // Re-render the tasks using our app's render function
                renderTasks();
                
                // Show notification about the update
                ui.showUpdatedNotification();
                
                // Don't update focus from real-time updates to preserve navigation stack
                // The focusId in real-time updates only stores single-level focus,
                // but we support multi-level navigation (e.g., groceries -> 2 perfect bars)
                // Let users control their own navigation instead of syncing it
            }
        });
    } else {
        // Connect to updates for owned lists when in personal view
        storage.connectToOwnedListsUpdates((updatedData) => {
            if (updatedData.tasks) {
                // Use the local renderTasks function instead of ui.renderTasks
                renderTasks();
                ui.showUpdatedNotification();
                
                // Don't update focus from real-time updates to preserve navigation stack
                // Let users control their own navigation
            }
        });
    }

    // Auto focus on shared list's saved focus task
    const focusId = storage.getSharedListFocusId();
    if (focusId) {
        const allTasks = await storage.loadTasks();
        const result = utils.findTaskById(allTasks, focusId);
        if (result && result.task) {
            // Update page title immediately without waiting for the focus effect
            document.title = `${result.task.task} - Todo`;
            focusOnTask(focusId, result.task.task);
        }
    }
};

// Handle clicking on a subscribed shared list
const handleSubscribedListClick = async (list) => {
    // First check if the list still exists
    try {
        const response = await fetch(`/api/lists/${list.id}`, { method: 'GET' });
        if (!response.ok) {
            // List doesn't exist anymore, remove it from subscriptions
            alert(`This shared list no longer exists and will be removed from your subscriptions.`);
            storage.unsubscribeFromSharedList(list.id);
            
            // Refresh the subscribed lists UI
            const updatedLists = storage.getSubscribedLists();
            ui.addSubscribedListsUI(updatedLists, handleSubscribedListClick);
            return;
        }
    } catch (err) {
        console.error('Error checking list:', err);
    }
    
    // List exists, navigate to it
    window.location.href = list.url;
};

// Automatically subscribe to a shared list when visiting via share link
const autoSubscribeSharedList = async (shareId) => {
    if (!shareId) return;
    
    try {
        // Load the most recent list of tasks to determine a title
        const allTasks = await storage.loadTasks();
        
        // Choose a descriptive title for the subscription
        let listTitle = 'Shared List';
        const firstActiveTask = allTasks.find(task => !task.completed);
        if (firstActiveTask) {
            listTitle = firstActiveTask.task;
        } else if (allTasks.length > 0) {
            // Use the first task even if completed
            listTitle = allTasks[0].task;
        }
        
        // Make title more descriptive if possible
        if (listTitle === 'Shared List' && window.location.href.includes('groceries')) {
            listTitle = 'Groceries';
        }
        
        // Generate the share URL (current URL)
        const shareUrl = window.location.href;
        
        // Use our enhanced subscribe function which returns a promise
        const updatedLists = await storage.subscribeToSharedList(shareId, listTitle, shareUrl);
        
        // Verify subscription was added
        
        return updatedLists;
    } catch (err) {
        console.error('Error during auto-subscription:', err);
        return null;
    }
};


// Show notification when URL is copied - make globally available
window.showCopiedNotification = () => {
    // First, check if there's already a notification and remove it
    const existingNotification = document.getElementById('copied-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'copied-notification';
    notification.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
    notification.innerHTML = `
        <svg class="h-5 w-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>Share URL copied to clipboard</span>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('opacity-0');
        notification.style.transition = 'opacity 0.5s ease';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
};

// Handle returning to personal list from shared list
const handleBackToPersonalList = async () => {
    if (storage.getIsSharedList()) {
        const currentShareId = storage.getShareId();
        
        // First, check if this is a list that we own
        // If it is, we don't need to worry about subscriptions
        if (!storage.isOwnedList(currentShareId)) {
            try {
                // Get the current list title
                const allTasks = await storage.loadTasks();
                let listTitle = 'Shared List';
                if (allTasks.length > 0) {
                    listTitle = allTasks[0].task;
                }
                // For the specific case mentioned by the user
                if (window.location.href.includes('groceries')) {
                    listTitle = 'Groceries';
                }
                
                // Generate the share URL
                const shareUrl = window.location.href;
                
                // DIRECT APPROACH: Add this subscription to localStorage immediately
                // This will be read and applied on the personal list page
                localStorage.setItem('todo_force_subscription', JSON.stringify({
                    id: currentShareId,
                    title: listTitle,
                    url: shareUrl,
                    timestamp: Date.now()
                }));
                
                // Try saving through the normal API as well
                const currentLists = storage.getSubscribedLists();
                
                // Check if already in the list
                if (!currentLists.some(list => list.id === currentShareId)) {
                    currentLists.push({
                        id: currentShareId,
                        title: listTitle,
                        url: shareUrl,
                        lastAccessed: new Date().toISOString()
                    });
                    
                    // Save updated list
                    await storage.saveSubscribedLists(currentLists);
                }
            } catch (err) {
                console.error('Error saving subscription before navigation:', err);
            }
        }
    }
    
    // Clear the share parameter from URL and disconnect real-time updates
    storage.disconnectUpdates();
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    
    // Add a flag to indicate we're coming back from a shared list
    url.searchParams.set('refreshLists', 'true');
    
    // Navigate back to personal list
    window.location.href = url.href;
};

// Handle deleting a shared list (owner only)
const handleDeleteSharedList = async () => {
    if (!storage.getIsSharedList() || !storage.isOwnedList(storage.getShareId())) {
        return; // Not a shared list or not the owner
    }
    
    const confirmDelete = confirm('Are you sure you want to delete this shared list? This will remove it for all users who have subscribed to it.');
    if (!confirmDelete) {
        return;
    }
    
    const shareId = storage.getShareId();
    const success = await storage.deleteSharedList(shareId);
    
    if (success) {
        // Redirect back to personal list
        storage.disconnectUpdates();
        const url = new URL(window.location.href);
        url.searchParams.delete('share');
        url.searchParams.set('refreshLists', 'true');
        window.location.href = url.href;
    } else {
        alert('Failed to delete the shared list. Please try again.');
    }
};

// Set up all event listeners
const setupEventListeners = async () => {

    // Back to personal list button
    if (ui.domElements.backToPersonalButton) {
        ui.domElements.backToPersonalButton.addEventListener('click', handleBackToPersonalList);
    }

    // Task form submission
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.addEventListener('submit', async e => {
        e.preventDefault();
        const taskText = ui.domElements.taskInput.value.trim();

        if (taskText) {
            await tasks.addTask(taskText, currentFocusedTaskId);
            await renderTasks();
            ui.domElements.taskInput.value = '';
            ui.domElements.taskInput.focus();
        }
        });
    }
    
    // Root breadcrumb navigation
    const rootBreadcrumb = document.querySelector('.breadcrumb-trail button[data-level="root"]');
    if (rootBreadcrumb) {
        rootBreadcrumb.addEventListener('click', () => jumpToBreadcrumb('root'));
    }
    
    // Delete shared list button (for owners)
    const deleteListButton = document.getElementById('delete-list-button');
    if (deleteListButton) {
        deleteListButton.addEventListener('click', handleDeleteSharedList);
    }
    
    // Set up share button
    ui.setupShareButton(handleShareButtonClick);
    
    // Set up export button
    const exportButton = document.getElementById('export-button');
    if (exportButton) {
        exportButton.addEventListener('click', handleExportClick);
    }
    
    // Set up import button and modal
    const importButton = document.getElementById('import-button');
    const importModal = document.getElementById('import-modal');
    const importFileInput = document.getElementById('import-file-input');
    const importFileButton = document.getElementById('import-file-button');
    const importUrlInput = document.getElementById('import-url-input');
    const confirmImportUrlButton = document.getElementById('confirm-import-url');
    const cancelImportButton = document.getElementById('cancel-import');
    
    if (importButton && importModal) {
        importButton.addEventListener('click', () => {
            importModal.classList.remove('hidden');
            importUrlInput.value = '';
        });
    }
    
    if (cancelImportButton && importModal) {
        cancelImportButton.addEventListener('click', () => {
            // Only allow cancel if not currently importing
            const confirmImportUrlButton = utils.$('confirm-import-url');
            if (!confirmImportUrlButton || !confirmImportUrlButton.disabled) {
                importModal.classList.add('hidden');
                importUrlInput.value = '';
            }
        });
    }
    
    // Don't allow closing modal by clicking outside - it should stay open during import
    
    // File import button in modal
    if (importFileButton && importFileInput) {
        importFileButton.addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', handleImportFile);
    }
    
    // URL import
    if (confirmImportUrlButton && importUrlInput) {
        confirmImportUrlButton.addEventListener('click', handleImportFromUrl);
        importUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleImportFromUrl();
            }
        });
    }
    
    // Set up export modal
    const exportModal = document.getElementById('export-modal');
    const cancelExportButton = document.getElementById('cancel-export');
    const confirmExportButton = document.getElementById('confirm-export');
    if (exportModal && cancelExportButton && confirmExportButton) {
        cancelExportButton.addEventListener('click', () => {
            exportModal.classList.add('hidden');
        });
        confirmExportButton.addEventListener('click', handleConfirmExport);
    }

    // Set up AI sort button
    const aiSortButton = document.getElementById('ai-sort-button');
    if (aiSortButton) {
        aiSortButton.addEventListener('click', handleAISortClick);
    }

    // Aisle badge toggle (default off)
    const SHOW_AISLES_KEY = 'todo_show_aisles';
    const showAislesToggle = document.getElementById('show-aisles-toggle');
    const initialShowAisles = localStorage.getItem(SHOW_AISLES_KEY) === '1';
    ui.setShowAisles(initialShowAisles);
    if (showAislesToggle) {
        showAislesToggle.checked = initialShowAisles;
        showAislesToggle.addEventListener('change', async (e) => {
            const enabled = !!e.target.checked;
            localStorage.setItem(SHOW_AISLES_KEY, enabled ? '1' : '0');
            ui.setShowAisles(enabled);
            await renderTasks();
        });
    }

    // Set up grocery store dropdown and management
    await initializeGroceryStoreDropdown();
    
    // Set up completed tasks toggle
    if (ui.domElements.completedToggle) {
        ui.domElements.completedToggle.addEventListener('click', ui.toggleCompletedTasksList);
    }
    
    // Set up Clear Completed button
    const clearCompletedButton = document.getElementById('clear-completed-button');
    if (clearCompletedButton) {
        clearCompletedButton.addEventListener('click', handleClearCompleted);
    }

    // Handle drag and drop on breadcrumb for task promotion
    if (ui.domElements.taskBreadcrumb) {
        ui.domElements.taskBreadcrumb.addEventListener('dragover', e => {
            e.preventDefault();
            ui.domElements.taskBreadcrumb.classList.add('drag-over');
        });

        ui.domElements.taskBreadcrumb.addEventListener('dragleave', () => {
            ui.domElements.taskBreadcrumb.classList.remove('drag-over');
        });

        ui.domElements.taskBreadcrumb.addEventListener('drop', e => {
            e.preventDefault();
            ui.domElements.taskBreadcrumb.classList.remove('drag-over');
            const id = draggedTaskId || e.dataTransfer.getData('text/plain');
            if (id) {
                promoteTask(id);
                draggedTaskId = null;
            }
        });
    }
};

// Helper to determine which tasks to sort and get parent info
const getTasksToSort = (allTasks) => {
    const context = utils.getCurrentViewContext(allTasks, currentFocusedTaskId, utils.findTaskById);
    if (!context) return null;
    
    // For sorting, we only want active tasks
    return {
        tasks: utils.filterTasks(context.tasks, { completed: false }),
        parentTask: context.parentTask,
        parentId: context.parentId
    };
};

// Disable all interactions during sorting
const disableAllInteractions = () => {
    // Disable task form
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.style.pointerEvents = 'none';
        ui.domElements.taskForm.style.opacity = '0.5';
    }
    if (ui.domElements.taskInput) {
        ui.domElements.taskInput.disabled = true;
    }
    
    // Disable all task buttons and checkboxes
    const taskButtons = document.querySelectorAll('#active-task-list button, #completed-task-list button');
    taskButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
    });
    
    const checkboxes = document.querySelectorAll('#active-task-list input[type="checkbox"], #completed-task-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.disabled = true;
        cb.style.pointerEvents = 'none';
    });
    
    // Disable drag and drop
    if (window.activeSortable) {
        window.activeSortable.option('disabled', true);
    }
    if (window.completedSortable) {
        window.completedSortable.option('disabled', true);
    }
    
    // Disable other buttons
    const otherButtons = document.querySelectorAll('#share-button, #back-to-personal-button, #completed-toggle');
    otherButtons.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
        }
    });
    
    // Add overlay
    showLoadingOverlay('Sorting...', 'Please wait');
};

// Re-enable all interactions after sorting
const enableAllInteractions = () => {
    // Re-enable task form
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.style.pointerEvents = '';
        ui.domElements.taskForm.style.opacity = '';
    }
    if (ui.domElements.taskInput) {
        ui.domElements.taskInput.disabled = false;
    }
    
    // Re-enable all task buttons and checkboxes
    const taskButtons = document.querySelectorAll('#active-task-list button, #completed-task-list button');
    taskButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
    });
    
    const checkboxes = document.querySelectorAll('#active-task-list input[type="checkbox"], #completed-task-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.disabled = false;
        cb.style.pointerEvents = '';
    });
    
    // Re-enable drag and drop
    if (window.activeSortable) {
        window.activeSortable.option('disabled', false);
    }
    if (window.completedSortable) {
        window.completedSortable.option('disabled', false);
    }
    
    // Re-enable other buttons
    const otherButtons = document.querySelectorAll('#share-button, #back-to-personal-button, #completed-toggle');
    otherButtons.forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    });
    
    // Remove overlay
    hideLoadingOverlay();
};

// Sort tasks programmatically by aisle assignment
const sortTasksByAisle = (tasks) => {
    if (!Array.isArray(tasks) || tasks.length === 0) return tasks || [];

    const parseAisleNumber = (aisle) => {
        if (aisle == null) return null;
        const s = String(aisle);
        // Prefer explicit "Aisle 18" pattern
        let m = s.match(/\baisle\s*(\d+)\b/i);
        if (m && m[1]) return Number(m[1]);
        // Fallback: first standalone number anywhere
        m = s.match(/\b(\d+)\b/);
        if (m && m[1]) return Number(m[1]);
        return null;
    };

    // Stable sort: decorate with original index
    const decorated = tasks.map((t, idx) => ({
        t,
        idx,
        aisle: (t?.aisle ?? '').toString(),
        aisleNum: parseAisleNumber(t?.aisle),
        aisleIndex: Number.isFinite(Number(t?.aisle_index)) ? Number(t.aisle_index) : 9999,
        text: (t?.task ?? '').toString()
    }));

    decorated.sort((a, b) => {
        const aHasNum = Number.isFinite(a.aisleNum);
        const bHasNum = Number.isFinite(b.aisleNum);
        if (aHasNum && bHasNum && a.aisleNum !== b.aisleNum) return a.aisleNum - b.aisleNum;
        if (aHasNum !== bHasNum) return aHasNum ? -1 : 1; // numbered aisles first
        if (a.aisleIndex !== b.aisleIndex) return a.aisleIndex - b.aisleIndex;
        const aisleCmp = a.aisle.localeCompare(b.aisle);
        if (aisleCmp !== 0) return aisleCmp;
        const textCmp = a.text.localeCompare(b.text);
        if (textCmp !== 0) return textCmp;
        return a.idx - b.idx;
    });

    return decorated.map(d => d.t);
};

// Handle AI sort button click
const handleAISortClick = async () => {
    const aiSortButton = document.getElementById('ai-sort-button');
    if (!aiSortButton) return;
    
    const loadingHTML = `
        <svg class="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Sorting...
    `;
    
    const originalText = utils.setButtonLoading(aiSortButton, loadingHTML);
    if (!originalText) return;
    
    // Disable all interactions
    disableAllInteractions();
    
    try {
        const allTasks = await storage.loadTasks();
        const sortInfo = getTasksToSort(allTasks);
        
        if (!sortInfo) {
            enableAllInteractions();
            utils.restoreButtonState(aiSortButton, originalText);
            return;
        }
        
        const { active: tasksToSort, completed: completedTasksToPreserve } = utils.separateTasks(sortInfo.tasks);
        
        if (tasksToSort.length === 0) {
            enableAllInteractions();
            utils.restoreButtonState(aiSortButton, originalText);
            return;
        }
        
        // Get selected store and fetch full store data if available
        const selectedStore = groceryStores.getSelectedGroceryStore();
        let storeData = null;
        if (selectedStore && selectedStore.id) {
            // Fetch fresh store data to ensure we have the latest aisle_layout
            try {
                const stores = await groceryStores.loadGroceryStores();
                const fullStore = stores.find(s => s.id === selectedStore.id);
                if (fullStore && fullStore.aisle_layout) {
                    storeData = {
                        id: fullStore.id,
                        name: fullStore.name,
                        aisle_layout: fullStore.aisle_layout
                    };
                }
            } catch (error) {
                console.error('Error loading store data for sorting:', error);
            }
        }
        
        // Call AI aisle assignment API (same endpoint), then sort programmatically
        const response = await fetch('/api/sort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tasks: tasksToSort,
                store: storeData
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Sort API error:', errorText);
            throw new Error(`Failed to sort tasks: ${response.status}`);
        }
        
        const { tasks: annotatedActiveTasks = tasksToSort } = await response.json();
        const sortedActiveTasks = sortTasksByAisle(annotatedActiveTasks);
        
        // Reload and update tasks
        const updatedTasks = await storage.loadTasks();
        
        if (sortInfo.parentId) {
            // Update subtasks - find parent again in updated tasks
            const parentResult = utils.findTaskById(updatedTasks, sortInfo.parentId);
            if (parentResult?.task) {
                parentResult.task.subtasks = [...sortedActiveTasks, ...completedTasksToPreserve];
                await storage.saveTasks(updatedTasks);
            } else {
                throw new Error('Parent task not found');
            }
        } else {
            // Update top-level tasks
            const allSubtasks = updatedTasks.filter(task => task.parentId);
            await storage.saveTasks([...sortedActiveTasks, ...completedTasksToPreserve, ...allSubtasks]);
        }
        
        await renderTasks();
    } catch (error) {
        console.error('Error sorting tasks:', error);
        alert('Failed to sort tasks. Please try again.');
    } finally {
        enableAllInteractions();
        utils.restoreButtonState(aiSortButton, originalText);
    }
};

// Import escapeHtml from utils
const escapeHtml = utils.escapeHtml;

// Handle Export button click
const handleExportClick = () => {
    const exportModal = document.getElementById('export-modal');
    if (exportModal) {
        exportModal.classList.remove('hidden');
    }
};

// Flatten tasks for display (recursive)
const flattenTasksForDisplay = (tasks, level = 0, parentPath = '', includeSubtasks = true) => {
    const result = [];
    tasks.forEach(task => {
        const indent = '  '.repeat(level);
        const path = parentPath ? `${parentPath} > ${task.task}` : task.task;
        result.push({
            task: task.task,
            completed: task.completed,
            level: level,
            indent: indent,
            path: path,
            subtasks: task.subtasks || []
        });
        
        // Add subtasks recursively only if includeSubtasks is true
        if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
            result.push(...flattenTasksForDisplay(task.subtasks, level + 1, path, includeSubtasks));
        }
    });
    return result;
};

// Export to PDF
const exportToPDF = (tasks, filename, includeSubtasks = true) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const flattened = flattenTasksForDisplay(tasks, 0, '', includeSubtasks);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 7;
    let y = margin;
    
    // Title
    doc.setFontSize(18);
    doc.text('Todo List', margin, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, margin, y);
    y += 10;
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    
    // Group by completion status
    const activeTasks = utils.filterTasks(flattened, { completed: false });
    const completedTasks = utils.filterTasks(flattened, { completed: true });
    
    // Active tasks
    if (activeTasks.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Active Tasks', margin, y);
        y += 8;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        activeTasks.forEach(task => {
            if (y > pageHeight - margin - 10) {
                doc.addPage();
                y = margin;
            }
            const text = `${task.indent}${task.task}`;
            doc.text(text, margin, y, { maxWidth: pageWidth - margin * 2 });
            y += lineHeight;
        });
        y += 5;
    }
    
    // Completed tasks
    if (completedTasks.length > 0) {
        if (y > pageHeight - margin - 15) {
            doc.addPage();
            y = margin;
        }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Completed Tasks', margin, y);
        y += 8;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        
        completedTasks.forEach(task => {
            if (y > pageHeight - margin - 10) {
                doc.addPage();
                y = margin;
            }
            const text = `${task.indent}✓ ${task.task}`;
            doc.text(text, margin, y, { maxWidth: pageWidth - margin * 2 });
            y += lineHeight;
        });
    }
    
    doc.save(filename);
};

// Export to Excel
const exportToExcel = (tasks, filename, includeSubtasks = true) => {
    const flattened = flattenTasksForDisplay(tasks, 0, '', includeSubtasks);
    
    // Create worksheet data
    const worksheetData = [
        ['Task', 'Status', 'Level']
    ];
    
    flattened.forEach(task => {
        worksheetData.push([
            task.task,
            task.completed ? 'Completed' : 'Active',
            task.level
        ]);
    });
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 50 }, // Task column
        { wch: 12 }, // Status column
        { wch: 8 }   // Level column
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Todo List');
    
    // Save file
    XLSX.writeFile(wb, filename);
};

// Handle Confirm Export
const handleConfirmExport = async () => {
    const exportModal = document.getElementById('export-modal');
    const exportOption = document.querySelector('input[name="export-option"]:checked')?.value || 'all';
    const exportFormat = document.querySelector('input[name="export-format"]:checked')?.value || 'json';
    const includeCompleted = document.querySelector('input[name="export-completed"]:checked')?.value || 'include';
    
    try {
        const allTasks = await storage.loadTasks();
        let tasksToExport = [];
        
        if (exportOption === 'current') {
            // Export only current view
            // Use the same logic as getTasksToSort to ensure consistency
            if (currentFocusedTaskId) {
                // Focus mode: use subtasks of focused task
                const result = utils.findTaskById(allTasks, currentFocusedTaskId);
                if (result?.task) {
                    tasksToExport = result.task.subtasks || [];
                }
            } else {
                // Normal mode: get tasks from current view context
                const context = utils.getCurrentViewContext(allTasks, currentFocusedTaskId, utils.findTaskById);
                if (context) {
                    tasksToExport = context.tasks;
                } else {
                    tasksToExport = [];
                }
            }
        } else {
            // Export everything
            tasksToExport = allTasks;
        }
        
        // Filter out completed tasks if requested
        if (includeCompleted === 'exclude') {
            tasksToExport = utils.filterTasks(tasksToExport, { completed: false });
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        
        // Determine if we should include nested subtasks
        // For "Current View Only", don't include nested subtasks - only export what's visible
        const includeSubtasks = exportOption === 'all';
        
        // Export based on format
        if (exportFormat === 'pdf') {
            exportToPDF(tasksToExport, `todo-list-${dateStr}.pdf`, includeSubtasks);
        } else if (exportFormat === 'excel') {
            exportToExcel(tasksToExport, `todo-list-${dateStr}.xlsx`, includeSubtasks);
        } else {
            // JSON export
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                tasks: tasksToExport
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `todo-list-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Close modal
        if (exportModal) {
            exportModal.classList.add('hidden');
            // Re-enable body scroll
            document.body.style.overflow = '';
        }
    } catch (error) {
        console.error('Error exporting:', error);
        alert('Failed to export list: ' + error.message);
    }
};

// Handle Import File
const handleImportFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const importModal = document.getElementById('import-modal');
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (!importData.tasks || !Array.isArray(importData.tasks)) {
            throw new Error('Invalid file format. Expected a JSON file with a "tasks" array.');
        }
        
        // Close modal if open
        if (importModal) {
            importModal.classList.add('hidden');
        }
        
        // Confirm import
        const confirmed = confirm(
            `This will import ${importData.tasks.length} task(s). ` +
            `Do you want to merge with your current list or replace it?\n\n` +
            `Click OK to merge, Cancel to replace.`
        );
        
        const currentTasks = await storage.loadTasks();
        let finalTasks = [];
        
        if (confirmed) {
            // Merge: combine current tasks with imported tasks
            // Remove duplicates by ID, keeping current tasks if they exist
            const existingIds = new Set(currentTasks.map(t => t.id));
            const newTasks = importData.tasks.filter(t => !existingIds.has(t.id));
            finalTasks = [...currentTasks, ...newTasks];
        } else {
            // Replace: use imported tasks only
            finalTasks = importData.tasks;
        }
        
        // Save imported tasks
        await storage.saveTasks(finalTasks);
        
        // Re-render
        await renderTasks();
        
        alert(`Successfully imported ${importData.tasks.length} task(s)!`);
        
        // Reset file input
        event.target.value = '';
    } catch (error) {
        console.error('Error importing:', error);
        alert('Failed to import list: ' + error.message);
        event.target.value = '';
    }
};

// Handle Import from URL
const handleImportFromUrl = async () => {
    const importUrlInput = utils.$('import-url-input');
    const confirmImportUrlButton = utils.$('confirm-import-url');
    const cancelImportButton = utils.$('cancel-import');
    const importModal = utils.$('import-modal');
    
    const url = importUrlInput?.value.trim();
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    
    // Validate URL format
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL');
        return;
    }
    
    // Show overlay for AI processing
    showLoadingOverlay('Fetching URL and extracting items with AI...', 'Please wait');
    
    // Disable button and inputs during import
    const originalText = confirmImportUrlButton.innerHTML;
    utils.setButtonLoading(confirmImportUrlButton, 'Importing...');
    confirmImportUrlButton.disabled = true;
    
    if (cancelImportButton) {
        cancelImportButton.disabled = true;
    }
    if (importUrlInput) {
        importUrlInput.disabled = true;
    }
    
    try {
        // Call API to fetch URL and extract items
        const response = await utils.apiFetch('/api/import-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to import from URL');
        }
        
        const data = await response.json();
        
        if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
            throw new Error('No items could be extracted from the URL');
        }
        
        // Close modal
        if (importModal) {
            importModal.classList.add('hidden');
        }
        
        // Get current tasks
        const currentTasks = await storage.loadTasks();
        
        // Create a parent task with title from URL
        const parentTaskTitle = data.title || 'Imported List';
        const parentTaskId = utils.generateUUID();
        
        // Create subtasks from extracted items
        const subtasks = data.items.map(item => ({
            id: utils.generateUUID(),
            task: item,
            completed: false,
            sticky: false,
            subtasks: [],
            parentId: parentTaskId,
            created: new Date().toISOString()
        }));
        
        // Create parent task with all subtasks
        const parentTask = {
            id: parentTaskId,
            task: parentTaskTitle,
            completed: false,
            sticky: false,
            subtasks: subtasks,
            created: new Date().toISOString()
        };
        
        // Check if we're in a focused sublist (viewing subtasks of a specific task)
        if (currentFocusedTaskId) {
            // Find the focused task and add the imported task as a subtask
            const focusedResult = utils.findTaskById(currentTasks, currentFocusedTaskId);
            if (focusedResult && focusedResult.task) {
                const focusedTask = focusedResult.task;
                
                // Set parentId for the imported task
                parentTask.parentId = currentFocusedTaskId;
                
                // Initialize subtasks array if it doesn't exist
                if (!focusedTask.subtasks) {
                    focusedTask.subtasks = [];
                }
                
                // Add to beginning of active subtasks (top of list)
                const firstActiveIndex = focusedTask.subtasks.findIndex(st => !st.completed);
                if (firstActiveIndex === -1) {
                    focusedTask.subtasks.unshift(parentTask);
                } else {
                    focusedTask.subtasks.splice(firstActiveIndex, 0, parentTask);
                }
            } else {
                // Fallback: add to root if focused task not found
                const firstActiveIndex = currentTasks.findIndex(t => !t.completed);
                if (firstActiveIndex === -1) {
                    currentTasks.unshift(parentTask);
                } else {
                    currentTasks.splice(firstActiveIndex, 0, parentTask);
                }
            }
        } else {
            // Not in focused mode - add to root level
            const firstActiveIndex = currentTasks.findIndex(t => !t.completed);
            if (firstActiveIndex === -1) {
                currentTasks.unshift(parentTask);
            } else {
                currentTasks.splice(firstActiveIndex, 0, parentTask);
            }
        }
        
        // Save tasks
        await storage.saveTasks(currentTasks);
        
        // Re-render
        await renderTasks();
        
        alert(`Successfully imported ${data.items.length} item(s) from URL as subtasks!`);
        
        // Reset URL input
        if (importUrlInput) {
            importUrlInput.value = '';
        }
    } catch (error) {
        console.error('Error importing from URL:', error);
        alert('Failed to import from URL: ' + error.message);
    } finally {
        // Hide overlay
        hideLoadingOverlay();
        
        // Restore button state
        utils.restoreButtonState(confirmImportUrlButton, originalText);
        if (confirmImportUrlButton) {
            confirmImportUrlButton.disabled = false;
        }
        
        // Re-enable cancel button and URL input
        if (cancelImportButton) {
            cancelImportButton.disabled = false;
        }
        if (importUrlInput) {
            importUrlInput.disabled = false;
        }
    }
};

// Handle share button click
const handleShareButtonClick = async () => {
    if (storage.getIsSharedList()) {
        // Already a shared list, just show the current URL
        ui.domElements.shareUrlInput.value = window.location.href;
        ui.domElements.shareUrlContainer.classList.remove('hidden');
        // Hide the share button
        ui.domElements.shareButton.classList.add('hidden');
        
        // Automatically copy to clipboard
        ui.domElements.shareUrlInput.select();
        document.execCommand('copy');
        
        // Show copied notification
        showCopiedNotification();
    } else {
        try {
            ui.domElements.shareButton.disabled = true;
            ui.domElements.shareButton.textContent = 'Creating share link...';
            
            // First, get the current tasks regardless of whether we have an existing shared list
            const currentDate = storage.getActiveDate();
            const allTasks = await storage.loadTasks();
            let shareId;
            
            // Check if we already have a shared list for this date
            const existingList = storage.getOwnedListByDate(currentDate);
            
            if (existingList && existingList.id) {
                // Reuse the existing shared list ID
                shareId = existingList.id;
                
                // Update the existing shared list with current tasks and focus
                await storage.updateSharedList(shareId, allTasks, currentFocusedTaskId);
            } else {
                // Create a new shared list if none exists for this date
                shareId = await storage.createSharedList(allTasks, currentFocusedTaskId);
            }
            
            // Remember which date this shared list belongs to
            storage.addOwnedList(shareId, currentDate);

            // Generate share URL
            let shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
            
            // Display share URL
            ui.domElements.shareUrlInput.value = shareUrl;
            ui.domElements.shareUrlContainer.classList.remove('hidden');
            
            // Update UI and hide the share button
            ui.domElements.shareButton.classList.add('hidden');
            ui.domElements.shareButton.textContent = 'Share List';
            ui.domElements.shareButton.disabled = false;
            
            // Automatically copy to clipboard
            ui.domElements.shareUrlInput.select();
            document.execCommand('copy');
            
            // Show copied notification
            showCopiedNotification();
            
            // Update URL without refreshing
            window.history.pushState({}, '', shareUrl);
            
            // Update app state
            storage.setupSharing(shareId);
            ui.setupSharedUI(true);
            // Start listening for updates without requiring a page reload
            storage.connectToUpdates(shareId, (updatedData) => {
                renderTasks();
            });
        } catch (error) {
            console.error('Error sharing list:', error);
            alert('Failed to create share link. Please try again.');
            ui.domElements.shareButton.textContent = 'Share List';
            ui.domElements.shareButton.disabled = false;
        }
    }
};

// Jump to a specific breadcrumb level
const jumpToBreadcrumb = async (index) => {
    if (index === 'root') {
        // If we're viewing a shared list, going to the root should
        // return to the personal list.
        if (storage.getIsSharedList()) {
            // DIRECT FIX FOR ALL TASKS BUTTON
            // Save subscription directly using our new approach
            const currentShareId = storage.getShareId();
            if (currentShareId) {
                try {
                    
                    // Get current list title
                    const allTasks = await storage.loadTasks();
                    let listTitle = 'Shared List';
                    if (allTasks.length > 0) {
                        listTitle = allTasks[0].task;
                    }
                    if (window.location.href.includes('groceries')) {
                        listTitle = 'Groceries';
                    }
                    
                    // Only add to subscriptions if we don't already own this list
                    if (!storage.isOwnedList(currentShareId)) {
                        // Save directly to localStorage
                        localStorage.setItem('todo_force_subscription', JSON.stringify({
                            id: currentShareId,
                            title: listTitle,
                            url: window.location.href,
                            timestamp: Date.now()
                        }));
                    } else {
                    }
                } catch (err) {
                }
            }
            
            // Navigate away
            storage.disconnectUpdates();
            const url = new URL(window.location.href);
            url.searchParams.delete('share');
            url.searchParams.set('refreshLists', 'true');
            window.location.href = url.href;
            return;
        }

        // Otherwise, go back to the root level of the current list
        taskNavigationStack = [];
        currentFocusedTaskId = null;
        ui.domElements.taskBreadcrumb.classList.add('hidden');
        ui.domElements.focusTitle.textContent = '';
        
        // Reset the page title back to default
        document.title = 'Todo';
        
        renderTasks();
        return;
    }
    
    // Handle numeric indexes
    const numIndex = parseInt(index, 10);
    
    if (numIndex >= 0 && numIndex < taskNavigationStack.length) {
        // Go to the specified level
        const newStack = taskNavigationStack.slice(0, numIndex + 1);
        const lastItem = newStack[newStack.length - 1];
        
        taskNavigationStack = newStack;
        currentFocusedTaskId = lastItem.id;

        updateBreadcrumbTrail();
        renderTasks();
    }
};

// Focus on a specific task and its subtasks
const focusOnTask = (taskId, taskTitle) => {
    // Allow focusing on any task, even if it doesn't have subtasks yet
    storage.loadTasks().then(tasks => {
        const result = utils.findTaskById(tasks, taskId);
        
        if (result && result.task) {
            if (currentFocusedTaskId === taskId) {
                // Already focused on this task, do nothing
                return;
            }
            
            // Check if this task is already anywhere in the navigation stack
            // This prevents circular navigation (e.g., clicking into the same task multiple times)
            if (taskNavigationStack.some(item => item.id === taskId)) {
                // Task is already in the navigation path, do nothing
                return;
            }
            
            // Initialize subtasks array if it doesn't exist
            if (!result.task.subtasks) {
                result.task.subtasks = [];
                // Save the updated task with the empty subtasks array
                storage.saveTasks(tasks);
            }
            
            // Add to navigation stack
            taskNavigationStack.push({
                id: taskId,
                title: taskTitle
            });

            currentFocusedTaskId = taskId;
            ui.domElements.taskBreadcrumb.classList.remove('hidden');

            // Update the page title and focus title to show the focused task
            document.title = `${taskTitle} - Todo`;
            ui.domElements.focusTitle.textContent = taskTitle;
            
            // Save the focus ID for shared lists
            if (storage.getIsSharedList()) {
                storage.saveTasks(tasks, taskId);
            }
            
            updateBreadcrumbTrail();
            renderTasks();
        }
    });
};

// Update the breadcrumb trail
const updateBreadcrumbTrail = () => {
    ui.updateBreadcrumbTrail(taskNavigationStack, jumpToBreadcrumb);
};

// Promote a task up one level
const promoteTask = async (taskId) => {
    await tasks.promoteTask(taskId);
    await renderTasks();
};

// Clear all completed tasks
const handleClearCompleted = async () => {
    const confirmed = confirm('Are you sure you want to clear all completed tasks? This cannot be undone.');
    if (!confirmed) return;
    
    const allTasks = await storage.loadTasks();
    
    // Recursive function to remove completed tasks from a task array
    const removeCompletedTasks = (taskArray) => {
        return taskArray.filter(task => {
            // If task is completed, exclude it
            if (task.completed) {
                return false;
            }
            
            // If task has subtasks, recursively clean them
            if (task.subtasks && task.subtasks.length > 0) {
                task.subtasks = removeCompletedTasks(task.subtasks);
            }
            
            return true;
        });
    };
    
    // Remove all completed tasks (both top-level and nested)
    const cleanedTasks = removeCompletedTasks(allTasks);
    
    // Save the cleaned tasks
    await storage.saveTasks(cleanedTasks);
    
    // Re-render
    await renderTasks();
};

// Render all tasks
const renderTasks = async () => {
    // Load tasks
    const allTasks = await storage.loadTasks();
    
    // Clear existing task containers
    ui.domElements.activeTaskList.innerHTML = '';
    ui.domElements.completedTaskList.innerHTML = '';
    
    // Destroy previous Sortable instances if they exist
    if (window.activeSortable) {
        window.activeSortable.destroy();
        window.activeSortable = null;
    }
    if (window.completedSortable) {
        window.completedSortable.destroy();
        window.completedSortable = null;
    }
    
    let activeTasks = 0;
    let completedTasks = 0;
    
    if (currentFocusedTaskId) {
        // Focus mode: show only the focused task's subtasks
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        
        if (result) {
            const { task } = result;
            
            // Get all subtasks (or initialize empty array)
            const subtasks = task.subtasks || [];
            const activeSubtasks = subtasks.filter(st => !st.completed);
            const completedSubtasks = subtasks.filter(st => st.completed);
            
            // Add active subtasks
            activeSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask,
                    0,
                    handleToggleCompletion,
                    handleDeleteTask,
                    handleToggleSticky,
                    focusOnTask
                );
                ui.domElements.activeTaskList.appendChild(subtaskElement);
            });
            
            // Add completed subtasks
            completedSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask,
                    0,
                    handleToggleCompletion,
                    handleDeleteTask,
                    handleToggleSticky,
                    focusOnTask
                );
                ui.domElements.completedTaskList.appendChild(subtaskElement);
            });
            
            // Count subtasks
            activeTasks = activeSubtasks.length;
            completedTasks = completedSubtasks.length;
        } else {
            // Task not found, revert to all tasks view
            currentFocusedTaskId = null;
            ui.domElements.taskBreadcrumb.classList.add('hidden');
            ui.domElements.focusTitle.textContent = '';
            taskNavigationStack = [];
            
            // Re-render all tasks
            return renderTasks();
        }
    } else {
        // Normal mode: show all top-level tasks
        // Filter top-level tasks only
        const allTopLevelTasks = utils.filterTasks(allTasks, { parentId: false });
        const activeTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: false });
        const completedTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: true });
        
        // Add active tasks
        activeTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task,
                0,
                handleToggleCompletion,
                handleDeleteTask,
                handleToggleSticky,
                focusOnTask,
                false
            );
            ui.domElements.activeTaskList.appendChild(taskElement);
        });
        
        // Add completed tasks
        completedTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task,
                0,
                handleToggleCompletion,
                handleDeleteTask,
                handleToggleSticky,
                focusOnTask,
                false
            );
            ui.domElements.completedTaskList.appendChild(taskElement);
        });
        
        // Count tasks
        activeTasks = activeTopLevelTasks.length;
        completedTasks = completedTopLevelTasks.length;
    }
    
    // Update counts
    ui.domElements.taskCount.textContent = `${activeTasks} task${activeTasks !== 1 ? 's' : ''}`;
    ui.domElements.completedCount.textContent = `${completedTasks} task${completedTasks !== 1 ? 's' : ''}`;
    
    // Show/hide empty state
    ui.toggleEmptyState(activeTasks === 0 && !currentFocusedTaskId);
    
    // Show/hide completed section
    ui.toggleCompletedSection(completedTasks > 0);
    
    // Initialize Sortable for active tasks
    if (ui.domElements.activeTaskList.children.length > 0) {
        window.activeSortable = ui.initializeSortable(
            ui.domElements.activeTaskList, 
            handleActiveSortEnd
        );
    }
    
    // Initialize Sortable for completed tasks
    if (ui.domElements.completedTaskList.children.length > 0) {
        window.completedSortable = ui.initializeSortable(
            ui.domElements.completedTaskList,
            handleCompletedSortEnd
        );
    }
};


// Handle sorting of active tasks
const handleActiveSortEnd = async function(evt) {
    // Get ordered task IDs from the DOM
    const orderedIds = Array.from(ui.domElements.activeTaskList.children).map(el => el.dataset.id);
    const allTasks = await storage.loadTasks();
    
    if (currentFocusedTaskId) {
        // We're in focus mode, so we need to reorder the subtasks
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        if (result && result.task) {
            const { task } = result;
            const activeSubtasks = task.subtasks.filter(st => !st.completed);
            const completedSubtasks = task.subtasks.filter(st => st.completed);
            
            // Reorder active subtasks based on DOM order
            const reorderedSubtasks = [];
            orderedIds.forEach(id => {
                const subtask = activeSubtasks.find(st => st.id === id);
                if (subtask) reorderedSubtasks.push(subtask);
            });
            
            // Update task's subtasks array with new order
            task.subtasks = [...reorderedSubtasks, ...completedSubtasks];
            await storage.saveTasks(allTasks);
        }
    } else {
        // We're in normal mode, reorder top-level tasks
        const activeTopLevelTasks = utils.filterTasks(allTasks, { completed: false, parentId: false });
        const completedTopLevelTasks = utils.filterTasks(allTasks, { completed: true, parentId: false });
        const otherTasks = utils.filterTasks(allTasks, { parentId: true }); // Keep subtasks
        
        // Reorder active top-level tasks based on DOM order
        const reorderedTasks = [];
        orderedIds.forEach(id => {
            const task = activeTopLevelTasks.find(t => t.id === id);
            if (task) reorderedTasks.push(task);
        });
        
        // Save all tasks with the reordered active tasks
        await storage.saveTasks([...reorderedTasks, ...completedTopLevelTasks, ...otherTasks]);
    }
};

// Handle sorting of completed tasks
const handleCompletedSortEnd = async function(evt) {
    // Get ordered task IDs from the DOM
    const orderedIds = Array.from(ui.domElements.completedTaskList.children).map(el => el.dataset.id);
    const allTasks = await storage.loadTasks();
    
    if (currentFocusedTaskId) {
        // We're in focus mode, so we need to reorder the subtasks
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        if (result && result.task) {
            const { task } = result;
            const activeSubtasks = task.subtasks.filter(st => !st.completed);
            const completedSubtasks = task.subtasks.filter(st => st.completed);
            
            // Reorder completed subtasks based on DOM order
            const reorderedSubtasks = [];
            orderedIds.forEach(id => {
                const subtask = completedSubtasks.find(st => st.id === id);
                if (subtask) reorderedSubtasks.push(subtask);
            });
            
            // Update task's subtasks array with new order
            task.subtasks = [...activeSubtasks, ...reorderedSubtasks];
            await storage.saveTasks(allTasks);
        }
    } else {
        // We're in normal mode, reorder top-level tasks
        const activeTopLevelTasks = utils.filterTasks(allTasks, { completed: false, parentId: false });
        const completedTopLevelTasks = utils.filterTasks(allTasks, { completed: true, parentId: false });
        const otherTasks = utils.filterTasks(allTasks, { parentId: true }); // Keep subtasks
        
        // Reorder completed top-level tasks based on DOM order
        const reorderedTasks = [];
        orderedIds.forEach(id => {
            const task = completedTopLevelTasks.find(t => t.id === id);
            if (task) reorderedTasks.push(task);
        });
        
        // Save all tasks with the reordered completed tasks
        await storage.saveTasks([...activeTopLevelTasks, ...reorderedTasks, ...otherTasks]);
    }
};

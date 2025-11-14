/**
 * Main application module for the Todo app
 * Connects all the other modules and handles app initialization
 */
import * as utils from './utils.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as tasks from './tasks.js';

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
    setupEventListeners();
    
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
const setupEventListeners = () => {

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

    // Set up AI sort button
    const aiSortButton = document.getElementById('ai-sort-button');
    if (aiSortButton) {
        aiSortButton.addEventListener('click', handleAISortClick);
    }

    // Set up Get Recipe button
    const getRecipeButton = document.getElementById('get-recipe-button');
    if (getRecipeButton) {
        getRecipeButton.addEventListener('click', handleGetRecipeClick);
    }

    // Set up recipe modal close button
    const closeRecipeModal = document.getElementById('close-recipe-modal');
    const recipeModal = document.getElementById('recipe-modal');
    if (closeRecipeModal && recipeModal) {
        closeRecipeModal.addEventListener('click', () => {
            recipeModal.classList.add('hidden');
        });
    }
    
    // Set up Get Next Recipe button
    const getNextRecipeButton = document.getElementById('get-next-recipe-button');
    if (getNextRecipeButton) {
        getNextRecipeButton.addEventListener('click', async () => {
            await generateAndDisplayRecipe(null, false);
        });
    }

    // Set up completed tasks toggle
    if (ui.domElements.completedToggle) {
        ui.domElements.completedToggle.addEventListener('click', ui.toggleCompletedTasksList);
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
    if (currentFocusedTaskId) {
        // Focus mode: sort immediate subtasks of focused task
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        if (!result?.task) return null;
        return {
            tasks: result.task.subtasks || [],
            parentTask: result.task,
            parentId: currentFocusedTaskId
        };
    }
    
    // Check if we're viewing subtasks (all active tasks have parentId)
    const activeTopLevel = allTasks.filter(task => !task.completed && !task.parentId);
    const activeSubtasks = allTasks.filter(task => !task.completed && task.parentId);
    
    if (activeTopLevel.length === 0 && activeSubtasks.length > 0) {
        // Viewing subtasks - find their parent
        const firstTask = activeSubtasks[0];
        const parentResult = utils.findTaskById(allTasks, firstTask.parentId);
        if (parentResult?.task) {
            return {
                tasks: parentResult.task.subtasks || [],
                parentTask: parentResult.task,
                parentId: firstTask.parentId
            };
        }
    }
    
    // Default: sort top-level tasks
    return {
        tasks: allTasks.filter(task => !task.parentId),
        parentTask: null,
        parentId: null
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
    let overlay = document.getElementById('sorting-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sorting-overlay';
        overlay.className = 'fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl flex flex-col items-center">
                <svg class="animate-spin h-8 w-8 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p class="text-gray-700 dark:text-gray-200 font-medium">Sorting...</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Please wait</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
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
    const overlay = document.getElementById('sorting-overlay');
    if (overlay) {
        overlay.remove();
    }
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
        
        // Call AI sort API
        const response = await fetch('/api/sort', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: tasksToSort })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Sort API error:', errorText);
            throw new Error(`Failed to sort tasks: ${response.status}`);
        }
        
        const { tasks: sortedActiveTasks = tasksToSort } = await response.json();
        
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

// Get tasks for recipe generation (shared logic)
const getTasksForRecipe = async () => {
    const allTasks = await storage.loadTasks();
    let allTasksForRecipe = [];
    
    if (currentFocusedTaskId) {
        // Focus mode: use all subtasks (active and completed) of focused task
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        if (result?.task) {
            allTasksForRecipe = result.task.subtasks || [];
        }
    } else {
        // Normal mode: check if viewing subtasks or top-level tasks
        const activeTopLevel = allTasks.filter(task => !task.completed && !task.parentId);
        const activeSubtasks = allTasks.filter(task => !task.completed && task.parentId);
        
        if (activeTopLevel.length === 0 && activeSubtasks.length > 0) {
            // Viewing subtasks - get all subtasks (active and completed)
            allTasksForRecipe = allTasks.filter(task => task.parentId);
        } else {
            // Viewing top-level tasks - get all top-level tasks (active and completed)
            allTasksForRecipe = allTasks.filter(task => !task.parentId);
        }
    }
    
    return allTasksForRecipe;
};

// Generate and display recipe (shared logic)
const generateAndDisplayRecipe = async (buttonElement, showModal = true) => {
    const recipeModal = document.getElementById('recipe-modal');
    const recipeContent = document.getElementById('recipe-content');
    const recipeFooter = document.getElementById('recipe-footer');
    const getNextRecipeButton = document.getElementById('get-next-recipe-button');
    
    if (!recipeModal || !recipeContent) return;
    
    // Hide footer during loading
    if (recipeFooter) {
        recipeFooter.classList.add('hidden');
    }
    
    // Show loading state
    if (buttonElement) {
        const loadingHTML = `
            <svg class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
        `;
        buttonElement.disabled = true;
        buttonElement.style.opacity = '0.6';
        buttonElement.style.cursor = 'not-allowed';
        const originalHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = loadingHTML;
        
        try {
            // Get tasks for recipe
            const allTasksForRecipe = await getTasksForRecipe();
            
            if (allTasksForRecipe.length === 0) {
                alert('No ingredients found. Please add some items to your list.');
                return;
            }
            
            // Show loading in modal content
            recipeContent.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12">
                    <svg class="animate-spin h-12 w-12 text-purple-500 mb-4" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-gray-600 dark:text-gray-400">Generating recipe...</p>
                </div>
            `;
            
            if (showModal) {
                recipeModal.classList.remove('hidden');
            }
            
            // Call recipe API
            const response = await fetch('/api/recipe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: allTasksForRecipe })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Failed to generate recipe: ${response.status}`);
            }
            
            const recipe = await response.json();
            
            // Display recipe in modal
            displayRecipe(recipe);
            
            // Show footer after recipe is displayed
            if (recipeFooter) {
                recipeFooter.classList.remove('hidden');
            }
            
            if (showModal) {
                recipeModal.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error generating recipe:', error);
            recipeContent.innerHTML = `
                <div class="text-center py-12">
                    <p class="text-red-600 dark:text-red-400 mb-4">Failed to generate recipe</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(error.message)}</p>
                </div>
            `;
            // Don't show footer on error
            if (showModal) {
                recipeModal.classList.remove('hidden');
            }
        } finally {
            buttonElement.disabled = false;
            buttonElement.style.opacity = '';
            buttonElement.style.cursor = '';
            buttonElement.innerHTML = originalHTML;
        }
    } else {
        // For get next recipe button, use simpler loading
        if (getNextRecipeButton) {
            getNextRecipeButton.disabled = true;
            getNextRecipeButton.style.opacity = '0.6';
        }
        
        // Hide footer during loading
        if (recipeFooter) {
            recipeFooter.classList.add('hidden');
        }
        
        try {
            const allTasksForRecipe = await getTasksForRecipe();
            
            if (allTasksForRecipe.length === 0) {
                alert('No ingredients found. Please add some items to your list.');
                return;
            }
            
            recipeContent.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12">
                    <svg class="animate-spin h-12 w-12 text-purple-500 mb-4" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-gray-600 dark:text-gray-400">Generating next recipe...</p>
                </div>
            `;
            
            const response = await fetch('/api/recipe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: allTasksForRecipe })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Failed to generate recipe: ${response.status}`);
            }
            
            const recipe = await response.json();
            displayRecipe(recipe);
            
            // Show footer after recipe is displayed
            if (recipeFooter) {
                recipeFooter.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error generating recipe:', error);
            recipeContent.innerHTML = `
                <div class="text-center py-12">
                    <p class="text-red-600 dark:text-red-400 mb-4">Failed to generate recipe</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(error.message)}</p>
                </div>
            `;
            // Don't show footer on error
        } finally {
            if (getNextRecipeButton) {
                getNextRecipeButton.disabled = false;
                getNextRecipeButton.style.opacity = '';
            }
        }
    }
};

// Handle Get Recipe button click
const handleGetRecipeClick = async () => {
    const getRecipeButton = document.getElementById('get-recipe-button');
    await generateAndDisplayRecipe(getRecipeButton, true);
};

// Display recipe in modal
const displayRecipe = (recipe) => {
    const recipeContent = document.getElementById('recipe-content');
    if (!recipeContent) return;
    
    let html = `
        <div class="space-y-8">
            <div>
                <h3 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">${escapeHtml(recipe.title || 'Recipe')}</h3>
            </div>
            
            <div>
                <h4 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-300 dark:border-gray-600">Ingredients</h4>
                <ul class="space-y-2 text-gray-700 dark:text-gray-300">
    `;
    
    // Display ingredients
    if (Array.isArray(recipe.ingredients)) {
        recipe.ingredients.forEach(ingredient => {
            html += `<li class="flex items-start">
                <span class="mr-2 text-purple-500 dark:text-purple-400">•</span>
                <span class="text-base">${escapeHtml(ingredient)}</span>
            </li>`;
        });
    }
    
    // Display additional ingredients if any
    if (Array.isArray(recipe.additionalIngredients) && recipe.additionalIngredients.length > 0) {
        html += `</ul>
                <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">Additional Ingredients (Optional)</p>
                    <ul class="space-y-2 text-gray-600 dark:text-gray-400">`;
        recipe.additionalIngredients.forEach(ingredient => {
            html += `<li class="flex items-start">
                <span class="mr-2 text-gray-400 dark:text-gray-500">•</span>
                <span class="text-base">${escapeHtml(ingredient)}</span>
            </li>`;
        });
        html += `</ul></div>`;
    } else {
        html += `</ul>`;
    }
    
    html += `
            </div>
            
            <div>
                <h4 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-300 dark:border-gray-600">Instructions</h4>
                <ol class="space-y-4 text-gray-700 dark:text-gray-300">
    `;
    
    // Display instructions
    if (Array.isArray(recipe.instructions)) {
        recipe.instructions.forEach((instruction, index) => {
            html += `<li class="flex items-start">
                <span class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-semibold mr-3 mt-0.5">${index + 1}</span>
                <span class="text-base leading-relaxed">${escapeHtml(instruction)}</span>
            </li>`;
        });
    }
    
    html += `
                </ol>
            </div>
    `;
    
    // Display notes if available
    if (recipe.notes) {
        html += `
            <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
                <h4 class="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2 uppercase tracking-wide">Notes</h4>
                <p class="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">${escapeHtml(recipe.notes)}</p>
            </div>
        `;
    }
    
    html += `</div>`;
    
    recipeContent.innerHTML = html;
};

// Helper function to escape HTML
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        const allTopLevelTasks = allTasks.filter(task => !task.parentId);
        const activeTopLevelTasks = allTopLevelTasks.filter(task => !task.completed);
        const completedTopLevelTasks = allTopLevelTasks.filter(task => task.completed);
        
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
        const activeTopLevelTasks = allTasks.filter(t => !t.completed && !t.parentId);
        const completedTopLevelTasks = allTasks.filter(t => t.completed && !t.parentId);
        const otherTasks = allTasks.filter(t => t.parentId); // Keep subtasks
        
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
        const activeTopLevelTasks = allTasks.filter(t => !t.completed && !t.parentId);
        const completedTopLevelTasks = allTasks.filter(t => t.completed && !t.parentId);
        const otherTasks = allTasks.filter(t => t.parentId); // Keep subtasks
        
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

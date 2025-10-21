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
    
    // Check for a forced subscription from localStorage
    // This is a more direct approach to ensure subscriptions are applied
    if (!isSharedList) {
        try {
            // First check for our new forced subscription
            const forcedSubJson = localStorage.getItem('todo_force_subscription');
            if (forcedSubJson) {
                const forcedSub = JSON.parse(forcedSubJson);
                
                // Only use if it's recent (last 5 minutes)
                const isRecent = (Date.now() - forcedSub.timestamp) < 300000; // 5 minutes
                
                if (isRecent && forcedSub.id) {
                    console.log('Found forced subscription to apply:', forcedSub.id);
                    
                    // Add directly to the subscription list
                    const currentLists = storage.getSubscribedLists();
                    
                    // Only add if not already present
                    if (!currentLists.some(list => list.id === forcedSub.id)) {
                        currentLists.push({
                            id: forcedSub.id,
                            title: forcedSub.title || 'Shared List',
                            url: forcedSub.url || window.location.origin,
                            lastAccessed: new Date().toISOString()
                        });
                        
                        // Save the updated list
                        await storage.saveSubscribedLists(currentLists);
                        console.log('Applied forced subscription successfully');
                    } else {
                        console.log('Forced subscription already exists in list');
                    }
                }
                
                // Clear the forced subscription regardless of whether we used it
                localStorage.removeItem('todo_force_subscription');
            }
            
            // Also check the original pending subscription as a fallback
            const pendingSubJson = localStorage.getItem('todo_pending_subscription');
            if (pendingSubJson) {
                const pendingSub = JSON.parse(pendingSubJson);
                if ((Date.now() - pendingSub.timestamp) < 300000 && pendingSub.id) {
                    console.log('Found pending subscription to restore:', pendingSub.id);
                    await storage.subscribeToSharedList(
                        pendingSub.id,
                        pendingSub.title || 'Shared List',
                        pendingSub.url || window.location.origin
                    );
                }
                localStorage.removeItem('todo_pending_subscription');
            }
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
            console.log(`Loaded ${subscribedLists.length} subscribed lists`);  
            
            // Check for any invalid lists and remove them
            Promise.all(subscribedLists.map(async (list) => {
                try {
                    // Using GET instead of HEAD as the server doesn't support HEAD requests
                    const response = await fetch(`/api/lists/${list.id}?t=${Date.now()}`, { 
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-store'
                    });
                    return response.ok ? list : null;
                } catch (err) {
                    console.error(`Error checking list ${list.id}:`, err);
                    return null;
                }
            }))
            .then(async validatedLists => {
                // Filter out null results (invalid lists)
                const validLists = validatedLists.filter(list => list !== null);
                
                // If we removed any lists, update storage
                if (validLists.length < subscribedLists.length) {
                    console.log(`Removed ${subscribedLists.length - validLists.length} invalid lists`);
                    await storage.saveSubscribedLists(validLists);
                }
                
                // Update UI with valid lists
                if (validLists.length > 0 || shouldRefreshLists) {
                    ui.addSubscribedListsUI(validLists, handleSubscribedListClick);
                }
            });
        } else if (shouldRefreshLists) {
            // If we have no lists but are coming back from a shared view,
            // try loading lists again to catch any recent subscriptions
            console.log('No subscribed lists found but refreshLists is true - checking again');
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
        console.log('Connecting to real-time updates for share ID:', shareId);
        
        storage.connectToUpdates(shareId, (updatedData) => {
            if (updatedData.tasks) {
                // Update the tasks in storage
                storage.updateTasks(updatedData.tasks);
                
                // Re-render the tasks using our app's render function
                renderTasks();
                
                // Show notification about the update
                ui.showUpdatedNotification();
                
                if (updatedData.focusId) {
                    // Just update the focused task ID
                    currentFocusedTaskId = updatedData.focusId;
                    // Update UI if needed with the focused task
                    if (ui.domElements.focusTitle && updatedData.tasks) {
                        const focusedTask = updatedData.tasks.find(t => t.id === updatedData.focusId);
                        if (focusedTask) {
                            ui.domElements.focusTitle.textContent = focusedTask.task;
                        }
                    }
                }
            }
        });
    } else {
        // Connect to updates for owned lists when in personal view
        storage.connectToOwnedListsUpdates((updatedData) => {
            if (updatedData.tasks) {
                // Use the local renderTasks function instead of ui.renderTasks
                renderTasks();
                ui.showUpdatedNotification();
                
                if (updatedData.focusId) {
                    // Just update the focused task ID
                    currentFocusedTaskId = updatedData.focusId;
                    // Update UI if needed with the focused task
                    if (ui.domElements.focusTitle && updatedData.tasks) {
                        const focusedTask = updatedData.tasks.find(t => t.id === updatedData.focusId);
                        if (focusedTask) {
                            ui.domElements.focusTitle.textContent = focusedTask.task;
                        }
                    }
                }
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
    
    console.log('Starting auto-subscription process for shared list:', shareId);
    
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
        
        console.log('Auto-subscription complete, lists:', updatedLists.length);
        
        // Verify subscription was added
        const hasSubscription = updatedLists.some(list => list.id === shareId);
        if (hasSubscription) {
            console.log('Verified subscription exists in list');
        } else {
            console.error('Subscription was not added to the list!');
        }
        
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
                
                console.log('Saved forced subscription to localStorage');
                
                // Try saving through the normal API as well
                const currentLists = storage.getSubscribedLists();
                
                // Check if already in the list
                if (!currentLists.some(list => list.id === currentShareId)) {
                    console.log('Adding subscription to current list');
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
    
    // Date navigation
    if (ui.domElements.prevDayButton) {
        ui.domElements.prevDayButton.addEventListener('click', () => {
            const currentDate = storage.getActiveDate();
            const newDate = utils.getPreviousDay(currentDate);
            switchToDate(newDate);
        });
    }

    if (ui.domElements.nextDayButton) {
        ui.domElements.nextDayButton.addEventListener('click', () => {
            const currentDate = storage.getActiveDate();
            const newDate = utils.getNextDay(currentDate);
            switchToDate(newDate);
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
                console.log('Reusing existing shared list ID:', existingList.id);
                shareId = existingList.id;
                
                // Update the existing shared list with current tasks and focus
                await storage.updateSharedList(shareId, allTasks, currentFocusedTaskId);
            } else {
                // Create a new shared list if none exists for this date
                console.log('Creating new shared list for date:', currentDate);
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
                console.log('Real-time update received for shared list:', shareId);
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

// Switch to a different date
const switchToDate = async (newDate) => {
    storage.setActiveDate(newDate);
    await storage.initializeStorage();
    
    ui.domElements.currentDateDisplay.textContent = newDate === utils.getCurrentDate() 
        ? 'Today' 
        : utils.formatDateForDisplay(newDate);
    
    taskNavigationStack = [];
    currentFocusedTaskId = null;
    ui.domElements.taskBreadcrumb.classList.add('hidden');

    await renderTasks();
};

// Jump to a specific breadcrumb level
const jumpToBreadcrumb = async (index) => {
    if (index === 'root') {
        // If we're viewing a shared list, going to the root should
        // return to the personal list which shows the date navigation.
        if (storage.getIsSharedList()) {
            // DIRECT FIX FOR ALL TASKS BUTTON
            // Save subscription directly using our new approach
            const currentShareId = storage.getShareId();
            if (currentShareId) {
                try {
                    console.log('All Tasks: Direct subscription save for:', currentShareId);
                    
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
                        console.log('All Tasks: Saved forced subscription to localStorage');
                    } else {
                        console.log('All Tasks: Skipping subscription for owned list:', currentShareId);
                    }
                } catch (err) {
                    console.error('All Tasks: Error saving subscription:', err);
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
    ui.domElements.completedCount.textContent = `${completedTasks} completed`;
    
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

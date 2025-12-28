/**
 * Main application module for the Todo app
 * Connects all the other modules and handles app initialization
 */
import * as utils from './utils.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as tasks from './tasks.js';
import * as groceryStores from './grocery-stores.js';
import * as sorting from './sorting.js';
import * as importExport from './import-export.js';
import * as focusMode from './focus-mode.js';

// Drag state
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
    
    const stores = await groceryStores.loadGroceryStores();
    const selectedStore = groceryStores.getSelectedGroceryStore();
    
    select.innerHTML = '<option value="">Auto</option>';
    
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        const displayName = store.name.split('\n')[0];
        option.textContent = displayName;
        if (selectedStore && selectedStore.id === store.id) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
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
    const { isSharedList, shareId } = storage.initializeStorageState();

    const urlParams = new URLSearchParams(window.location.search);
    const shouldRefreshLists = urlParams.has('refreshLists');
    
    if (shouldRefreshLists) {
        urlParams.delete('refreshLists');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, document.title, newUrl);
    }

    await storage.initializeStorage();
    await storage.loadUserLists();

    const isOwner = isSharedList && storage.isOwnedList(shareId);
    ui.setupSharedUI(isOwner);
    
    await setupEventListeners();
    
    // Process subscriptions from localStorage
    if (!isSharedList) {
        try {
            const processSubscription = async (key) => {
                const subJson = localStorage.getItem(key);
                if (!subJson) return false;
                
                const sub = JSON.parse(subJson);
                const isRecent = (Date.now() - sub.timestamp) < 300000;
                
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
        await storage.loadUserLists();
        const subscribedLists = storage.getSubscribedLists();
        
        if (subscribedLists.length > 0) {
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
    
    await renderTasks();

    // Set up real-time updates
    if (isSharedList) {
        const shareId = window.location.search.split('share=')[1]?.split('&')[0];
        
        storage.connectToUpdates(shareId, (updatedData) => {
            if (updatedData.tasks) {
                storage.updateTasks(updatedData.tasks);
                renderTasks();
                ui.showUpdatedNotification();
            }
        });
    } else {
        storage.connectToOwnedListsUpdates((updatedData) => {
            if (updatedData.tasks) {
                renderTasks();
                ui.showUpdatedNotification();
            }
        });
    }

    // Auto focus on shared list's saved focus task
    const jumpHandler = focusMode.createJumpToBreadcrumbHandler(renderTasks);
    await focusMode.initializeFocusFromSharedList(renderTasks, jumpHandler);
};

// Handle clicking on a subscribed shared list
const handleSubscribedListClick = async (list) => {
    try {
        const response = await fetch(`/api/lists/${list.id}`, { method: 'GET' });
        if (!response.ok) {
            alert(`This shared list no longer exists and will be removed from your subscriptions.`);
            storage.unsubscribeFromSharedList(list.id);
            const updatedLists = storage.getSubscribedLists();
            ui.addSubscribedListsUI(updatedLists, handleSubscribedListClick);
            return;
        }
    } catch (err) {
        console.error('Error checking list:', err);
    }
    window.location.href = list.url;
};

// Automatically subscribe to a shared list when visiting via share link
const autoSubscribeSharedList = async (shareId) => {
    if (!shareId) return;
    
    try {
        const allTasks = await storage.loadTasks();
        let listTitle = 'Shared List';
        const firstActiveTask = allTasks.find(task => !task.completed);
        if (firstActiveTask) {
            listTitle = firstActiveTask.task;
        } else if (allTasks.length > 0) {
            listTitle = allTasks[0].task;
        }
        
        if (listTitle === 'Shared List' && window.location.href.includes('groceries')) {
            listTitle = 'Groceries';
        }
        
        const shareUrl = window.location.href;
        const updatedLists = await storage.subscribeToSharedList(shareId, listTitle, shareUrl);
        return updatedLists;
    } catch (err) {
        console.error('Error during auto-subscription:', err);
        return null;
    }
};

// Show notification when URL is copied
window.showCopiedNotification = () => {
    const existingNotification = document.getElementById('copied-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'copied-notification';
    notification.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
    notification.innerHTML = `
        <svg class="h-5 w-5 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>Share URL copied to clipboard</span>
    `;
    
    document.body.appendChild(notification);
    
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
        
        if (!storage.isOwnedList(currentShareId)) {
            try {
                const allTasks = await storage.loadTasks();
                let listTitle = 'Shared List';
                if (allTasks.length > 0) {
                    listTitle = allTasks[0].task;
                }
                if (window.location.href.includes('groceries')) {
                    listTitle = 'Groceries';
                }
                
                localStorage.setItem('todo_force_subscription', JSON.stringify({
                    id: currentShareId,
                    title: listTitle,
                    url: window.location.href,
                    timestamp: Date.now()
                }));
                
                const currentLists = storage.getSubscribedLists();
                if (!currentLists.some(list => list.id === currentShareId)) {
                    currentLists.push({
                        id: currentShareId,
                        title: listTitle,
                        url: window.location.href,
                        lastAccessed: new Date().toISOString()
                    });
                    await storage.saveSubscribedLists(currentLists);
                }
            } catch (err) {
                console.error('Error saving subscription before navigation:', err);
            }
        }
    }
    
    storage.disconnectUpdates();
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    url.searchParams.set('refreshLists', 'true');
    window.location.href = url.href;
};

// Handle deleting a shared list (owner only)
const handleDeleteSharedList = async () => {
    if (!storage.getIsSharedList() || !storage.isOwnedList(storage.getShareId())) {
        return;
    }
    
    const confirmDelete = confirm('Are you sure you want to delete this shared list? This will remove it for all users who have subscribed to it.');
    if (!confirmDelete) return;
    
    const shareId = storage.getShareId();
    const success = await storage.deleteSharedList(shareId);
    
    if (success) {
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
    const jumpHandler = focusMode.createJumpToBreadcrumbHandler(renderTasks);
    const focusHandler = focusMode.createFocusOnTaskHandler(renderTasks, jumpHandler);

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
                await tasks.addTask(taskText, focusMode.getCurrentFocusedTaskId());
            await renderTasks();
            ui.domElements.taskInput.value = '';
            ui.domElements.taskInput.focus();
        }
        });
    }
    
    // Root breadcrumb navigation
    const rootBreadcrumb = document.querySelector('.breadcrumb-trail button[data-level="root"]');
    if (rootBreadcrumb) {
        rootBreadcrumb.addEventListener('click', () => jumpHandler('root'));
    }
    
    // Delete shared list button (for owners)
    const deleteListButton = document.getElementById('delete-list-button');
    if (deleteListButton) {
        deleteListButton.addEventListener('click', handleDeleteSharedList);
    }
    
    // Share button
    ui.setupShareButton(() => handleShareButtonClick(focusHandler));
    
    // Export button
    const exportButton = document.getElementById('export-button');
    if (exportButton) {
        exportButton.addEventListener('click', importExport.handleExportClick);
    }
    
    // Import button and modal
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
            const confirmBtn = utils.$('confirm-import-url');
            if (!confirmBtn || !confirmBtn.disabled) {
                importModal.classList.add('hidden');
                importUrlInput.value = '';
            }
        });
    }
    
    if (importFileButton && importFileInput) {
        importFileButton.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (e) => importExport.handleImportFile(e, renderTasks));
    }
    
    if (confirmImportUrlButton && importUrlInput) {
        const handleImport = () => importExport.handleImportFromUrl(focusMode.getCurrentFocusedTaskId(), renderTasks);
        confirmImportUrlButton.addEventListener('click', handleImport);
        importUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleImport();
        });
    }
    
    // Export modal
    const exportModal = document.getElementById('export-modal');
    const cancelExportButton = document.getElementById('cancel-export');
    const confirmExportButton = document.getElementById('confirm-export');
    if (exportModal && cancelExportButton && confirmExportButton) {
        cancelExportButton.addEventListener('click', () => exportModal.classList.add('hidden'));
        confirmExportButton.addEventListener('click', () => importExport.handleConfirmExport(focusMode.getCurrentFocusedTaskId()));
    }

    // AI sort button
    const aiSortButton = document.getElementById('ai-sort-button');
    if (aiSortButton) {
        aiSortButton.addEventListener('click', () => sorting.handleAISortClick(focusMode.getCurrentFocusedTaskId(), renderTasks));
    }

    // Location badge toggle (default off)
    const SHOW_LOCATIONS_KEY = 'todo_show_locations';
    const showLocationsToggle = document.getElementById('show-locations-toggle');
    const initialShowLocations = localStorage.getItem(SHOW_LOCATIONS_KEY) === '1';
    ui.setShowLocations(initialShowLocations);
    if (showLocationsToggle) {
        showLocationsToggle.checked = initialShowLocations;
        showLocationsToggle.addEventListener('change', async (e) => {
            const enabled = !!e.target.checked;
            localStorage.setItem(SHOW_LOCATIONS_KEY, enabled ? '1' : '0');
            ui.setShowLocations(enabled);
            await renderTasks();
        });
    }

    // Grocery store dropdown
    await initializeGroceryStoreDropdown();
    
    // Completed tasks toggle
    if (ui.domElements.completedToggle) {
        ui.domElements.completedToggle.addEventListener('click', ui.toggleCompletedTasksList);
    }
    
    // Clear Completed button
    const clearCompletedButton = document.getElementById('clear-completed-button');
    if (clearCompletedButton) {
        clearCompletedButton.addEventListener('click', handleClearCompleted);
    }

    // Drag and drop on breadcrumb for task promotion
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
const handleShareButtonClick = async (focusHandler) => {
    const currentFocusedTaskId = focusMode.getCurrentFocusedTaskId();
    
    if (storage.getIsSharedList()) {
        ui.domElements.shareUrlInput.value = window.location.href;
        ui.domElements.shareUrlContainer.classList.remove('hidden');
        ui.domElements.shareButton.classList.add('hidden');
        
        ui.domElements.shareUrlInput.select();
        document.execCommand('copy');
        showCopiedNotification();
    } else {
        try {
            ui.domElements.shareButton.disabled = true;
            ui.domElements.shareButton.textContent = 'Creating share link...';
            
            const currentDate = storage.getActiveDate();
            const allTasks = await storage.loadTasks();
            let shareId;
            
            const existingList = storage.getOwnedListByDate(currentDate);
            
            if (existingList && existingList.id) {
                shareId = existingList.id;
                await storage.updateSharedList(shareId, allTasks, currentFocusedTaskId);
            } else {
                shareId = await storage.createSharedList(allTasks, currentFocusedTaskId);
            }
            
            storage.addOwnedList(shareId, currentDate);

            let shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
            
            ui.domElements.shareUrlInput.value = shareUrl;
            ui.domElements.shareUrlContainer.classList.remove('hidden');
            ui.domElements.shareButton.classList.add('hidden');
            ui.domElements.shareButton.textContent = 'Share List';
            ui.domElements.shareButton.disabled = false;
            
            ui.domElements.shareUrlInput.select();
            document.execCommand('copy');
            showCopiedNotification();
            
            window.history.pushState({}, '', shareUrl);
            storage.setupSharing(shareId);
            ui.setupSharedUI(true);
            
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
    
    const removeCompletedTasks = (taskArray) => {
        return taskArray.filter(task => {
            if (task.completed) return false;
            if (task.subtasks && task.subtasks.length > 0) {
                task.subtasks = removeCompletedTasks(task.subtasks);
            }
            return true;
        });
    };
    
    const cleanedTasks = removeCompletedTasks(allTasks);
    await storage.saveTasks(cleanedTasks);
    await renderTasks();
};

// Render all tasks
const renderTasks = async () => {
    const allTasks = await storage.loadTasks();
    const currentFocusedTaskId = focusMode.getCurrentFocusedTaskId();
    const jumpHandler = focusMode.createJumpToBreadcrumbHandler(renderTasks);
    const focusHandler = focusMode.createFocusOnTaskHandler(renderTasks, jumpHandler);
    
    ui.domElements.activeTaskList.innerHTML = '';
    ui.domElements.completedTaskList.innerHTML = '';
    
    // Destroy previous Sortable instances
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
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        
        if (result) {
            const { task } = result;
            const subtasks = task.subtasks || [];
            const activeSubtasks = subtasks.filter(st => !st.completed);
            const completedSubtasks = subtasks.filter(st => st.completed);
            
            activeSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask, 0,
                    handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler
                );
                ui.domElements.activeTaskList.appendChild(subtaskElement);
            });
            
            completedSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask, 0,
                    handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler
                );
                ui.domElements.completedTaskList.appendChild(subtaskElement);
            });
            
            activeTasks = activeSubtasks.length;
            completedTasks = completedSubtasks.length;
        } else {
            focusMode.resetFocusState();
            return renderTasks();
        }
    } else {
        const allTopLevelTasks = utils.filterTasks(allTasks, { parentId: false });
        const activeTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: false });
        const completedTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: true });
        
        activeTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task, 0,
                handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, false
            );
            ui.domElements.activeTaskList.appendChild(taskElement);
        });
        
        completedTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task, 0,
                handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, false
            );
            ui.domElements.completedTaskList.appendChild(taskElement);
        });
        
        activeTasks = activeTopLevelTasks.length;
        completedTasks = completedTopLevelTasks.length;
    }
    
    ui.domElements.taskCount.textContent = `${activeTasks} task${activeTasks !== 1 ? 's' : ''}`;
    ui.domElements.completedCount.textContent = `${completedTasks} task${completedTasks !== 1 ? 's' : ''}`;
    
    ui.toggleEmptyState(activeTasks === 0 && !currentFocusedTaskId);
    ui.toggleCompletedSection(completedTasks > 0);
    
    if (ui.domElements.activeTaskList.children.length > 0) {
        window.activeSortable = ui.initializeSortable(ui.domElements.activeTaskList, handleActiveSortEnd);
    }
    
    if (ui.domElements.completedTaskList.children.length > 0) {
        window.completedSortable = ui.initializeSortable(ui.domElements.completedTaskList, handleCompletedSortEnd);
    }
};

// Handle sorting of tasks (consolidated handler for both active and completed)
const handleSortEnd = async (isCompleted) => {
    const listElement = isCompleted ? ui.domElements.completedTaskList : ui.domElements.activeTaskList;
    const orderedIds = Array.from(listElement.children).map(el => el.dataset.id);
    const allTasks = await storage.loadTasks();
    const currentFocusedTaskId = focusMode.getCurrentFocusedTaskId();

    if (currentFocusedTaskId) {
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);
        if (result && result.task) {
            const { task } = result;
            const activeSubtasks = task.subtasks.filter(st => !st.completed);
            const completedSubtasks = task.subtasks.filter(st => st.completed);
            const sourceList = isCompleted ? completedSubtasks : activeSubtasks;

            const reorderedSubtasks = orderedIds
                .map(id => sourceList.find(st => st.id === id))
                .filter(Boolean);

            task.subtasks = isCompleted
                ? [...activeSubtasks, ...reorderedSubtasks]
                : [...reorderedSubtasks, ...completedSubtasks];
            await storage.saveTasks(allTasks);
        }
    } else {
        const activeTopLevelTasks = utils.filterTasks(allTasks, { completed: false, parentId: false });
        const completedTopLevelTasks = utils.filterTasks(allTasks, { completed: true, parentId: false });
        const otherTasks = utils.filterTasks(allTasks, { parentId: true });
        const sourceList = isCompleted ? completedTopLevelTasks : activeTopLevelTasks;

        const reorderedTasks = orderedIds
            .map(id => sourceList.find(t => t.id === id))
            .filter(Boolean);

        const finalTasks = isCompleted
            ? [...activeTopLevelTasks, ...reorderedTasks, ...otherTasks]
            : [...reorderedTasks, ...completedTopLevelTasks, ...otherTasks];
        await storage.saveTasks(finalTasks);
    }
};

const handleActiveSortEnd = () => handleSortEnd(false);
const handleCompletedSortEnd = () => handleSortEnd(true);

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

// Modal state: track whether we're creating a new list or sharing existing tasks
let isCreatingNewList = false;

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

// Open edit modal with task data
const handleEditTask = (task) => {
    const editTaskModal = document.getElementById('edit-task-modal');
    const editTaskId = document.getElementById('edit-task-id');
    const editTaskText = document.getElementById('edit-task-text');
    const editTaskLocation = document.getElementById('edit-task-location');
    const editTaskTime = document.getElementById('edit-task-time');

    if (editTaskModal && editTaskId && editTaskText && editTaskLocation && editTaskTime) {
        editTaskId.value = task.id;
        editTaskText.value = task.task || '';
        editTaskLocation.value = task.location || '';
        editTaskTime.value = task.scheduledTime || '';
        editTaskModal.classList.remove('hidden');
        editTaskText.focus();
    }
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
    
    // Apply list type behaviors BEFORE rendering (so showTimes/showLocations are set)
    if (isSharedList) {
        const listType = storage.getListType();
        applyListTypeBehaviors(listType);
    } else {
        // Load user settings for personal list (includes custom title)
        const settings = await storage.loadUserSettings();
        if (settings.personalListTitle) {
            storage.setListTitle(settings.personalListTitle);
        }
    }

    await renderTasks();

    // Update the list title to show which list we're viewing
    updateListTitle();

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

        // Use the actual list title from storage (set when loading the shared list)
        let listTitle = storage.getListTitle();

        // Fallback to first task only if no title is set
        if (!listTitle) {
            const firstActiveTask = allTasks.find(task => !task.completed);
            if (firstActiveTask) {
                listTitle = firstActiveTask.task;
            } else if (allTasks.length > 0) {
                listTitle = allTasks[0].task;
            } else {
                listTitle = 'Shared List';
            }
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
    const taskTimeInput = document.getElementById('task-time-input');
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.addEventListener('submit', async e => {
            e.preventDefault();
            const inputText = ui.domElements.taskInput.value.trim();

            if (inputText) {
                let taskText = inputText;
                let scheduledTime = taskTimeInput ? taskTimeInput.value : null;

                // For schedule lists, use AI to parse natural language input (supports multiple tasks)
                if (storage.getListType() === 'schedule') {
                    const submitButton = ui.domElements.taskForm.querySelector('button[type="submit"]');
                    try {
                        ui.domElements.taskInput.disabled = true;
                        ui.domElements.taskInput.placeholder = 'Parsing...';
                        if (submitButton) submitButton.disabled = true;

                        const response = await fetch('/api/parse-task', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: inputText })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            if (result.tasks && result.tasks.length > 0) {
                                // Add all parsed tasks
                                for (const parsedTask of result.tasks) {
                                    await tasks.addTask(
                                        parsedTask.task,
                                        focusMode.getCurrentFocusedTaskId(),
                                        parsedTask.scheduledTime || null
                                    );
                                }
                                await renderTasks();
                                ui.domElements.taskInput.value = '';
                                if (taskTimeInput) taskTimeInput.value = '';
                                ui.domElements.taskInput.focus();
                                return; // Exit early, we've handled everything
                            }
                        }
                    } catch (error) {
                        console.error('Failed to parse task:', error);
                        // Fall back to using input as-is
                    } finally {
                        ui.domElements.taskInput.disabled = false;
                        ui.domElements.taskInput.placeholder = 'e.g., "Meeting at 3pm" or "Lunch with team at noon"';
                        if (submitButton) submitButton.disabled = false;
                    }
                }

                // Fallback for non-schedule lists or if parsing failed
                await tasks.addTask(taskText, focusMode.getCurrentFocusedTaskId(), scheduledTime || null);
                await renderTasks();
                ui.domElements.taskInput.value = '';
                if (taskTimeInput) taskTimeInput.value = '';
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

    // Share/Create modal handlers
    const shareModal = document.getElementById('share-modal');
    const shareModalTitle = shareModal?.querySelector('h2');
    const cancelShareButton = document.getElementById('cancel-share');
    const confirmShareButton = document.getElementById('confirm-share');

    // Create List button handler
    const createListButton = document.getElementById('create-list-button');

    if (createListButton && shareModal) {
        createListButton.addEventListener('click', () => {
            // Set modal for creation mode
            isCreatingNewList = true;
            if (shareModalTitle) shareModalTitle.textContent = 'Create New List';
            if (confirmShareButton) confirmShareButton.textContent = 'Create';
            // Reset to default selection
            const todoRadio = shareModal.querySelector('input[value="todo"]');
            if (todoRadio) todoRadio.checked = true;
            shareModal.classList.remove('hidden');
        });
    }

    if (cancelShareButton && shareModal) {
        cancelShareButton.addEventListener('click', () => {
            shareModal.classList.add('hidden');
            isCreatingNewList = false;
        });
    }

    if (confirmShareButton && shareModal) {
        confirmShareButton.addEventListener('click', async () => {
            const selectedType = shareModal.querySelector('input[name="share-list-type"]:checked')?.value || 'todo';
            shareModal.classList.add('hidden');

            if (isCreatingNewList) {
                // Auto-generate a title based on type
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                let autoTitle;
                if (selectedType === 'schedule') {
                    autoTitle = `Schedule - ${dateStr}`;
                } else if (selectedType === 'grocery') {
                    autoTitle = `Grocery List - ${dateStr}`;
                } else {
                    autoTitle = `To-Do List - ${dateStr}`;
                }

                // Create empty list and navigate to it
                try {
                    const shareId = await storage.createSharedList([], null, selectedType, autoTitle);
                    window.location.href = `${window.location.pathname}?share=${shareId}`;
                } catch (error) {
                    console.error('Error creating new list:', error);
                    alert('Failed to create list. Please try again.');
                }
            } else {
                // Share existing tasks
                await createSharedListWithType(selectedType);
            }

            isCreatingNewList = false;
        });
    }

    // Close share modal on outside click
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                shareModal.classList.add('hidden');
                isCreatingNewList = false;
            }
        });
    }

    // Edit title handlers
    const editTitleButton = document.getElementById('edit-title-button');
    const editTitleContainer = document.getElementById('edit-title-container');
    const editTitleInput = document.getElementById('edit-title-input');
    const saveTitleButton = document.getElementById('save-title-button');
    const cancelTitleButton = document.getElementById('cancel-title-button');
    const listTitleElement = document.getElementById('list-title');
    const aiTitleBtn = document.getElementById('ai-title-button');

    if (editTitleButton) {
        editTitleButton.addEventListener('click', () => {
            editTitleInput.value = storage.getListTitle() || '';
            editTitleContainer.classList.remove('hidden');
            listTitleElement.classList.add('hidden');
            editTitleButton.classList.add('hidden');
            if (aiTitleBtn) aiTitleBtn.classList.add('hidden');
            editTitleInput.focus();
            editTitleInput.select();
        });
    }

    if (saveTitleButton) {
        saveTitleButton.addEventListener('click', async () => {
            const newTitle = editTitleInput.value.trim();
            if (newTitle) {
                const success = await storage.updateListTitleOnServer(newTitle);
                if (success) {
                    listTitleElement.textContent = newTitle;
                    document.title = newTitle;
                }
            }
            editTitleContainer.classList.add('hidden');
            listTitleElement.classList.remove('hidden');
            editTitleButton.classList.remove('hidden');
            if (aiTitleBtn) aiTitleBtn.classList.remove('hidden');
        });
    }

    if (cancelTitleButton) {
        cancelTitleButton.addEventListener('click', () => {
            editTitleContainer.classList.add('hidden');
            listTitleElement.classList.remove('hidden');
            editTitleButton.classList.remove('hidden');
            if (aiTitleBtn) aiTitleBtn.classList.remove('hidden');
        });
    }

    // Save title on Enter key
    if (editTitleInput) {
        editTitleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveTitleButton.click();
            } else if (e.key === 'Escape') {
                cancelTitleButton.click();
            }
        });
    }

    // AI title generation button
    const aiTitleButton = document.getElementById('ai-title-button');
    if (aiTitleButton) {
        aiTitleButton.addEventListener('click', async () => {
            // Show loading state
            const originalHTML = aiTitleButton.innerHTML;
            aiTitleButton.innerHTML = `
                <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            `;
            aiTitleButton.disabled = true;

            try {
                const tasks = await storage.loadTasks();
                const listType = storage.getListType();

                const response = await fetch('/api/generate-title', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasks, listType })
                });

                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }

                const result = await response.json();
                if (result.title) {
                    // Update the title on the server
                    const success = await storage.updateListTitleOnServer(result.title);
                    if (success && listTitleElement) {
                        listTitleElement.textContent = result.title;
                        document.title = result.title;
                    }
                }
            } catch (error) {
                console.error('Error generating title:', error);
            } finally {
                // Restore button state
                aiTitleButton.innerHTML = originalHTML;
                aiTitleButton.disabled = false;
            }
        });
    }

    // Export button
    const exportButton = document.getElementById('export-button');
    if (exportButton) {
        exportButton.addEventListener('click', importExport.handleExportClick);
    }
    
    // Import button and modal
    const importButton = document.getElementById('import-button');
    const importTextButton = document.getElementById('import-text-button');
    const importModal = document.getElementById('import-modal');
    const importFileInput = document.getElementById('import-file-input');
    const importFileButton = document.getElementById('import-file-button');
    const importUrlInput = document.getElementById('import-url-input');
    const importTextInput = document.getElementById('import-text-input');
    const confirmImportUrlButton = document.getElementById('confirm-import-url');
    const confirmImportTextButton = document.getElementById('confirm-import-text');
    const cancelImportButton = document.getElementById('cancel-import');

    // Toggle between URL and Text import buttons based on which field has content
    const updateImportButtons = () => {
        const hasUrl = importUrlInput?.value.trim().length > 0;
        const hasText = importTextInput?.value.trim().length > 0;

        if (confirmImportUrlButton) {
            confirmImportUrlButton.classList.toggle('hidden', hasText && !hasUrl);
        }
        if (confirmImportTextButton) {
            confirmImportTextButton.classList.toggle('hidden', !hasText || hasUrl);
        }
    };

    if (importUrlInput) {
        importUrlInput.addEventListener('input', updateImportButtons);
    }
    if (importTextInput) {
        importTextInput.addEventListener('input', updateImportButtons);
    }

    // Open import modal from header import button
    if (importButton && importModal) {
        importButton.addEventListener('click', () => {
            importModal.classList.remove('hidden');
            if (importUrlInput) importUrlInput.value = '';
            if (importTextInput) importTextInput.value = '';
            updateImportButtons();
        });
    }

    // Open import modal from import text button (in task controls)
    if (importTextButton && importModal) {
        importTextButton.addEventListener('click', () => {
            importModal.classList.remove('hidden');
            if (importUrlInput) importUrlInput.value = '';
            if (importTextInput) importTextInput.value = '';
            updateImportButtons();
            // Focus the text input for convenience
            if (importTextInput) importTextInput.focus();
        });
    }

    if (cancelImportButton && importModal) {
        cancelImportButton.addEventListener('click', () => {
            const confirmUrlBtn = utils.$('confirm-import-url');
            const confirmTextBtn = utils.$('confirm-import-text');
            if ((!confirmUrlBtn || !confirmUrlBtn.disabled) && (!confirmTextBtn || !confirmTextBtn.disabled)) {
                importModal.classList.add('hidden');
                if (importUrlInput) importUrlInput.value = '';
                if (importTextInput) importTextInput.value = '';
            }
        });
    }

    if (importFileButton && importFileInput) {
        importFileButton.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (e) => importExport.handleImportFile(e, renderTasks));
    }

    if (confirmImportUrlButton && importUrlInput) {
        const handleImportUrl = () => importExport.handleImportFromUrl(focusMode.getCurrentFocusedTaskId(), renderTasks);
        confirmImportUrlButton.addEventListener('click', handleImportUrl);
        importUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleImportUrl();
        });
    }

    if (confirmImportTextButton && importTextInput) {
        const handleImportText = () => importExport.handleImportFromText(
            focusMode.getCurrentFocusedTaskId(),
            renderTasks,
            storage.getListType()
        );
        confirmImportTextButton.addEventListener('click', handleImportText);
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

    // Time badge toggle (default off)
    const SHOW_TIMES_KEY = 'todo_show_times';
    const showTimesToggle = document.getElementById('show-times-toggle');
    const initialShowTimes = localStorage.getItem(SHOW_TIMES_KEY) === '1';
    ui.setShowTimes(initialShowTimes);
    if (showTimesToggle) {
        showTimesToggle.checked = initialShowTimes;
        showTimesToggle.addEventListener('change', async (e) => {
            const enabled = !!e.target.checked;
            localStorage.setItem(SHOW_TIMES_KEY, enabled ? '1' : '0');
            ui.setShowTimes(enabled);
            await renderTasks();
        });
    }

    // Edit task modal handlers
    const editTaskModal = document.getElementById('edit-task-modal');
    const editTaskId = document.getElementById('edit-task-id');
    const editTaskText = document.getElementById('edit-task-text');
    const editTaskLocation = document.getElementById('edit-task-location');
    const editTaskTime = document.getElementById('edit-task-time');
    const cancelEditTask = document.getElementById('cancel-edit-task');
    const saveEditTask = document.getElementById('save-edit-task');

    if (cancelEditTask) {
        cancelEditTask.addEventListener('click', () => {
            editTaskModal.classList.add('hidden');
        });
    }

    if (saveEditTask) {
        saveEditTask.addEventListener('click', async () => {
            const taskId = editTaskId.value;
            const updates = {
                text: editTaskText.value.trim(),
                location: editTaskLocation.value.trim() || null,
                scheduledTime: editTaskTime.value || null
            };
            await tasks.updateTaskDetails(taskId, updates);
            editTaskModal.classList.add('hidden');
            await renderTasks();
        });
    }

    // Close edit modal on outside click
    if (editTaskModal) {
        editTaskModal.addEventListener('click', (e) => {
            if (e.target === editTaskModal) {
                editTaskModal.classList.add('hidden');
            }
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

// Update the page title to show which list we're viewing
const updateListTitle = () => {
    const listTitleElement = document.getElementById('list-title');
    const editTitleButton = document.getElementById('edit-title-button');
    const aiTitleButton = document.getElementById('ai-title-button');
    if (!listTitleElement) return;

    // Get the stored title (works for both personal and shared lists)
    const listTitle = storage.getListTitle();
    let displayTitle = '';

    if (listTitle) {
        displayTitle = listTitle;
    } else if (storage.getIsSharedList()) {
        // Fallback for older shared lists without a title
        const listType = storage.getListType();
        if (listType === 'schedule') {
            displayTitle = 'Schedule';
        } else if (listType === 'grocery') {
            displayTitle = 'Grocery List';
        } else {
            displayTitle = 'Shared List';
        }
    } else {
        // Default for personal list
        displayTitle = 'My List';
    }

    listTitleElement.textContent = displayTitle;
    document.title = displayTitle;

    // Always show edit and AI title buttons
    if (editTitleButton) editTitleButton.classList.remove('hidden');
    if (aiTitleButton) aiTitleButton.classList.remove('hidden');
};

// Apply list-type-specific behaviors (auto-enable toggles, show/hide time input, update badge, etc.)
const applyListTypeBehaviors = (listType) => {
    const showLocationsToggle = document.getElementById('show-locations-toggle');
    const showTimesToggle = document.getElementById('show-times-toggle');
    const taskTimeInput = document.getElementById('task-time-input');
    const taskInput = document.getElementById('task-input');
    const listTypeBadge = document.getElementById('list-type-badge');
    const aiSortButton = document.getElementById('ai-sort-button');
    const importTextButton = document.getElementById('import-text-button');
    const groceryStoreSelect = document.getElementById('grocery-store-select');
    const locationsLabel = showLocationsToggle?.parentElement;

    // Update the list type badge
    if (listTypeBadge) {
        // Reset badge classes
        listTypeBadge.className = 'text-xs px-2 py-1 rounded-md font-medium';

        if (listType === 'schedule') {
            listTypeBadge.textContent = 'Schedule';
            listTypeBadge.classList.add('bg-gray-200', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-200');
            listTypeBadge.classList.remove('hidden');
        } else if (listType === 'grocery') {
            listTypeBadge.textContent = 'Grocery';
            listTypeBadge.classList.add('bg-gray-200', 'text-gray-700', 'dark:bg-gray-700', 'dark:text-gray-200');
            listTypeBadge.classList.remove('hidden');
        } else {
            // Hide badge for default todo type
            listTypeBadge.classList.add('hidden');
        }
    }

    const timesLabel = showTimesToggle?.parentElement;

    if (listType === 'schedule') {
        // Schedule: auto-enable times, hide time input (AI parses natural language), hide other controls
        ui.setShowTimes(true);
        if (showTimesToggle) showTimesToggle.checked = true;
        // Hide time input - AI will parse time from natural language
        if (taskTimeInput) taskTimeInput.classList.add('hidden');
        // Restore left rounding and set natural language placeholder
        if (taskInput) {
            taskInput.classList.add('rounded-l-lg');
            taskInput.placeholder = 'e.g., "Meeting at 3pm" or "Lunch with team at noon"';
        }
        // Show import button, sort button, and times toggle for schedules, hide other controls
        if (importTextButton) importTextButton.classList.remove('hidden');
        if (aiSortButton) aiSortButton.classList.remove('hidden');
        if (groceryStoreSelect) groceryStoreSelect.classList.add('hidden');
        if (locationsLabel) locationsLabel.classList.add('hidden');
        if (timesLabel) timesLabel.classList.remove('hidden');
    } else if (listType === 'grocery') {
        // Grocery: auto-enable locations, show grocery controls, hide time input
        ui.setShowLocations(true);
        if (showLocationsToggle) showLocationsToggle.checked = true;
        if (taskTimeInput) taskTimeInput.classList.add('hidden');
        // Restore left rounding to task input since time input is hidden
        if (taskInput) {
            taskInput.classList.add('rounded-l-lg');
            taskInput.placeholder = 'Add item...';
        }
        // Show grocery-specific controls, hide import button
        if (importTextButton) importTextButton.classList.add('hidden');
        if (aiSortButton) aiSortButton.classList.remove('hidden');
        if (groceryStoreSelect) groceryStoreSelect.classList.remove('hidden');
        if (locationsLabel) locationsLabel.classList.remove('hidden');
        if (timesLabel) timesLabel.classList.remove('hidden');
    } else {
        // Todo (default): hide time input and import button, show standard controls
        if (taskTimeInput) taskTimeInput.classList.add('hidden');
        // Restore left rounding to task input since time input is hidden
        if (taskInput) {
            taskInput.classList.add('rounded-l-lg');
            taskInput.placeholder = 'Add task...';
        }
        if (importTextButton) importTextButton.classList.add('hidden');
        if (aiSortButton) aiSortButton.classList.remove('hidden');
        if (groceryStoreSelect) groceryStoreSelect.classList.remove('hidden');
        if (locationsLabel) locationsLabel.classList.remove('hidden');
        if (timesLabel) timesLabel.classList.remove('hidden');
    }
};

// Handle share button click - show modal for new shares, copy URL for existing shares
const handleShareButtonClick = async (focusHandler) => {
    if (storage.getIsSharedList()) {
        // Already a shared list, just copy the URL
        ui.domElements.shareUrlInput.value = window.location.href;
        ui.domElements.shareUrlContainer.classList.remove('hidden');
        ui.domElements.shareButton.classList.add('hidden');

        ui.domElements.shareUrlInput.select();
        document.execCommand('copy');
        showCopiedNotification();
    } else {
        // Show share modal to select list type
        const shareModal = document.getElementById('share-modal');
        if (shareModal) {
            // Set modal for share mode (not create mode)
            isCreatingNewList = false;
            const modalTitle = shareModal.querySelector('h2');
            if (modalTitle) modalTitle.textContent = 'Share List';
            const confirmBtn = document.getElementById('confirm-share');
            if (confirmBtn) confirmBtn.textContent = 'Share';
            // Reset to default selection
            const todoRadio = shareModal.querySelector('input[value="todo"]');
            if (todoRadio) todoRadio.checked = true;
            shareModal.classList.remove('hidden');
        }
    }
};

// Actually create the shared list after modal confirmation
const createSharedListWithType = async (listType) => {
    const currentFocusedTaskId = focusMode.getCurrentFocusedTaskId();

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
            shareId = await storage.createSharedList(allTasks, currentFocusedTaskId, listType);
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
        storage.setupSharing(shareId, listType);
        ui.setupSharedUI(true);

        // Apply list type behaviors
        applyListTypeBehaviors(listType);

        storage.connectToUpdates(shareId, (updatedData) => {
            renderTasks();
        });
    } catch (error) {
        console.error('Error sharing list:', error);
        alert('Failed to create share link. Please try again.');
        ui.domElements.shareButton.textContent = 'Share List';
        ui.domElements.shareButton.disabled = false;
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

// Helper to convert time string (HH:MM) to minutes for sorting
const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return Infinity;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Infinity;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

// Sort tasks by scheduledTime (for schedule-type lists)
const sortTasksByTime = (taskArray) => {
    return [...taskArray].sort((a, b) => {
        const aMinutes = timeToMinutes(a.scheduledTime);
        const bMinutes = timeToMinutes(b.scheduledTime);
        return aMinutes - bMinutes;
    });
};

// Calculate end times for sorted schedule tasks (end = next task's start - 1 second)
const addCalculatedEndTimes = (sortedTasks) => {
    return sortedTasks.map((task, index) => {
        const nextTask = sortedTasks[index + 1];
        let endTime = null;
        if (nextTask && nextTask.scheduledTime) {
            // End time is 1 second before next task starts (show as same minute for display)
            endTime = nextTask.scheduledTime;
        }
        return { ...task, endTime };
    });
};

// Get current/next event for schedule "Now" header
const getCurrentScheduleEvent = (tasks) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let currentEvent = null;
    let nextEvent = null;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const taskMinutes = timeToMinutes(task.scheduledTime);
        const nextTask = tasks[i + 1];
        const nextTaskMinutes = nextTask ? timeToMinutes(nextTask.scheduledTime) : Infinity;

        if (taskMinutes <= currentMinutes && currentMinutes < nextTaskMinutes) {
            currentEvent = task;
            nextEvent = nextTask || null;
            break;
        } else if (taskMinutes > currentMinutes) {
            nextEvent = task;
            break;
        }
    }

    return { currentEvent, nextEvent };
};

// Format time for display (HH:MM -> h:MM AM/PM)
const formatTimeForDisplay = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
};

// Real-time clock interval for schedule header
let scheduleClockInterval = null;
let currentScheduleTasks = [];

// Update the schedule "Now" header with current time and event info
const updateScheduleNowHeader = (tasks) => {
    // Store tasks for real-time updates
    if (tasks) {
        currentScheduleTasks = tasks;
    }

    const header = document.getElementById('schedule-now-header');
    if (!header) return;

    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const { currentEvent, nextEvent } = getCurrentScheduleEvent(currentScheduleTasks);

    const timeEl = header.querySelector('#schedule-current-time');
    const eventEl = header.querySelector('#schedule-current-event');

    if (timeEl) {
        timeEl.textContent = currentTimeStr;
    }

    const nextPreviewEl = header.querySelector('#schedule-next-preview');

    if (eventEl) {
        if (currentEvent) {
            eventEl.textContent = currentEvent.task;
            // Show next preview when there's a current event
            if (nextPreviewEl) {
                if (nextEvent) {
                    const nextTimeStr = formatTimeForDisplay(nextEvent.scheduledTime);
                    nextPreviewEl.textContent = `Next: ${nextEvent.task} at ${nextTimeStr}`;
                } else {
                    nextPreviewEl.textContent = '';
                }
            }
        } else if (nextEvent) {
            const startTimeStr = formatTimeForDisplay(nextEvent.scheduledTime);
            eventEl.innerHTML = `<span class="text-gray-500 dark:text-gray-400">Next:</span> ${nextEvent.task} at ${startTimeStr}`;
            if (nextPreviewEl) nextPreviewEl.textContent = '';
        } else {
            eventEl.innerHTML = `<span class="text-gray-500 dark:text-gray-400">No upcoming events</span>`;
            if (nextPreviewEl) nextPreviewEl.textContent = '';
        }
    }
};

// Start real-time clock for schedule header
const startScheduleClock = () => {
    if (scheduleClockInterval) return; // Already running
    scheduleClockInterval = setInterval(() => {
        updateScheduleNowHeader();
    }, 1000);
};

// Stop real-time clock
const stopScheduleClock = () => {
    if (scheduleClockInterval) {
        clearInterval(scheduleClockInterval);
        scheduleClockInterval = null;
    }
};

// Render all tasks
const renderTasks = async () => {
    const allTasks = await storage.loadTasks();
    const currentFocusedTaskId = focusMode.getCurrentFocusedTaskId();
    const jumpHandler = focusMode.createJumpToBreadcrumbHandler(renderTasks);
    const focusHandler = focusMode.createFocusOnTaskHandler(renderTasks, jumpHandler);
    const listType = storage.getListType();

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

    // Update schedule "Now" header and real-time clock
    const scheduleNowHeader = document.getElementById('schedule-now-header');
    if (scheduleNowHeader) {
        if (listType === 'schedule') {
            scheduleNowHeader.classList.remove('hidden');
            startScheduleClock();
        } else {
            scheduleNowHeader.classList.add('hidden');
            stopScheduleClock();
        }
    }

    if (currentFocusedTaskId) {
        const result = utils.findTaskById(allTasks, currentFocusedTaskId);

        if (result) {
            const { task } = result;
            const subtasks = task.subtasks || [];
            let activeSubtasks = subtasks.filter(st => !st.completed);
            let completedSubtasks = subtasks.filter(st => st.completed);

            // Auto-sort by time and calculate end times for schedule-type lists
            if (listType === 'schedule') {
                activeSubtasks = addCalculatedEndTimes(sortTasksByTime(activeSubtasks));
                completedSubtasks = addCalculatedEndTimes(sortTasksByTime(completedSubtasks));
                // Update Now header
                updateScheduleNowHeader(activeSubtasks);
            }

            activeSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask, 0,
                    handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, handleEditTask
                );
                ui.domElements.activeTaskList.appendChild(subtaskElement);
            });

            completedSubtasks.forEach(subtask => {
                const subtaskElement = ui.createTaskElement(
                    subtask, 0,
                    handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, handleEditTask
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
        let activeTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: false });
        let completedTopLevelTasks = utils.filterTasks(allTopLevelTasks, { completed: true });

        // Auto-sort by time and calculate end times for schedule-type lists
        if (listType === 'schedule') {
            activeTopLevelTasks = addCalculatedEndTimes(sortTasksByTime(activeTopLevelTasks));
            completedTopLevelTasks = addCalculatedEndTimes(sortTasksByTime(completedTopLevelTasks));
            // Update Now header
            updateScheduleNowHeader(activeTopLevelTasks);
        }

        activeTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task, 0,
                handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, handleEditTask, false
            );
            ui.domElements.activeTaskList.appendChild(taskElement);
        });

        completedTopLevelTasks.forEach(task => {
            const taskElement = ui.createTaskElement(
                task, 0,
                handleToggleCompletion, handleDeleteTask, handleToggleSticky, focusHandler, handleEditTask, false
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
// When tasks are reordered, their scheduledTime values are swapped to maintain time order
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

            // Capture original times in position order before reordering
            const originalTimes = sourceList.map(st => st.scheduledTime);

            const reorderedSubtasks = orderedIds
                .map(id => sourceList.find(st => st.id === id))
                .filter(Boolean);

            // Swap times: assign original position times to new positions
            reorderedSubtasks.forEach((st, index) => {
                if (originalTimes[index] !== undefined) {
                    st.scheduledTime = originalTimes[index];
                }
            });

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

        // Capture original times in position order before reordering
        const originalTimes = sourceList.map(t => t.scheduledTime);

        const reorderedTasks = orderedIds
            .map(id => sourceList.find(t => t.id === id))
            .filter(Boolean);

        // Swap times: assign original position times to new positions
        reorderedTasks.forEach((t, index) => {
            if (originalTimes[index] !== undefined) {
                t.scheduledTime = originalTimes[index];
            }
        });

        const finalTasks = isCompleted
            ? [...activeTopLevelTasks, ...reorderedTasks, ...otherTasks]
            : [...reorderedTasks, ...completedTopLevelTasks, ...otherTasks];
        await storage.saveTasks(finalTasks);
    }
};

const handleActiveSortEnd = () => handleSortEnd(false);
const handleCompletedSortEnd = () => handleSortEnd(true);

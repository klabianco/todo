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
    
    // Initialize storage system
    await storage.initializeStorage();
    
    // Setup UI for shared list if needed
    ui.setupSharedUI();
    
    // Set up event listeners
    setupEventListeners();
    
    // Setup subscribed lists UI if not in a shared list
    if (!isSharedList) {
        const subscribedLists = storage.getSubscribedLists();
        if (subscribedLists.length > 0) {
            ui.addSubscribedListsUI(subscribedLists, handleSubscribedListClick);
        }
    } else {
        // Check if current shared list is already in subscriptions
        const subscribedLists = storage.getSubscribedLists();
        const isAlreadySubscribed = subscribedLists.some(list => list.id === shareId);
        ui.updateSubscribeButtonState(isAlreadySubscribed);
    }
    
    // Render initial task list
    await renderTasks();

    // Auto focus on shared list's saved focus task
    const focusId = storage.getSharedListFocusId();
    if (focusId) {
        const allTasks = await storage.loadTasks();
        const result = utils.findTaskById(allTasks, focusId);
        if (result && result.task) {
            focusOnTask(focusId, result.task.task);
        }
    }
};

// Handle clicking on a subscribed shared list
const handleSubscribedListClick = (list) => {
    window.location.href = list.url;
};

// Handle subscribing to a shared list
const handleSubscribeButtonClick = async () => {
    const shareId = storage.getShareId();
    if (!shareId) return;
    
    // Get current tasks to use as the list title
    const allTasks = await storage.loadTasks();
    
    // Find a suitable title - use the first non-completed task or default
    let listTitle = 'Shared List';
    const firstActiveTask = allTasks.find(task => !task.completed);
    if (firstActiveTask) {
        listTitle = firstActiveTask.task;
    }
    
    const subscribedLists = storage.getSubscribedLists();
    const isAlreadySubscribed = subscribedLists.some(list => list.id === shareId);
    
    if (isAlreadySubscribed) {
        // Already subscribed, remove from subscriptions
        storage.unsubscribeFromSharedList(shareId);
        ui.updateSubscribeButtonState(false);
    } else {
        // Add to subscriptions
        const shareUrl = window.location.href;
        storage.subscribeToSharedList(shareId, listTitle, shareUrl);
        ui.updateSubscribeButtonState(true);
    }
};

// Handle returning to personal list from shared list
const handleBackToPersonalList = () => {
    // Clear the share parameter from URL and reload
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.location.href = url.href;
};


// Set up all event listeners
const setupEventListeners = () => {
    
    // Back to personal list button
    ui.domElements.backToPersonalButton.addEventListener('click', handleBackToPersonalList);
    
    // Subscribe button (for shared lists)
    ui.domElements.subscribeButton.addEventListener('click', handleSubscribeButtonClick);
    
    // Task form submission
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
    
    // Date navigation
    ui.domElements.prevDayButton.addEventListener('click', () => {
        const currentDate = storage.getActiveDate();
        const newDate = utils.getPreviousDay(currentDate);
        switchToDate(newDate);
    });
    
    ui.domElements.nextDayButton.addEventListener('click', () => {
        const currentDate = storage.getActiveDate();
        const newDate = utils.getNextDay(currentDate);
        switchToDate(newDate);
    });
    
    // Root breadcrumb navigation
    document.querySelector('.breadcrumb-trail button[data-level="root"]')
        .addEventListener('click', () => jumpToBreadcrumb('root'));
    
    // Set up share button
    ui.setupShareButton(handleShareButtonClick);
    
    // Handle drag and drop on breadcrumb for task promotion
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
};

// Handle share button click
const handleShareButtonClick = async () => {
    if (storage.getIsSharedList()) {
        // Already a shared list, just show the current URL
        ui.domElements.shareUrlInput.value = window.location.href;
        ui.domElements.shareUrlContainer.classList.remove('hidden');
    } else {
        // Create a new shared list
        try {
            ui.domElements.shareButton.disabled = true;
            ui.domElements.shareButton.textContent = 'Creating share link...';
            
            // Get current tasks
            const allTasks = await storage.loadTasks();

            // Create shared list on server and include current focus
            const newShareId = await storage.createSharedList(allTasks, currentFocusedTaskId);

            // Generate share URL
            let shareUrl = `${window.location.origin}${window.location.pathname}?share=${newShareId}`;
            
            // Display share URL
            ui.domElements.shareUrlInput.value = shareUrl;
            ui.domElements.shareUrlContainer.classList.remove('hidden');
            
            // Update UI
            ui.domElements.shareButton.textContent = 'Share List';
            ui.domElements.shareButton.disabled = false;
            
            // Update URL without refreshing
            window.history.pushState({}, '', shareUrl);
            
            // Update app state
            storage.setupSharing(newShareId);
            ui.setupSharedUI();
            // Do not show the "Save to My Lists" button when creating a share
            ui.hideSubscribeButton();
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
const jumpToBreadcrumb = (index) => {
    if (index === 'root') {
        // Go back to root level (all tasks)
        taskNavigationStack = [];
        currentFocusedTaskId = null;
        ui.domElements.taskBreadcrumb.classList.add('hidden');
        ui.domElements.focusTitle.textContent = '';
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

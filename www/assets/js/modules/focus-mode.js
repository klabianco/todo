/**
 * Focus mode and navigation for the Todo app
 * Handles task navigation stack and breadcrumb navigation
 */
import * as utils from './utils.js';
import * as storage from './storage.js';
import * as ui from './ui.js';

// Navigation state
let taskNavigationStack = [];
let currentFocusedTaskId = null;

// Getters for state
export const getNavigationStack = () => taskNavigationStack;
export const getCurrentFocusedTaskId = () => currentFocusedTaskId;

// Update breadcrumb trail UI
const updateBreadcrumbTrail = (jumpToBreadcrumb) => {
    ui.updateBreadcrumbTrail(taskNavigationStack, jumpToBreadcrumb);
};

// Focus on a specific task and its subtasks
export const focusOnTask = (taskId, taskTitle, renderTasks, jumpToBreadcrumb) => {
    storage.loadTasks().then(tasks => {
        const result = utils.findTaskById(tasks, taskId);
        
        if (result && result.task) {
            if (currentFocusedTaskId === taskId) {
                return; // Already focused
            }
            
            // Prevent circular navigation
            if (taskNavigationStack.some(item => item.id === taskId)) {
                return;
            }
            
            // Initialize subtasks array if needed
            if (!result.task.subtasks) {
                result.task.subtasks = [];
                storage.saveTasks(tasks);
            }
            
            // Add to navigation stack
            taskNavigationStack.push({
                id: taskId,
                title: taskTitle
            });

            currentFocusedTaskId = taskId;
            ui.domElements.taskBreadcrumb.classList.remove('hidden');

            // Update page and focus title
            document.title = `${taskTitle} - Todo`;
            ui.domElements.focusTitle.textContent = taskTitle;
            
            // Save focus ID for shared lists
            if (storage.getIsSharedList()) {
                storage.saveTasks(tasks, taskId);
            }
            
            updateBreadcrumbTrail(jumpToBreadcrumb);
            renderTasks();
        }
    });
};

// Jump to a specific breadcrumb level
export const jumpToBreadcrumb = async (index, renderTasks) => {
    if (index === 'root') {
        // If viewing a shared list, return to personal list
        if (storage.getIsSharedList()) {
            const currentShareId = storage.getShareId();
            if (currentShareId) {
                try {
                    const allTasks = await storage.loadTasks();
                    let listTitle = 'Shared List';
                    if (allTasks.length > 0) {
                        listTitle = allTasks[0].task;
                    }
                    if (window.location.href.includes('groceries')) {
                        listTitle = 'Groceries';
                    }
                    
                    if (!storage.isOwnedList(currentShareId)) {
                        localStorage.setItem('todo_force_subscription', JSON.stringify({
                            id: currentShareId,
                            title: listTitle,
                            url: window.location.href,
                            timestamp: Date.now()
                        }));
                    }
                } catch (err) {
                    // Ignore errors
                }
            }
            
            storage.disconnectUpdates();
            const url = new URL(window.location.href);
            url.searchParams.delete('share');
            url.searchParams.set('refreshLists', 'true');
            window.location.href = url.href;
            return;
        }

        // Return to root level
        taskNavigationStack = [];
        currentFocusedTaskId = null;
        ui.domElements.taskBreadcrumb.classList.add('hidden');
        ui.domElements.focusTitle.textContent = '';
        document.title = 'Todo';
        
        renderTasks();
        return;
    }
    
    // Handle numeric indexes
    const numIndex = parseInt(index, 10);
    
    if (numIndex >= 0 && numIndex < taskNavigationStack.length) {
        const newStack = taskNavigationStack.slice(0, numIndex + 1);
        const lastItem = newStack[newStack.length - 1];
        
        taskNavigationStack = newStack;
        currentFocusedTaskId = lastItem.id;

        updateBreadcrumbTrail((idx) => jumpToBreadcrumb(idx, renderTasks));
        renderTasks();
    }
};

// Reset focus state (when task not found)
export const resetFocusState = () => {
    currentFocusedTaskId = null;
    ui.domElements.taskBreadcrumb.classList.add('hidden');
    ui.domElements.focusTitle.textContent = '';
    taskNavigationStack = [];
};

// Initialize focus from shared list's saved focus task
export const initializeFocusFromSharedList = async (renderTasks, jumpToBreadcrumbFn) => {
    const focusId = storage.getSharedListFocusId();
    if (focusId) {
        const allTasks = await storage.loadTasks();
        const result = utils.findTaskById(allTasks, focusId);
        if (result && result.task) {
            document.title = `${result.task.task} - Todo`;
            focusOnTask(focusId, result.task.task, renderTasks, jumpToBreadcrumbFn);
        }
    }
};

// Create a bound jumpToBreadcrumb function for use in event handlers
export const createJumpToBreadcrumbHandler = (renderTasks) => {
    return (index) => jumpToBreadcrumb(index, renderTasks);
};

// Create a bound focusOnTask function for use in event handlers
export const createFocusOnTaskHandler = (renderTasks, jumpToBreadcrumbFn) => {
    return (taskId, taskTitle) => focusOnTask(taskId, taskTitle, renderTasks, jumpToBreadcrumbFn);
};

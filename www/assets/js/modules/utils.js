/**
 * Utility functions for the Todo app
 */

// Generate a UUID
export const generateUUID = () => {
    // Using timestamp as part of the ID to ensure uniqueness
    const timestamp = new Date().getTime().toString(16);
    const randomPart = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    
    // Combine timestamp and random part for truly unique IDs
    return timestamp.substring(0, 8) + randomPart.substring(0, 24);
};

// Get current date in YYYY-MM-DD format
export const getCurrentDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Helper to recursively make all subtasks sticky
export const makeAllSubtasksSticky = (task, isSticky) => {
    if (task.subtasks && task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
            subtask.sticky = isSticky;
            // Recursively apply to deeper subtasks
            if (subtask.subtasks && subtask.subtasks.length > 0) {
                makeAllSubtasksSticky(subtask, isSticky);
            }
        }
    }
};

// Helper to recursively complete/uncomplete all subtasks
export const completeAllSubtasks = (task, completed) => {
    if (!task.subtasks) return;
    
    task.subtasks.forEach(subtask => {
        subtask.completed = completed;
        if (subtask.subtasks && subtask.subtasks.length > 0) {
            completeAllSubtasks(subtask, completed);
        }
    });
};

// Find task by ID (including in subtasks)
export const findTaskById = (tasks, taskId) => {
    // Check top-level tasks first
    const task = tasks.find(t => t.id === taskId);
    if (task) return { task };
    
    // Search in subtasks
    for (const parentTask of tasks) {
        if (parentTask.subtasks) {
            const result = findTaskByIdInSubtasks(parentTask, taskId);
            if (result) return result;
        }
    }
    
    return null;
};

// Helper to find task by ID within subtasks
export const findTaskByIdInSubtasks = (parent, taskId) => {
    if (!parent.subtasks) return null;
    
    const task = parent.subtasks.find(t => t.id === taskId);
    if (task) return { task, parent };
    
    // Recursively search deeper
    for (const subtask of parent.subtasks) {
        if (subtask.subtasks) {
            const result = findTaskByIdInSubtasks(subtask, taskId);
            if (result) return result;
        }
    }
    
    return null;
};

// DOM helper
export const $ = id => document.getElementById(id);

// Create element with class names
export const createElement = (tag, classNames = '', content = '') => {
    const element = document.createElement(tag);
    if (classNames) element.className = classNames;
    if (content) element.textContent = content;
    return element;
};

// Create a separator for breadcrumb
export const createSeparator = () => {
    const separator = document.createElement('span');
    separator.className = 'mx-2 text-gray-500';
    separator.textContent = '/';
    return separator;
};

// Helper to separate active and completed tasks
export const separateTasks = (tasks) => {
    const active = tasks.filter(task => !task.completed);
    const completed = tasks.filter(task => task.completed);
    return { active, completed };
};

// Helper to restore button state
export const restoreButtonState = (button, originalText) => {
    if (!button) return;
    button.disabled = false;
    button.style.opacity = '';
    button.style.cursor = '';
    button.style.pointerEvents = '';
    button.innerHTML = originalText;
};

// Helper to set button loading state
export const setButtonLoading = (button, loadingText = 'Loading...') => {
    if (!button || button.disabled) return null;
    
    const originalText = button.innerHTML;
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';
    button.style.pointerEvents = 'none';
    button.innerHTML = loadingText;
    
    return originalText;
};

// Helper for API fetch with cache-busting
export const apiFetch = async (url, options = {}) => {
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustUrl = `${url}${separator}t=${Date.now()}`;
    return fetch(cacheBustUrl, {
        ...options,
        headers: {
            'Accept': 'application/json',
            ...options.headers
        },
        cache: 'no-store'
    });
};

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

// Helper for API fetch with cache-busting
export const apiFetch = async (url, options = {}) => {
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustUrl = `${url}${separator}t=${Date.now()}`;
    
    // Default timeout: 10 minutes (600 seconds) for long-running AI operations
    const timeout = options.timeout || 600000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(cacheBustUrl, {
            ...options,
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                ...options.headers
            },
            cache: 'no-store'
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        throw error;
    }
};

// Helper to filter tasks by completion and parent status
export const filterTasks = (tasks, options = {}) => {
    const { completed = null, parentId = null } = options;
    return tasks.filter(task => {
        if (completed !== null && task.completed !== completed) return false;
        if (parentId === null) return true; // No filter on parentId
        if (parentId === false) return !task.parentId; // Top-level only
        if (parentId === true) return !!task.parentId; // Subtasks only
        return task.parentId === parentId; // Specific parentId
    });
};

// Helper to escape HTML
export const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Helper to get current view context (whether viewing subtasks or top-level)
export const getCurrentViewContext = (allTasks, currentFocusedTaskId, findTaskById) => {
    if (currentFocusedTaskId) {
        // Focus mode: viewing subtasks of focused task
        const result = findTaskById(allTasks, currentFocusedTaskId);
        if (!result?.task) return null;
        return {
            isViewingSubtasks: true,
            parentTask: result.task,
            parentId: currentFocusedTaskId,
            tasks: result.task.subtasks || []
        };
    }
    
    // Check if we're viewing subtasks (all active tasks have parentId)
    const activeTopLevel = filterTasks(allTasks, { completed: false, parentId: false });
    const activeSubtasks = filterTasks(allTasks, { completed: false, parentId: true });
    
    if (activeTopLevel.length === 0 && activeSubtasks.length > 0) {
        // Viewing subtasks - find their parent
        const firstTask = activeSubtasks[0];
        const parentResult = findTaskById(allTasks, firstTask.parentId);
        if (parentResult?.task) {
            return {
                isViewingSubtasks: true,
                parentTask: parentResult.task,
                parentId: firstTask.parentId,
                tasks: parentResult.task.subtasks || []
            };
        }
    }
    
    // Default: viewing top-level tasks
    return {
        isViewingSubtasks: false,
        parentTask: null,
        parentId: null,
        tasks: filterTasks(allTasks, { parentId: false })
    };
};

// Format store location string from city and state
export const formatStoreLocation = (city, state) => {
    const location = [city, state].filter(Boolean).join(', ');
    return location || null;
};

// Truncate text intelligently at sentence or word boundaries
export const truncateText = (text, maxLength = 200) => {
    if (!text || text.length <= maxLength) {
        return text;
    }
    
    const truncated = text.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    const cutPoint = lastPeriod > maxLength * 0.7 ? lastPeriod + 1 : lastSpace;
    return truncated.substring(0, cutPoint) + '...';
};

// Count tasks recursively (including nested subtasks)
export const countTasks = (taskList) => {
    let count = 0;
    for (const task of taskList) {
        count++;
        if (task.subtasks && task.subtasks.length > 0) {
            count += countTasks(task.subtasks);
        }
    }
    return count;
};

// Reassign IDs to tasks recursively (for imports to avoid conflicts)
export const reassignTaskIds = (taskList, newParentId = null) => {
    const now = new Date().toISOString();
    return taskList.map(task => {
        const newId = generateUUID();
        const newTask = {
            ...task,
            id: newId,
            parentId: newParentId,
            created: now,
            // Create fresh timestamps for imported tasks
            timestamps: {
                created: now,
                completedHistory: [],
                uncompletedHistory: [],
                editedHistory: [],
                stickyHistory: []
            }
        };
        // Remove location data since it may not apply to user's store
        delete newTask.location;
        delete newTask.location_index;
        // Recursively reassign subtask IDs
        if (task.subtasks && task.subtasks.length > 0) {
            newTask.subtasks = reassignTaskIds(task.subtasks, newId);
        }
        return newTask;
    });
};

// Insert task at top of active (non-completed) tasks
export const insertAtActiveTop = (taskArray, ...tasksToInsert) => {
    const firstActiveIndex = taskArray.findIndex(t => !t.completed);
    if (firstActiveIndex === -1) {
        taskArray.unshift(...tasksToInsert);
    } else {
        taskArray.splice(firstActiveIndex, 0, ...tasksToInsert);
    }
};

/**
 * Task manipulation functions for the Todo app
 */
import { generateUUID, findTaskById, completeAllSubtasks, makeAllSubtasksSticky } from './utils.js';
import { loadTasks, saveTasks } from './storage.js';

// Helper to insert task at the beginning of active tasks
const insertAtActiveTop = (taskArray, task) => {
    const firstActiveIndex = taskArray.findIndex(t => !t.completed);
    if (firstActiveIndex === -1) {
        taskArray.unshift(task);
    } else {
        taskArray.splice(firstActiveIndex, 0, task);
    }
};

// Helper to create initial timestamps object
const createTimestamps = () => ({
    created: new Date().toISOString(),
    completedHistory: [],
    uncompletedHistory: [],
    editedHistory: [],
    stickyHistory: []
});

// Helper to ensure timestamps object exists on task
const ensureTimestamps = (task) => {
    if (!task.timestamps) {
        task.timestamps = {
            created: task.created || new Date().toISOString(),
            completedHistory: [],
            uncompletedHistory: [],
            editedHistory: [],
            stickyHistory: []
        };
    }
    return task.timestamps;
};

// Helper to add timestamp to a history array
const addToHistory = (historyArray, timestamp = new Date().toISOString()) => {
    if (!Array.isArray(historyArray)) {
        return [timestamp];
    }
    return [...historyArray, timestamp];
};

// Add a new task
export const addTask = async (taskText, currentFocusedTaskId = null) => {
    // Handle focused mode - add as a subtask if we're focused
    if (currentFocusedTaskId) {
        return await addSubtask(currentFocusedTaskId, taskText);
    }
    
    // Otherwise create a top-level task
    const tasks = await loadTasks();
    
    // Check if a task with the same text already exists (regardless of completion status)
    const existingTaskIndex = tasks.findIndex(task => 
        task.task.trim().toLowerCase() === taskText.trim().toLowerCase()
    );
    
    if (existingTaskIndex !== -1) {
        const existingTask = tasks[existingTaskIndex];
        // If the existing task is completed, uncheck it and move to top
        if (existingTask.completed) {
            existingTask.completed = false;
            tasks.splice(existingTaskIndex, 1);
            insertAtActiveTop(tasks, existingTask);
            await saveTasks(tasks);
        }
        return existingTask;
    }
    
    // Create new task object if no existing task found
    const now = new Date().toISOString();
    const newTask = {
        id: generateUUID(),
        task: taskText,
        completed: false,
        sticky: false,
        subtasks: [],
        created: now,
        timestamps: {
            created: now,
            completedHistory: [],
            uncompletedHistory: [],
            editedHistory: [],
            stickyHistory: []
        }
    };
    
    // Add to beginning of active tasks (top of list)
    insertAtActiveTop(tasks, newTask);
    
    // Save updated tasks
    await saveTasks(tasks);
    
    return newTask;
};

// Add a subtask to a parent task
export const addSubtask = async (parentId, subtaskText) => {
    const tasks = await loadTasks();
    const result = findTaskById(tasks, parentId);
    
    if (result) {
        const { task } = result;
        
        // Check if a subtask with the same text already exists (regardless of completion status)
        if (!task.subtasks) task.subtasks = [];
        const existingSubtaskIndex = task.subtasks.findIndex(subtask => 
            subtask.task.trim().toLowerCase() === subtaskText.trim().toLowerCase()
        );
        
        if (existingSubtaskIndex !== -1) {
            const existingSubtask = task.subtasks[existingSubtaskIndex];
            // If the existing subtask is completed, uncheck it and move to top
            if (existingSubtask.completed) {
                existingSubtask.completed = false;
                task.subtasks.splice(existingSubtaskIndex, 1);
                insertAtActiveTop(task.subtasks, existingSubtask);
                await saveTasks(tasks);
            }
            return existingSubtask;
        }
        
        // Create new subtask
        const now = new Date().toISOString();
        const newSubtask = {
            id: generateUUID(),
            task: subtaskText,
            completed: false,
            sticky: false,
            subtasks: [],
            created: now,
            parentId: task.id,
            timestamps: {
                created: now,
                completedHistory: [],
                uncompletedHistory: [],
                editedHistory: [],
                stickyHistory: []
            }
        };
        
        // Add to beginning of active subtasks (top of list)
        insertAtActiveTop(task.subtasks, newSubtask);
        
        // Save tasks
        await saveTasks(tasks);
        
        return newSubtask;
    }
    return null;
};

// Toggle task completion status
export const toggleTaskCompletion = async (taskId) => {
    const tasks = await loadTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (taskResult) {
        const { task, parent } = taskResult;
        const wasCompleted = task.completed;
        task.completed = !task.completed;

        // Track timestamp for this task
        const timestamps = ensureTimestamps(task);
        const now = new Date().toISOString();
        if (task.completed) {
            timestamps.completedHistory = addToHistory(timestamps.completedHistory, now);
        } else {
            timestamps.uncompletedHistory = addToHistory(timestamps.uncompletedHistory, now);
        }

        // Toggle completion status for all subtasks to match parent (with timestamps)
        if (task.subtasks && task.subtasks.length > 0) {
            const updateSubtasksTimestamps = (subtaskList, completed) => {
                for (const subtask of subtaskList) {
                    subtask.completed = completed;
                    const subTimestamps = ensureTimestamps(subtask);
                    if (completed) {
                        subTimestamps.completedHistory = addToHistory(subTimestamps.completedHistory, now);
                    } else {
                        subTimestamps.uncompletedHistory = addToHistory(subTimestamps.uncompletedHistory, now);
                    }
                    if (subtask.subtasks && subtask.subtasks.length > 0) {
                        updateSubtasksTimestamps(subtask.subtasks, completed);
                    }
                }
            };
            updateSubtasksTimestamps(task.subtasks, task.completed);
        }

        // If unchecking a completed task, move it to the top of active tasks
        if (wasCompleted && !task.completed) {
            if (parent) {
                // It's a subtask - move to top of active subtasks
                const subtasks = parent.subtasks;
                const currentIndex = subtasks.findIndex(t => t.id === taskId);
                if (currentIndex !== -1) {
                    subtasks.splice(currentIndex, 1);
                    insertAtActiveTop(subtasks, task);
                }
            } else {
                // It's a top-level task - move to top of active tasks
                const currentIndex = tasks.findIndex(t => t.id === taskId);
                if (currentIndex !== -1) {
                    tasks.splice(currentIndex, 1);
                    insertAtActiveTop(tasks, task);
                }
            }
        }

        await saveTasks(tasks);
        return true;
    }
    return false;
};

// Toggle task sticky status
export const toggleTaskSticky = async (taskId) => {
    const tasks = await loadTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (taskResult && taskResult.task) {
        const task = taskResult.task;
        task.sticky = !task.sticky;

        // Track timestamp for this task
        const timestamps = ensureTimestamps(task);
        const now = new Date().toISOString();
        timestamps.stickyHistory = addToHistory(timestamps.stickyHistory, now);

        // Apply the same sticky status to all subtasks (with timestamps)
        if (task.subtasks && task.subtasks.length > 0) {
            const updateSubtasksStickyTimestamps = (subtaskList, isSticky) => {
                for (const subtask of subtaskList) {
                    subtask.sticky = isSticky;
                    const subTimestamps = ensureTimestamps(subtask);
                    subTimestamps.stickyHistory = addToHistory(subTimestamps.stickyHistory, now);
                    if (subtask.subtasks && subtask.subtasks.length > 0) {
                        updateSubtasksStickyTimestamps(subtask.subtasks, isSticky);
                    }
                }
            };
            updateSubtasksStickyTimestamps(task.subtasks, task.sticky);
        }

        await saveTasks(tasks);
        return true;
    }
    return false;
};

// Delete a task
export const deleteTask = async (taskId) => {
    // Immediately delete without animation
    const tasks = await loadTasks();

    // Find and remove task (could be a subtask)
    const result = findTaskById(tasks, taskId);

    if (result) {
        const { task, parent } = result;

        // Track deletion timestamp before removing (for logging/analytics purposes)
        const timestamps = ensureTimestamps(task);
        timestamps.deletedAt = new Date().toISOString();

        if (parent) {
            // It's a subtask, remove from parent's subtasks array
            const index = parent.subtasks.findIndex(t => t.id === taskId);
            if (index !== -1) {
                parent.subtasks.splice(index, 1);
            }
        } else {
            // It's a top-level task, remove from main array
            const index = tasks.findIndex(t => t.id === taskId);
            if (index !== -1) {
                tasks.splice(index, 1);
            }
        }

        await saveTasks(tasks);
        return true;
    }
    return false;
};

// Edit task text
export const editTask = async (taskId, newText) => {
    const tasks = await loadTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (taskResult && taskResult.task) {
        const task = taskResult.task;
        const oldText = task.task;

        // Only update if text actually changed
        if (oldText !== newText) {
            task.task = newText;

            // Track edit timestamp
            const timestamps = ensureTimestamps(task);
            timestamps.editedHistory = addToHistory(timestamps.editedHistory, new Date().toISOString());

            await saveTasks(tasks);
            return true;
        }
        return false; // No change made
    }
    return false;
};

// Promote a task one level up
export const promoteTask = async (taskId) => {
    const tasks = await loadTasks();
    const result = findTaskById(tasks, taskId);
    
    if (!result || !result.parent) return false; // Can't promote top-level task
    
    const { task, parent } = result;
    
    // Remove from parent's subtasks
    parent.subtasks = parent.subtasks.filter(st => st.id !== taskId);
    
    // If parent has a parent, add as sibling
    if (parent.parentId) {
        const grandparentResult = findTaskById(tasks, parent.parentId);
        if (grandparentResult && grandparentResult.task) {
            const grandparent = grandparentResult.task;
            task.parentId = grandparent.id;
            grandparent.subtasks.push(task);
        }
    } else {
        // Parent is top-level, promote to top level
        delete task.parentId;
        tasks.push(task);
    }
    
    await saveTasks(tasks);
    return true;
};

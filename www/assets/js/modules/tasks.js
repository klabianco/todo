/**
 * Task manipulation functions for the Todo app
 */
import { generateUUID, findTaskById, completeAllSubtasks, makeAllSubtasksSticky } from './utils.js';
import { loadTasks, saveTasks } from './storage.js';

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
            // Remove from current position and add to beginning of active tasks
            tasks.splice(existingTaskIndex, 1);
            // Find where active tasks start (first non-completed task)
            const firstActiveIndex = tasks.findIndex(t => !t.completed);
            if (firstActiveIndex === -1) {
                tasks.unshift(existingTask); // Add to beginning if no active tasks
            } else {
                tasks.splice(firstActiveIndex, 0, existingTask); // Insert at first active position
            }
            await saveTasks(tasks);
        }
        return existingTask;
    }
    
    // Create new task object if no existing task found
    const newTask = {
        id: generateUUID(),
        task: taskText,
        completed: false,
        sticky: false,
        subtasks: [],
        created: new Date().toISOString()
    };
    
    // Add to beginning of active tasks (top of list)
    const firstActiveIndex = tasks.findIndex(t => !t.completed);
    if (firstActiveIndex === -1) {
        tasks.unshift(newTask); // Add to beginning if no active tasks
    } else {
        tasks.splice(firstActiveIndex, 0, newTask); // Insert at first active position
    }
    
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
                // Remove from current position and add to beginning of active subtasks
                task.subtasks.splice(existingSubtaskIndex, 1);
                const firstActiveIndex = task.subtasks.findIndex(st => !st.completed);
                if (firstActiveIndex === -1) {
                    task.subtasks.unshift(existingSubtask);
                } else {
                    task.subtasks.splice(firstActiveIndex, 0, existingSubtask);
                }
                await saveTasks(tasks);
            }
            return existingSubtask;
        }
        
        // Create new subtask
        const newSubtask = {
            id: generateUUID(),
            task: subtaskText,
            completed: false,
            sticky: false,
            subtasks: [],
            created: new Date().toISOString(),
            parentId: task.id
        };
        
        // Add to beginning of active subtasks (top of list)
        const firstActiveIndex = task.subtasks.findIndex(st => !st.completed);
        if (firstActiveIndex === -1) {
            task.subtasks.unshift(newSubtask);
        } else {
            task.subtasks.splice(firstActiveIndex, 0, newSubtask);
        }
        
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
        
        // Toggle completion status for all subtasks to match parent
        if (task.subtasks && task.subtasks.length > 0) {
            completeAllSubtasks(task, task.completed);
        }
        
        // If unchecking a completed task, move it to the top of active tasks
        if (wasCompleted && !task.completed) {
            if (parent) {
                // It's a subtask - move to top of active subtasks
                const subtasks = parent.subtasks;
                const currentIndex = subtasks.findIndex(t => t.id === taskId);
                if (currentIndex !== -1) {
                    subtasks.splice(currentIndex, 1);
                    const firstActiveIndex = subtasks.findIndex(st => !st.completed);
                    if (firstActiveIndex === -1) {
                        subtasks.unshift(task);
                    } else {
                        subtasks.splice(firstActiveIndex, 0, task);
                    }
                }
            } else {
                // It's a top-level task - move to top of active tasks
                const currentIndex = tasks.findIndex(t => t.id === taskId);
                if (currentIndex !== -1) {
                    tasks.splice(currentIndex, 1);
                    const firstActiveIndex = tasks.findIndex(t => !t.completed);
                    if (firstActiveIndex === -1) {
                        tasks.unshift(task);
                    } else {
                        tasks.splice(firstActiveIndex, 0, task);
                    }
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
        
        // Apply the same sticky status to all subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            makeAllSubtasksSticky(task, task.sticky);
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

// Move a task to become a subtask of another task
export const moveTaskAsSubtask = async (taskId, newParentId) => {
    if (taskId === newParentId) return false; // Can't make a task a subtask of itself
    
    const tasks = await loadTasks();
    const taskResult = findTaskById(tasks, taskId);
    const parentResult = findTaskById(tasks, newParentId);
    
    if (!taskResult || !parentResult) return false;
    
    const { task, parent: oldParent } = taskResult;
    const { task: newParent } = parentResult;
    
    // Check if new parent is a descendant of the task (would create a cycle)
    let currentTask = newParent;
    while (currentTask) {
        if (currentTask.parentId === task.id) return false; // Would create a cycle
        
        // Move up the hierarchy
        const parentResult = currentTask.parentId ? findTaskById(tasks, currentTask.parentId) : null;
        currentTask = parentResult ? parentResult.task : null;
    }
    
    // Remove from old parent (or top level)
    if (oldParent) {
        oldParent.subtasks = oldParent.subtasks.filter(st => st.id !== taskId);
    } else {
        const index = tasks.findIndex(t => t.id === taskId);
        if (index !== -1) tasks.splice(index, 1);
    }
    
    // Add to new parent
    if (!newParent.subtasks) newParent.subtasks = [];
    task.parentId = newParent.id;
    newParent.subtasks.push(task);
    
    await saveTasks(tasks);
    return true;
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

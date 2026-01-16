/**
 * Sorting utilities for the Todo app
 * Handles AI-based location assignment and programmatic sorting
 */
import * as storage from './storage.js';
import * as groceryStores from './grocery-stores.js';
import * as ui from './ui.js';
import { showLoadingOverlay, hideLoadingOverlay } from './overlay-utils.js';
import { setButtonLoading, restoreButtonState } from './button-utils.js';
import { apiFetch, findTaskById, getCurrentViewContext, filterTasks, separateTasks } from './utils.js';

// Parse numeric location from location string (e.g., "Aisle 18 (Snacks)" -> 18)
export const parseLocationNumber = (location) => {
    if (location == null) return null;
    const s = String(location);
    // Prefer explicit "Aisle 18" pattern
    let m = s.match(/\baisle\s*(\d+)\b/i);
    if (m && m[1]) return Number(m[1]);
    // Fallback: first standalone number anywhere
    m = s.match(/\b(\d+)\b/);
    if (m && m[1]) return Number(m[1]);
    return null;
};

// Parse time string to minutes since midnight for comparison
export const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const trimmed = timeStr.trim();
    if (!trimmed) return null;
    // Match HH:MM or H:MM format
    const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
};

// Sort tasks by scheduled time first, then by location
export const sortTasksByLocation = (tasks) => {
    if (!Array.isArray(tasks) || tasks.length === 0) return tasks || [];

    // Stable sort: decorate with original index
    const decorated = tasks.map((t, idx) => ({
        t,
        idx,
        timeMinutes: parseTimeToMinutes(t?.scheduledTime),
        location: (t?.location ?? '').toString(),
        locationNum: parseLocationNumber(t?.location),
        locationIndex: Number.isFinite(Number(t?.location_index)) ? Number(t.location_index) : 9999,
        text: (t?.task ?? '').toString()
    }));

    decorated.sort((a, b) => {
        // Primary sort: by scheduled time (tasks with time come first)
        const aHasTime = a.timeMinutes !== null;
        const bHasTime = b.timeMinutes !== null;
        if (aHasTime && bHasTime && a.timeMinutes !== b.timeMinutes) return a.timeMinutes - b.timeMinutes;
        if (aHasTime !== bHasTime) return aHasTime ? -1 : 1; // timed tasks first

        // Secondary sort: by location
        const aHasNum = Number.isFinite(a.locationNum);
        const bHasNum = Number.isFinite(b.locationNum);
        if (aHasNum && bHasNum && a.locationNum !== b.locationNum) return a.locationNum - b.locationNum;
        if (aHasNum !== bHasNum) return aHasNum ? -1 : 1; // numbered locations first
        if (a.locationIndex !== b.locationIndex) return a.locationIndex - b.locationIndex;
        const locationCmp = a.location.localeCompare(b.location);
        if (locationCmp !== 0) return locationCmp;
        const textCmp = a.text.localeCompare(b.text);
        if (textCmp !== 0) return textCmp;
        return a.idx - b.idx;
    });

    return decorated.map(d => d.t);
};

// Helper to determine which tasks to sort and get parent info
export const getTasksToSort = (allTasks, currentFocusedTaskId) => {
    const context = getCurrentViewContext(allTasks, currentFocusedTaskId, findTaskById);
    if (!context) return null;

    return {
        tasks: filterTasks(context.tasks, { completed: false }),
        parentTask: context.parentTask,
        parentId: context.parentId
    };
};

// Disable all interactions during sorting
export const disableAllInteractions = () => {
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.style.pointerEvents = 'none';
        ui.domElements.taskForm.style.opacity = '0.5';
    }
    if (ui.domElements.taskInput) {
        ui.domElements.taskInput.disabled = true;
    }
    
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
    
    if (window.activeSortable) window.activeSortable.option('disabled', true);
    if (window.completedSortable) window.completedSortable.option('disabled', true);
    
    const otherButtons = document.querySelectorAll('#share-button, #back-to-personal-button, #completed-toggle');
    otherButtons.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
        }
    });
    
    showLoadingOverlay('Sorting...', 'Please wait');
};

// Re-enable all interactions after sorting
export const enableAllInteractions = () => {
    if (ui.domElements.taskForm) {
        ui.domElements.taskForm.style.pointerEvents = '';
        ui.domElements.taskForm.style.opacity = '';
    }
    if (ui.domElements.taskInput) {
        ui.domElements.taskInput.disabled = false;
    }
    
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
    
    if (window.activeSortable) window.activeSortable.option('disabled', false);
    if (window.completedSortable) window.completedSortable.option('disabled', false);
    
    const otherButtons = document.querySelectorAll('#share-button, #back-to-personal-button, #completed-toggle');
    otherButtons.forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    });
    
    hideLoadingOverlay();
};

// Helper to convert time string (HH:MM) to minutes for sorting
const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return Infinity;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Infinity;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

// Sort tasks by scheduledTime
const sortTasksByTime = (taskArray) => {
    return [...taskArray].sort((a, b) => {
        const aMinutes = timeToMinutes(a.scheduledTime);
        const bMinutes = timeToMinutes(b.scheduledTime);
        return aMinutes - bMinutes;
    });
};

// Handle AI sort button click
export const handleAISortClick = async (currentFocusedTaskId, renderTasks) => {
    const aiSortButton = document.getElementById('ai-sort-button');
    if (!aiSortButton) return;

    const listType = storage.getListType();

    const loadingHTML = `
        <svg class="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Sorting...
    `;

    const originalText = setButtonLoading(aiSortButton, loadingHTML);
    if (!originalText) return;

    disableAllInteractions();

    try {
        const allTasks = await storage.loadTasks();
        const sortInfo = getTasksToSort(allTasks, currentFocusedTaskId);

        if (!sortInfo) {
            enableAllInteractions();
            restoreButtonState(aiSortButton, originalText);
            return;
        }

        const { active: tasksToSort, completed: completedTasksToPreserve } = separateTasks(sortInfo.tasks);

        if (tasksToSort.length === 0) {
            enableAllInteractions();
            restoreButtonState(aiSortButton, originalText);
            return;
        }

        let sortedActiveTasks;

        // For schedule lists, sort by time (no AI needed)
        if (listType === 'schedule') {
            sortedActiveTasks = sortTasksByTime(tasksToSort);
        } else {
            // Get selected store and fetch full store data if available
            const selectedStore = groceryStores.getSelectedGroceryStore();
            let storeData = null;
            if (selectedStore && selectedStore.id) {
                try {
                    const stores = await groceryStores.loadGroceryStores();
                    const fullStore = stores.find(s => s.id === selectedStore.id);
                    if (fullStore && fullStore.aisle_layout) {
                        storeData = {
                            id: fullStore.id,
                            name: fullStore.name,
                            aisle_layout: fullStore.aisle_layout
                        };
                    }
                } catch (error) {
                    console.error('Error loading store data for sorting:', error);
                }
            }

            // Call AI aisle assignment API, then sort programmatically
            const response = await fetch('/api/sort', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks: tasksToSort,
                    store: storeData
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Sort API error:', errorText);
                throw new Error(`Failed to sort tasks: ${response.status}`);
            }

            const { tasks: annotatedActiveTasks = tasksToSort } = await response.json();
            sortedActiveTasks = sortTasksByLocation(annotatedActiveTasks);
        }
        
        // Reload and update tasks
        const updatedTasks = await storage.loadTasks();
        
        if (sortInfo.parentId) {
            const parentResult = findTaskById(updatedTasks, sortInfo.parentId);
            if (parentResult?.task) {
                parentResult.task.subtasks = [...sortedActiveTasks, ...completedTasksToPreserve];
                await storage.saveTasks(updatedTasks);
            } else {
                throw new Error('Parent task not found');
            }
        } else {
            const allSubtasks = updatedTasks.filter(task => task.parentId);
            await storage.saveTasks([...sortedActiveTasks, ...completedTasksToPreserve, ...allSubtasks]);
        }
        
        await renderTasks();
    } catch (error) {
        console.error('Error sorting tasks:', error);
        alert('Failed to sort tasks. Please try again.');
    } finally {
        enableAllInteractions();
        restoreButtonState(aiSortButton, originalText);
    }
};

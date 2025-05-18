/**
 * Storage functions for the Todo app
 * Handles both local storage and server API interactions
 */
import { getCurrentDate } from './utils.js';

// Storage state
let isSharedList = false;
let shareId = null;
let sharedListFocusId = null;
let activeDate = getCurrentDate();

// Initialize the storage state based on URL parameters
export const initializeStorageState = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('share')) {
        shareId = urlParams.get('share');
        isSharedList = true;
        sharedListFocusId = null;
        return { isSharedList, shareId };
    }
    return { isSharedList, shareId };
};

// Set the active date
export const setActiveDate = (date) => {
    activeDate = date;
};

// Get the active date
export const getActiveDate = () => activeDate;

// Check if we're viewing a shared list
export const getIsSharedList = () => isSharedList;

// Get the share ID
export const getShareId = () => shareId;

// Get the focus ID for a shared list
export const getSharedListFocusId = () => sharedListFocusId;

// Set up for sharing (update state variables)
export const setupSharing = (newShareId) => {
    shareId = newShareId;
    isSharedList = true;
    sharedListFocusId = null;
};

// Get subscribed shared lists
export const getSubscribedLists = () => {
    const lists = localStorage.getItem('todoSubscribedLists');
    return lists ? JSON.parse(lists) : [];
};

// Save subscribed shared lists
export const saveSubscribedLists = (lists) => {
    localStorage.setItem('todoSubscribedLists', JSON.stringify(lists));
};

// Add a shared list to subscriptions
export const subscribeToSharedList = (id, title, url) => {
    const lists = getSubscribedLists();
    
    // Check if already subscribed
    const existingIndex = lists.findIndex(list => list.id === id);
    
    if (existingIndex >= 0) {
        // Update existing subscription
        lists[existingIndex] = { id, title, url, lastAccessed: new Date().toISOString() };
    } else {
        // Add new subscription
        lists.push({ id, title, url, lastAccessed: new Date().toISOString() });
    }
    
    saveSubscribedLists(lists);
    return lists;
};

// Remove a shared list from subscriptions
export const unsubscribeFromSharedList = (id) => {
    const lists = getSubscribedLists();
    const updatedLists = lists.filter(list => list.id !== id);
    saveSubscribedLists(updatedLists);
    return updatedLists;
};

// ----- Owned shared lists helpers -----

export const getOwnedLists = () => {
    const lists = localStorage.getItem('todoOwnedLists');
    return lists ? JSON.parse(lists) : [];
};

const saveOwnedLists = (lists) => {
    localStorage.setItem('todoOwnedLists', JSON.stringify(lists));
};

export const addOwnedList = (id) => {
    const lists = getOwnedLists();
    if (!lists.includes(id)) {
        lists.push(id);
        saveOwnedLists(lists);
    }
};

export const isOwnedList = (id) => {
    const lists = getOwnedLists();
    return lists.includes(id);
};

// Initialize storage
export const initializeStorage = async () => {
    if (isSharedList) {
        // For shared lists, try to load from server
        try {
            await loadTasksFromServer();
        } catch (error) {
            console.error('Failed to load shared list:', error);
            alert('Failed to load the shared todo list. It may have been deleted or the link is invalid.');
            // Fallback to empty list
            return [];
        }
    } else {
        // For local storage
        const tasksKey = `todoTasks_${activeDate}`;
        if (!localStorage.getItem(tasksKey)) {
            localStorage.setItem(tasksKey, '[]');
        }
        
        if (!localStorage.getItem('todoStickyTasks')) {
            localStorage.setItem('todoStickyTasks', '[]');
        }
    }
};

// Load tasks from server
export const loadTasksFromServer = async () => {
    try {
        const response = await fetch(`/api/lists/${shareId}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
        }
        const data = await response.json();
        sharedListFocusId = data.focusId || null;
        return data.tasks || [];
    } catch (error) {
        console.error('Error loading shared tasks:', error);
        throw error;
    }
};

// Save tasks to server
export const saveTasksToServer = async (tasks, focusId = null) => {
    try {
        const response = await fetch(`/api/lists/${shareId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(focusId ? { tasks, focusId } : { tasks })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error saving shared tasks:', error);
        alert('Failed to save changes to the shared list. Please try again.');
        throw error;
    }
};

// Create a shared list on the server
export const createSharedList = async (tasks, focusId = null) => {
    try {
        console.log('Creating shared list with API endpoint: /api/lists');
        console.log('Tasks to be shared:', tasks);
        
        const response = await fetch('/api/lists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(focusId ? { tasks, focusId } : { tasks })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Share response:', data);
        sharedListFocusId = focusId;
        return data.shareId;
    } catch (error) {
        console.error('Error creating shared list:', error);
        alert('Failed to create a shared list. Please try again. Error: ' + error.message);
        throw error;
    }
};

// Load tasks (either from local storage or server)
export const loadTasks = async () => {
    if (isSharedList) {
        // For shared lists, load from server
        try {
            return await loadTasksFromServer();
        } catch (error) {
            // If loading fails, return empty array
            return [];
        }
    } else {
        // For local storage
        const tasksKey = `todoTasks_${activeDate}`;
        const dateTasks = JSON.parse(localStorage.getItem(tasksKey) || '[]');
        const stickyTasks = JSON.parse(localStorage.getItem('todoStickyTasks') || '[]');
        
        const dateTaskIds = new Set(dateTasks.map(task => task.id));
        const filteredStickyTasks = stickyTasks.filter(stickyTask => !dateTaskIds.has(stickyTask.id));
        
        return [...dateTasks, ...filteredStickyTasks];
    }
};

// Save tasks (either to local storage or server)
export const saveTasks = async (tasks) => {
    if (isSharedList) {
        // For shared lists, save to server
        return await saveTasksToServer(tasks);
    } else {
        // For local storage
        const stickyTasks = tasks.filter(task => task.sticky);
        const nonStickyTasks = tasks.filter(task => !task.sticky);
        
        localStorage.setItem(`todoTasks_${activeDate}`, JSON.stringify(nonStickyTasks));
        localStorage.setItem('todoStickyTasks', JSON.stringify(stickyTasks));
    }
};

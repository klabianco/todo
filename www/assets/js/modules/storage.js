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

// Cached user data
let subscribedLists = [];
let ownedLists = [];

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

// Load user lists from server
export const loadUserLists = async () => {
    try {
        const res = await fetch('/api/user/subscriptions');
        if (res.ok) {
            const data = await res.json();
            subscribedLists = data.lists || [];
        }
    } catch (e) {
        console.error('Failed to load subscriptions', e);
    }

    try {
        const res = await fetch('/api/user/owned');
        if (res.ok) {
            const data = await res.json();
            ownedLists = data.lists || [];
        }
    } catch (e) {
        console.error('Failed to load owned lists', e);
    }
};

// Get subscribed shared lists
export const getSubscribedLists = () => subscribedLists;

// Save subscribed shared lists
export const saveSubscribedLists = (lists) => {
    subscribedLists = lists;
    fetch('/api/user/subscriptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists })
    });
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

export const getOwnedLists = () => ownedLists;

const saveOwnedLists = async (lists) => {
    ownedLists = lists;
    await fetch('/api/user/owned', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists })
    });
};

// Add a new owned list with optional date metadata
export const addOwnedList = (id, date = null) => {
    const lists = getOwnedLists();

    // Support legacy format where the list was just an array of IDs
    if (lists.length > 0 && typeof lists[0] !== 'object') {
        const converted = lists.map(existingId => ({ id: existingId, date: null }));
        lists.length = 0;
        lists.push(...converted);
    }

    if (!lists.some(list => list.id === id)) {
        lists.push({ id, date });
        saveOwnedLists(lists);
    }
};

// Check if a list ID is owned by the current user
export const isOwnedList = (id) => {
    const lists = getOwnedLists();
    if (lists.length > 0 && typeof lists[0] === 'object') {
        return lists.some(list => list.id === id);
    }
    return lists.includes(id);
};

// Get owned list entry for a specific date
export const getOwnedListByDate = (date) => {
    const lists = getOwnedLists();
    if (lists.length > 0 && typeof lists[0] === 'object') {
        return lists.find(list => list.date === date) || null;
    }
    return null;
};

// Fetch tasks for a specific shared list ID
const fetchTasksForOwnedList = async (id) => {
    try {
        const response = await fetch(`/api/lists/${id}`, { cache: 'no-cache' });
        if (!response.ok) return null;
        const data = await response.json();
        return data.tasks || null;
    } catch (err) {
        console.error('Failed to fetch owned list', err);
        return null;
    }
};

// Sync tasks from an owned list into local storage for the given date
export const syncOwnedListForDate = async (date) => {
    const entry = getOwnedListByDate(date);
    if (!entry) return;

    const tasks = await fetchTasksForOwnedList(entry.id);
    if (!tasks) return;
    await savePersonalTasksToServer(date, tasks);
};

// Push local tasks to the shared list if this date corresponds to an owned share
export const updateOwnedListForDate = async (date, tasks) => {
    const entry = getOwnedListByDate(date);
    if (!entry) return;

    try {
        await fetch(`/api/lists/${entry.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks })
        });
    } catch (err) {
        console.error('Failed to update owned shared list', err);
    }
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
        await loadUserLists();
        // If this date corresponds to an owned shared list, sync it from server
        await syncOwnedListForDate(activeDate);
    }
};

// Load tasks from server
export const loadTasksFromServer = async () => {
    try {
        const response = await fetch(`/api/lists/${shareId}`, { cache: 'no-cache' });
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

// Personal tasks helpers
async function loadPersonalTasksFromServer(date) {
    try {
        const response = await fetch(`/api/user/tasks/${date}`, { cache: 'no-cache' });
        if (!response.ok) return [];
        const data = await response.json();
        return data.tasks || [];
    } catch (e) {
        console.error('Failed to load personal tasks', e);
        return [];
    }
}

async function savePersonalTasksToServer(date, tasks) {
    try {
        await fetch(`/api/user/tasks/${date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks })
        });
        // If these tasks belong to a shared list we own, update that list too
        await updateOwnedListForDate(date, tasks);
    } catch (e) {
        console.error('Failed to save personal tasks', e);
    }
}

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
        // Personal list stored on server
        return await loadPersonalTasksFromServer(activeDate);
    }
};

// Save tasks (either to local storage or server)
export const saveTasks = async (tasks) => {
    if (isSharedList) {
        // For shared lists, save to server
        return await saveTasksToServer(tasks);
    } else {
        // Personal list stored on server
        await savePersonalTasksToServer(activeDate, tasks);
    }
};

// ----- Real-time updates via polling -----
let pollingIntervalId = null;
let lastModified = null;

export const connectToUpdates = (onUpdate) => {
    if (!isSharedList || !shareId) return;

    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
    }

    const poll = async () => {
        try {
            const res = await fetch(`/api/lists/${shareId}`, { cache: 'no-cache' });
            if (!res.ok) return;
            const data = await res.json();
            if (lastModified !== data.lastModified) {
                lastModified = data.lastModified;
                if (onUpdate) onUpdate(data);
            }
        } catch (err) {
            console.error('Polling error', err);
        }
    };

    poll();
    pollingIntervalId = setInterval(poll, 5000);
};

export const disconnectUpdates = () => {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    lastModified = null;
};

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

// User ID backup key for localStorage (helps with WebView cookie issues)
const USER_ID_BACKUP_KEY = 'todo_user_id_backup';

// Helper to get cookie value by name
const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
};

// Helper to set cookie
const setCookie = (name, value, days = 365) => {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=None; Secure`;
};

// Restore user ID from localStorage backup if cookie is missing
// This helps with WebView cookie persistence issues
export const restoreUserIdIfNeeded = () => {
    const cookieUserId = getCookie('todoUserId');
    const backupUserId = localStorage.getItem(USER_ID_BACKUP_KEY);
    
    if (!cookieUserId && backupUserId) {
        // Cookie missing but we have a backup - restore it
        console.log('Restoring user ID from localStorage backup');
        setCookie('todoUserId', backupUserId);
        return backupUserId;
    }
    
    if (cookieUserId && !backupUserId) {
        // Cookie exists but no backup - create backup
        localStorage.setItem(USER_ID_BACKUP_KEY, cookieUserId);
    }
    
    return cookieUserId;
};

// Backup user ID to localStorage after successful API response
const backupUserIdFromResponse = (response) => {
    // Check if the response set a new cookie (via Set-Cookie header parsing isn't possible,
    // but we can read the current cookie after the response)
    setTimeout(() => {
        const userId = getCookie('todoUserId');
        if (userId) {
            localStorage.setItem(USER_ID_BACKUP_KEY, userId);
        }
    }, 100);
};

// Cached user data
let subscribedLists = [];
let ownedLists = [];
let tasks = []; // Added missing tasks array declaration

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
    // Load subscriptions
    try {
        const res = await fetch('/api/user/subscriptions');
        if (res.ok) {
            const { lists = [] } = await res.json();
            subscribedLists = lists;
            
            // Validate subscriptions in parallel
            const validationPromises = subscribedLists.map(async (list) => {
                try {
                    const checkRes = await fetch(`/api/lists/${list.id}?t=${Date.now()}`, {
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-store'
                    });
                    return checkRes.ok ? list : null;
                } catch (err) {
                    console.error(`Error checking list ${list.id}:`, err);
                    return null;
                }
            });
            
            const validatedLists = (await Promise.all(validationPromises)).filter(Boolean);
            
            if (validatedLists.length !== subscribedLists.length) {
                subscribedLists = validatedLists;
                await saveSubscribedLists(validatedLists);
            }
        }
    } catch (e) {
        console.error('Failed to load subscriptions', e);
    }

    // Load owned lists
    try {
        const res = await fetch('/api/user/owned');
        if (res.ok) {
            const { lists = [] } = await res.json();
            ownedLists = lists;
        }
    } catch (e) {
        console.error('Failed to load owned lists', e);
    }
};

// Get subscribed shared lists
export const getSubscribedLists = () => subscribedLists;

// Save subscribed shared lists
export const saveSubscribedLists = async (lists) => {
    subscribedLists = lists;
    try {
        const response = await fetch('/api/user/subscriptions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lists })
        });
        
        if (!response.ok) {
            console.error('Failed to save subscriptions:', response.status);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Error saving subscriptions:', err);
        return false;
    }
};

// Add a shared list to subscriptions
export const subscribeToSharedList = async (id, title, url) => {
    if (!id) {
        console.error('Cannot subscribe to a shared list without an ID');
        return getSubscribedLists();
    }
    
    // Don't subscribe to your own lists
    if (isOwnedList(id)) {
        return getSubscribedLists();
    }
    
    // Verify the list exists
    try {
        const response = await fetch(`/api/lists/${id}?t=${Date.now()}`, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            console.error(`Cannot subscribe to list ${id} - it does not exist`);
            return getSubscribedLists();
        }
    } catch (err) {
        console.error(`Error checking list ${id} existence:`, err);
        return getSubscribedLists();
    }
    
    // Get current subscriptions and update/add
    const lists = getSubscribedLists();
    const existingIndex = lists.findIndex(list => list.id === id);
    const subscription = { id, title, url, lastAccessed: new Date().toISOString() };
    
    if (existingIndex >= 0) {
        lists[existingIndex] = subscription;
    } else {
        lists.push(subscription);
    }
    
    // Save changes both in memory and to the server
    const saveResult = await saveSubscribedLists(lists);
    
    // Add a backup - store in localStorage too for redundancy
    try {
        localStorage.setItem('todo_subscribed_lists', JSON.stringify(lists));
    } catch (err) {
        console.error('Error saving subscription backup to localStorage:', err);
    }
    
    if (saveResult) {
    } else {
        console.error(`Failed to save subscription for list ${id}`);
    }
    
    return lists;
};

// Remove a shared list from subscriptions
export const unsubscribeFromSharedList = (id) => {
    const lists = getSubscribedLists();
    const updatedLists = lists.filter(list => list.id !== id);
    saveSubscribedLists(updatedLists);
    return updatedLists;
};

// Delete a shared list completely (only available to owners)
export const deleteSharedList = async (id) => {
    try {
        const response = await fetch(`/api/lists/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            console.error('Failed to delete shared list:', response.status);
            return false;
        }
        
        // Remove from owned lists
        const lists = getOwnedLists();
        const updatedLists = lists.filter(list => {
            if (typeof list === 'object') {
                return list.id !== id;
            }
            return list !== id; // Support legacy format
        });
        await saveOwnedLists(updatedLists);
        
        return true;
    } catch (err) {
        console.error('Error deleting shared list:', err);
        return false;
    }
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
        const response = await fetch(`/api/lists/${id}?t=${Date.now()}`, { 
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store' 
        });
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
    if (!entry) {
        return;
    }
    
    try {
        // Fetch the latest tasks from the shared list
        const tasks = await fetchTasksForOwnedList(entry.id);
        if (!tasks) {
            return;
        }
        
        
        // Save these tasks to the personal list for this date
        await savePersonalTasksToServer(date, tasks);
        
        // Update our local tasks array if this is the active date
        if (date === activeDate && !isSharedList) {
            // Update the module-level tasks array with the latest tasks
            updateTasks(tasks);
            
            // Force re-render of the task list UI
            document.dispatchEvent(new CustomEvent('tasksUpdated', { detail: { tasks } }));
        }
        
        return tasks;
    } catch (err) {
        console.error(`Error syncing owned list for date ${date}:`, err);
    }
};

// Push local tasks to the shared list if this date corresponds to an owned share
export const updateOwnedListForDate = async (date, tasks) => {
    const entry = getOwnedListByDate(date);
    if (!entry) return;

    try {
        // Explicitly include lastModified to force update for viewers
        const response = await fetch(`/api/lists/${entry.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tasks,
                lastModified: new Date().toISOString() // Force timestamp update
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        return true;
    } catch (err) {
        console.error('Failed to update owned shared list', err);
        return false;
    }
};

// Initialize storage
export const initializeStorage = async () => {
    // Restore user ID from localStorage backup if cookie is missing (WebView fix)
    restoreUserIdIfNeeded();
    
    if (isSharedList) {
        // For shared lists, try to load from server
        try {
            await loadTasks(); // Using loadTasks instead of loadTasksFromServer
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
    
    // Backup user ID after successful initialization
    const userId = getCookie('todoUserId');
    if (userId) {
        localStorage.setItem(USER_ID_BACKUP_KEY, userId);
    }
};

// Update tasks in memory (used for real-time updates)
export const updateTasks = (newTasks) => {
    if (Array.isArray(newTasks)) {
        tasks = newTasks;
        return true;
    }
    return false;
};

// Save tasks to server
export const saveTasksToServer = async (tasks, focusId = null) => {
    try {
        // Always include lastModified to force update for all viewers
        const response = await fetch(`/api/lists/${shareId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tasks,
                focusId: focusId || null,
                lastModified: new Date().toISOString() // Force timestamp update
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        
        // Refresh our polling timestamp to prevent our own changes from triggering
        // the update notification
        lastModified = new Date().toISOString();
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
/**
 * Creates a new shared list on the server with the provided tasks and optional focus ID
 * @param {Array} tasks - The tasks to share
 * @param {string|null} focusId - Optional ID of the focused task
 * @returns {Promise<string>} The new unique share ID
 */
export const createSharedList = async (tasks, focusId = null) => {
    try {
        
        // Generate a timestamp to guarantee uniqueness
        const timestamp = Date.now();
        
        const response = await fetch('/api/lists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tasks,
                focusId: focusId || null,
                timestamp
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error creating shared list:', errorText);
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        sharedListFocusId = focusId;
        return data.shareId;
    } catch (error) {
        console.error('Error creating shared list:', error);
        alert('Failed to create a shared list. Please try again. Error: ' + error.message);
        throw error;
    }
};

// Update an existing shared list with current tasks
export const updateSharedList = async (shareId, tasks, focusId = null) => {
    try {
        
        const response = await fetch(`/api/lists/${shareId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(focusId ? { tasks, focusId } : { tasks })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error updating shared list:', errorText);
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }
        
        sharedListFocusId = focusId;
        return true;
    } catch (error) {
        console.error('Error updating shared list:', error);
        alert('Failed to update the shared list. Please try again. Error: ' + error.message);
        throw error;
    }
};

// Load tasks (either from local storage or server)
export const loadTasks = async () => {
    if (isSharedList) {
        // For shared lists, load from server
        try {
            // Direct implementation instead of calling loadTasksFromServer
            const response = await fetch(`/api/lists/${shareId}?t=${Date.now()}`, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
            }
            const data = await response.json();
            sharedListFocusId = data.focusId || null;
            tasks = data.tasks || [];
            return tasks;
        } catch (error) {
            console.error('Error loading shared list:', error);
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
        
        // CRITICAL FIX: Also update any owned shared list for this date
        // This ensures changes made in personal view update the shared list
        const ownedList = getOwnedListByDate(activeDate);
        if (ownedList && ownedList.id) {
            await updateOwnedListForDate(activeDate, tasks);
        }
    }
};

// ----- Real-time updates via polling -----
let pollingIntervalId = null;
let personalPollingIntervalIds = {}; // Track polling for each owned list
let ownedListsLastModified = {}; // Track last modified for owned lists
let lastModified = null; // Track last modified timestamp for shared list

/**
 * Connect to real-time updates for a shared list
 * @param {string} shareId - The ID of the shared list to monitor
 * @param {Function} onUpdate - Callback function to run when updates are detected
 */
export const connectToUpdates = (shareId, onUpdate) => {
    if (!shareId) return;

    // First, disconnect any existing connection
    disconnectUpdates();

    // Reset the module-level last modified timestamp
    lastModified = null;

    // Function to poll for updates
    const poll = async () => {
        try {
            const res = await fetch(`/api/lists/${shareId}?t=${Date.now()}`, {
                cache: 'no-store'
            });

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const data = await res.json();

            // Initialize lastModified on first poll
            if (lastModified === null) {
                lastModified = data.lastModified;
                return; // Just set the initial value, don't process updates yet
            }

            // Check if the list has been updated
            if (lastModified !== data.lastModified) {

                // Update our timestamp
                lastModified = data.lastModified;

                // Update tasks in memory
                if (data.tasks) {
                    updateTasks(data.tasks);
                }

                // Call the callback with the updated data
                if (onUpdate) onUpdate(data);
            }
        } catch (err) {
            console.error(`Polling error for ${shareId}:`, err.message);
        }
    };

    // Start polling
    poll(); // Initial poll
    pollingIntervalId = setInterval(poll, 3000); // Check every 3 seconds
};

/**
 * Connect to updates for owned lists when viewing personal list
 * @param {Function} onUpdate - Callback function to run when updates are detected
 */
export const connectToOwnedListsUpdates = async (onUpdate) => {
    // Clean up any existing polling
    disconnectOwnedListsUpdates();

    // Get owned lists
    const ownedLists = getOwnedLists();
    if (!ownedLists || ownedLists.length === 0) {
        return;
    }
    
    // We only need to track the list for the current date
    // First try to get the owned list for the current date
    const currentDateList = getOwnedListByDate(activeDate);
    
    if (!currentDateList || !currentDateList.id) {
        return;
    }
    
    const listId = currentDateList.id;
    
    // Initialize last modified tracking
    ownedListsLastModified[listId] = null;

    // Create polling function for this list
    const pollList = async () => {
        try {
            // Add cache-busting timestamp and no-store cache policy
            const res = await fetch(`/api/lists/${listId}?t=${Date.now()}`, { 
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!res.ok) {
                return;
            }

            const data = await res.json();
            
            // Initialize the last modified timestamp on first poll
            if (ownedListsLastModified[listId] === null) {
                ownedListsLastModified[listId] = data.lastModified;
                return; // Just initialize, don't process updates yet
            }
            
            // Check if the list has been updated
            if (ownedListsLastModified[listId] !== data.lastModified) {
                ownedListsLastModified[listId] = data.lastModified;
                
                // Load the tasks from server for the current active date
                await syncOwnedListForDate(activeDate);
                
                // Call the update callback with the data from the shared list
                if (onUpdate) {
                    onUpdate(data);
                }
            }
        } catch (err) {
            console.error(`Polling error for list ${listId}:`, err.message);
        }
    };
    
    // Start polling
    pollList(); // Initial poll
    personalPollingIntervalIds[listId] = setInterval(pollList, 2000); // 2 seconds for real-time updates
};

export const disconnectUpdates = () => {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    lastModified = null;
    
    // Also disconnect owned lists polling
    disconnectOwnedListsUpdates();
};

// Disconnect polling for owned lists
export const disconnectOwnedListsUpdates = () => {
    // Clear all polling intervals
    Object.values(personalPollingIntervalIds).forEach(intervalId => {
        clearInterval(intervalId);
    });
    
    // Reset tracking
    personalPollingIntervalIds = {};
    ownedListsLastModified = {};
};

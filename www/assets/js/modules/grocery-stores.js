/**
 * Grocery Stores management module
 * Handles storage and retrieval of grocery stores and selected store
 * Stores are shared across all users via server API
 */

const SELECTED_STORE_STORAGE_KEY = 'todo_selected_grocery_store';

// Helper function for API calls with error handling
const apiCall = async (url, options = {}) => {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `API request failed: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
};

// Load grocery stores from server
export const loadGroceryStores = async () => {
    try {
        const data = await apiCall(`/api/grocery-stores?t=${Date.now()}`, { 
            cache: 'no-store' 
        });
        return data.stores || [];
    } catch (error) {
        // Return empty array if fetch fails
        return [];
    }
};

// Get selected grocery store for current list
export const getSelectedGroceryStore = () => {
    try {
        const stored = localStorage.getItem(SELECTED_STORE_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        console.error('Error loading selected grocery store:', error);
        return null;
    }
};

// Set selected grocery store for current list
export const setSelectedGroceryStore = (store) => {
    try {
        if (store) {
            localStorage.setItem(SELECTED_STORE_STORAGE_KEY, JSON.stringify(store));
        } else {
            localStorage.removeItem(SELECTED_STORE_STORAGE_KEY);
        }
        return true;
    } catch (error) {
        console.error('Error saving selected grocery store:', error);
        return false;
    }
};

// Helper to update selected store if needed
const updateSelectedStoreIfNeeded = (storeId, updatedStore = null) => {
    const selected = getSelectedGroceryStore();
    if (selected && selected.id === storeId) {
        setSelectedGroceryStore(updatedStore);
    }
};

// Add a new grocery store
export const addGroceryStore = async (name) => {
    const data = await apiCall('/api/grocery-stores', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
    });
    return data.store;
};

// Update an existing grocery store
export const updateGroceryStore = async (id, newName) => {
    const data = await apiCall(`/api/grocery-stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName.trim() })
    });
    
    // Update selected store if it was the one being edited
    updateSelectedStoreIfNeeded(id, data.store);
    
    return data.store;
};

// Delete a grocery store
export const deleteGroceryStore = async (id) => {
    await apiCall(`/api/grocery-stores/${id}`, {
        method: 'DELETE'
    });
    
    // Clear selected store if it was deleted
    updateSelectedStoreIfNeeded(id, null);
    
    return true;
};

// Get a grocery store by ID
export const getGroceryStoreById = async (id) => {
    const stores = await loadGroceryStores();
    return stores.find(store => store.id === id) || null;
};


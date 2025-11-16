/**
 * Store detail page functionality
 */
import { loadStoresFromAPI } from './stores-page.js';
import { uploadPhoto } from './photo-utils.js';
import { handleMultiplePhotoUploads, renderPhoto } from './store-photo-utils.js';
import { normalizeAisleLayout } from './store-utils.js';
import { escapeHtml, $ } from './utils.js';

// Render store info HTML
export const renderStoreInfo = (store) => {
    const detailParts = [];
    if (store.city || store.state) {
        const location = [store.city, store.state].filter(Boolean).join(', ');
        if (location) detailParts.push(`<div class="text-gray-600 dark:text-gray-400 mb-2"><strong>Location:</strong> ${escapeHtml(location)}</div>`);
    }
    if (store.phone) {
        detailParts.push(`<div class="text-gray-600 dark:text-gray-400 mb-2"><strong>Phone:</strong> ${escapeHtml(store.phone)}</div>`);
    }
    if (store.created) {
        const createdDate = new Date(store.created).toLocaleDateString();
        detailParts.push(`<div class="text-xs text-gray-500 dark:text-gray-500 mt-2 mb-4">Added: ${createdDate}</div>`);
    }
    
    // Aisle layout section
    const layoutText = normalizeAisleLayout(store.aisle_layout);
    
    if (layoutText) {
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Store Layout - Item Locations</h3>
                <div class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-700 p-4 rounded-md border border-gray-200 dark:border-gray-600">${escapeHtml(layoutText)}</div>
            </div>
        `);
    } else {
        // Show message if no layout available
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="text-gray-500 dark:text-gray-400 italic">No store layout information available.</div>
            </div>
        `);
    }
    
    return detailParts.join('');
};

// Load and display store
export const loadStore = async (storeId, elements) => {
    try {
        elements.loading.classList.remove('hidden');
        elements.container.classList.add('hidden');
        elements.error.classList.add('hidden');
        
        const stores = await loadStoresFromAPI();
        const store = stores.find(s => s.id === storeId);
        
        if (!store) {
            throw new Error('Store not found');
        }
        
        elements.name.textContent = escapeHtml(store.name);
        elements.info.innerHTML = renderStoreInfo(store);
        
        const photos = store.photos || [];
        if (photos.length > 0) {
            elements.photosGrid.innerHTML = photos.map(photo => renderPhoto(photo, storeId, 'large')).join('');
        } else {
            elements.photosGrid.innerHTML = '<p class="col-span-3 text-center text-gray-500 dark:text-gray-400 py-8">No photos yet. Add some photos to get started!</p>';
        }
        
        elements.loading.classList.add('hidden');
        elements.container.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading store:', error);
        elements.loading.classList.add('hidden');
        elements.error.classList.remove('hidden');
        throw error;
    }
};

// Handle photo deletion
export const handlePhotoDelete = async (storeId, photoId, onComplete) => {
    if (!confirm('Delete this photo?')) return;
    
    try {
        const response = await fetch(`/api/store-photos/${storeId}/${photoId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete photo');
        }
        
        if (onComplete) {
            await onComplete();
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        alert(`Failed to delete photo: ${error.message}`);
        throw error;
    }
};

// Setup photo upload handler
export const setupPhotoUpload = (storeId, inputElement, onComplete) => {
    inputElement.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            await handleMultiplePhotoUploads(
                storeId,
                files,
                async (id, file) => await uploadPhoto(`/api/store-photos/${id}`, file),
                onComplete
            );
            e.target.value = '';
        }
    });
};

// Setup photo delete handlers
export const setupPhotoDelete = (storeId, containerElement, onComplete) => {
    containerElement.addEventListener('click', async (e) => {
        if (e.target.closest('.delete-photo-btn')) {
            const btn = e.target.closest('.delete-photo-btn');
            const photoId = btn.dataset.photoId;
            if (photoId) {
                await handlePhotoDelete(storeId, photoId, onComplete);
            }
        }
    });
};

// Handle store deletion
export const handleStoreDelete = async (storeId) => {
    if (!confirm('Delete this store? This will also delete all associated photos.')) return;
    
    try {
        const response = await fetch(`/api/grocery-stores/${storeId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete store');
        }
        
        // Redirect to stores listing page
        window.location.href = '/stores.php';
    } catch (error) {
        console.error('Error deleting store:', error);
        alert(`Failed to delete store: ${error.message}`);
        throw error;
    }
};


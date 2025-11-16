/**
 * Store detail page functionality
 */
import { loadStoresFromAPI } from './stores-page.js';
import { handleMultiplePhotoUploads, renderPhoto } from './store-photo-utils.js';
import { normalizeAisleLayout } from './store-utils.js';
import { escapeHtml, $, formatStoreLocation } from './utils.js';

// Render store info HTML
export const renderStoreInfo = (store) => {
    const detailParts = [];
    const location = formatStoreLocation(store.city, store.state);
    if (location) {
        detailParts.push(`<div class="text-gray-600 dark:text-gray-400 mb-2"><strong>Location:</strong> ${escapeHtml(location)}</div>`);
    }
    if (store.phone) {
        detailParts.push(`<div class="text-gray-600 dark:text-gray-400 mb-2"><strong>Phone:</strong> ${escapeHtml(store.phone)}</div>`);
    }
    if (store.created) {
        const createdDate = new Date(store.created).toLocaleDateString();
        detailParts.push(`<div class="text-xs text-gray-500 dark:text-gray-500 mt-2 mb-4">Added: ${createdDate}</div>`);
    }
    
    // Layout description section
    if (store.layout_description) {
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Store Layout Description</h3>
                <div class="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-4 rounded-md border border-gray-200 dark:border-gray-600 whitespace-pre-wrap">${escapeHtml(store.layout_description)}</div>
            </div>
        `);
    }
    
    // Aisle layout section - handle both JSON array format and legacy string format
    let aisleLayout = store.aisle_layout;
    
    // If it's already an array, use it directly (most common case)
    if (!Array.isArray(aisleLayout)) {
        // Try to parse if it's a JSON string
        if (typeof aisleLayout === 'string') {
            try {
                const parsed = JSON.parse(aisleLayout);
                if (Array.isArray(parsed)) {
                    aisleLayout = parsed;
                } else {
                    aisleLayout = normalizeAisleLayout(aisleLayout);
                }
            } catch (e) {
                aisleLayout = normalizeAisleLayout(aisleLayout);
            }
        } else {
            aisleLayout = normalizeAisleLayout(aisleLayout);
        }
    }
    
    if (Array.isArray(aisleLayout) && aisleLayout.length > 0) {
        // New JSON array format
        const sectionsHtml = aisleLayout.map(aisle => {
            const aisleNumber = escapeHtml(aisle.aisle_number || 'Unknown');
            const category = aisle.category ? `<span class="text-xs text-gray-500 dark:text-gray-400 ml-2">(${escapeHtml(aisle.category)})</span>` : '';
            const items = Array.isArray(aisle.items) ? aisle.items.map(item => escapeHtml(item)).join(', ') : '';
            
            return `
                <div class="py-3 px-4">
                    <div class="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                        ${aisleNumber}${category}
                    </div>
                    ${items ? `<div class="text-gray-600 dark:text-gray-400 text-sm">${items}</div>` : ''}
                </div>
            `;
        }).join('');
        
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Item Locations by Section</h3>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                    ${sectionsHtml}
                </div>
            </div>
        `);
    } else if (aisleLayout && typeof aisleLayout === 'string') {
        // Legacy string format
        const sections = aisleLayout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        const sectionsHtml = sections.map(section => {
            // Split section name and description (format: "Section Name: description")
            const colonIndex = section.indexOf(':');
            if (colonIndex > 0) {
                const sectionName = section.substring(0, colonIndex).trim();
                const description = section.substring(colonIndex + 1).trim();
                return `
                    <div class="py-3 px-4">
                        <div class="font-semibold text-gray-800 dark:text-gray-200 mb-1">${escapeHtml(sectionName)}</div>
                        <div class="text-gray-600 dark:text-gray-400 text-sm">${escapeHtml(description)}</div>
                    </div>
                `;
            } else {
                // No colon, treat entire line as section name
                return `
                    <div class="py-3 px-4">
                        <div class="font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(section)}</div>
                    </div>
                `;
            }
        }).join('');
        
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Item Locations by Section</h3>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                    ${sectionsHtml}
                </div>
            </div>
        `);
    } else if (!store.layout_description) {
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
            await handleMultiplePhotoUploads(storeId, files, onComplete);
            e.target.value = '';
        }
    });
};

// Setup photo delete handlers
export const setupPhotoDelete = (storeId, containerElement, onComplete) => {
    containerElement.addEventListener('click', async (e) => {
        // Handle delete button clicks
        if (e.target.closest('.delete-photo-btn')) {
            e.stopPropagation(); // Prevent triggering photo view
            const btn = e.target.closest('.delete-photo-btn');
            const photoId = btn.dataset.photoId;
            if (photoId) {
                await handlePhotoDelete(storeId, photoId, onComplete);
            }
            return;
        }
        
        // Handle photo view clicks
        const photoContainer = e.target.closest('.view-photo');
        if (photoContainer) {
            const photoUrl = photoContainer.dataset.photoUrl;
            if (photoUrl) {
                showPhotoModal(photoUrl);
            }
        }
    });
};

// Show photo in modal
const showPhotoModal = (photoUrl) => {
    const modal = document.getElementById('photo-modal');
    const image = document.getElementById('photo-modal-image');
    if (modal && image) {
        image.src = photoUrl;
        modal.classList.remove('hidden');
        // Prevent body scroll when modal is open
        document.body.style.overflow = 'hidden';
    }
};

// Hide photo modal
const hidePhotoModal = () => {
    const modal = document.getElementById('photo-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

// Setup photo modal handlers
export const setupPhotoModal = () => {
    const closeButton = document.getElementById('close-photo-modal');
    const modal = document.getElementById('photo-modal');
    
    if (closeButton) {
        closeButton.addEventListener('click', hidePhotoModal);
    }
    
    if (modal) {
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hidePhotoModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                hidePhotoModal();
            }
        });
    }
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


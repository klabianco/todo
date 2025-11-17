/**
 * Store detail page functionality
 */
import { loadStoresFromAPI } from './stores-page.js';
import { normalizeAisleLayout } from './store-utils.js';
import { escapeHtml, $, formatStoreLocation, apiFetch } from './utils.js';

// Helper function for API calls with error handling
const apiCall = async (url, options = {}) => {
    try {
        const { timeout, ...fetchOptions } = options;
        const response = await apiFetch(url, {
            ...fetchOptions,
            timeout: timeout,
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

// Render store info HTML
export const renderStoreInfo = (store, onSectionUpdate = null) => {
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
    
    // Ensure aisleLayout is an array (even if empty)
    if (!Array.isArray(aisleLayout)) {
        aisleLayout = [];
    }
    
    // Always show the section management UI, even if there are no sections
    if (Array.isArray(aisleLayout)) {
        // New JSON array format with edit/delete/add functionality
        const sectionId = (aisle, index) => `section-${index}-${(aisle.aisle_number || 'unknown').replace(/\s+/g, '-').toLowerCase()}`;
        
        const sectionsHtml = aisleLayout.length > 0 ? aisleLayout.map((aisle, index) => {
            if (!aisle || typeof aisle !== 'object') {
                return '';
            }
            
            const aisleNumber = escapeHtml(aisle.aisle_number || 'Unknown');
            const category = aisle.category ? `<span class="text-xs text-gray-500 dark:text-gray-400 ml-2">(${escapeHtml(aisle.category)})</span>` : '';
            
            // Ensure items is an array and format it
            let items = '';
            if (Array.isArray(aisle.items)) {
                items = aisle.items.filter(item => item != null).map(item => escapeHtml(String(item))).join(', ');
            } else if (aisle.items != null) {
                if (typeof aisle.items === 'string') {
                    items = escapeHtml(aisle.items);
                } else {
                    items = '';
                }
            }
            
            // Get section photos
            const sectionPhotos = Array.isArray(aisle.photos) ? aisle.photos : [];
            const photoCount = sectionPhotos.length;
            
            return `
                <div class="section-item py-4 px-4" data-section-index="${index}">
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                                <span class="section-title-display">${aisleNumber}</span>${category}
                            </div>
                            <div class="section-items-display text-gray-600 dark:text-gray-400 text-sm mt-1">
                                ${items ? `<div>${items}</div>` : '<div class="text-gray-400 italic">No items listed</div>'}
                            </div>
                        </div>
                        <div class="flex gap-2 ml-4">
                            <button class="edit-section-btn text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm" data-section-index="${index}" title="Edit section">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                </svg>
                            </button>
                            <button class="delete-section-btn text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm" data-section-index="${index}" title="Delete section">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Section Photos -->
                    <div class="section-photos mt-3">
                        <div class="flex items-center justify-start mb-2">
                            <label class="cursor-pointer">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    multiple
                                    class="hidden section-photo-input" 
                                    data-section-index="${index}"
                                />
                                <span class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded inline-flex items-center">
                                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                    </svg>
                                    Add Photos
                                </span>
                            </label>
                        </div>
                        <div class="section-photos-grid grid grid-cols-4 gap-2" data-section-index="${index}">
                            ${sectionPhotos.map(photo => {
                                const photoUrl = `/api/store-photos/${store.id}/${photo.id}`;
                                return `
                                    <div class="relative group view-photo cursor-pointer" data-photo-url="${photoUrl}">
                                        <img src="${photoUrl}" alt="Section photo" class="w-full h-20 object-cover rounded border border-gray-300 dark:border-gray-600">
                                        <button class="delete-section-photo-btn absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-section-index="${index}" data-photo-id="${photo.id}">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                            </svg>
                                        </button>
                                    </div>
                                `;
                            }).join('')}
                            ${photoCount === 0 ? '<div class="col-span-4 text-xs text-gray-400 text-center py-2">No photos yet</div>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('') : '<div class="py-8 text-center text-gray-500 dark:text-gray-400 italic">No sections yet. Add your first section using the buttons above!</div>';
        
        detailParts.push(`
            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Item Locations by Section</h3>
                    <div class="flex gap-2">
                        <label class="cursor-pointer">
                            <input 
                                type="file" 
                                accept="image/*" 
                                class="hidden add-section-photo-input" 
                                id="add-section-photo-input"
                            />
                            <span class="text-sm bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md inline-flex items-center">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                                Add Section from Photo
                            </span>
                        </label>
                        <button id="add-section-btn" class="text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md inline-flex items-center">
                            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                            </svg>
                            Add Section Manually
                        </button>
                    </div>
                </div>
                <div class="bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 ${aisleLayout.length > 0 ? 'divide-y divide-gray-200 dark:divide-gray-600' : ''}">
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
export const loadStore = async (storeId, elements, onSectionUpdate = null) => {
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
        elements.info.innerHTML = renderStoreInfo(store, onSectionUpdate);
        
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
        await apiCall(`/api/store-photos/${storeId}/${photoId}`, {
            method: 'DELETE'
        });
        
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

// Handle section editing
export const setupSectionManagement = (storeId, onUpdate) => {
    const container = document.getElementById('store-info');
    if (!container) return;
    
    // Prevent duplicate event listeners by checking if already set up
    if (container.dataset.sectionManagementSetup === 'true') {
        return;
    }
    container.dataset.sectionManagementSetup = 'true';
    
    // Handle all click events via event delegation (only set up once)
    container.addEventListener('click', async (e) => {
        if (e.target.closest('#add-section-btn')) {
            e.preventDefault();
            const aisleNumber = prompt('Enter section/aisle name:');
            if (!aisleNumber) return;
            
            const category = prompt('Enter category (optional):') || '';
            const itemsInput = prompt('Enter items (comma-separated):') || '';
            const items = itemsInput.split(',').map(item => item.trim()).filter(Boolean);
            
            try {
                await apiCall(`/api/grocery-stores/${storeId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        action: 'add_section',
                        section: {
                            aisle_number: aisleNumber,
                            category: category,
                            items: items,
                            photos: []
                        }
                    })
                });
                
                if (onUpdate) await onUpdate();
            } catch (error) {
                console.error('Error adding section:', error);
                alert(`Failed to add section: ${error.message}`);
            }
        }
        
        // Edit section
        if (e.target.closest('.edit-section-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.edit-section-btn');
            const sectionIndex = parseInt(btn.dataset.sectionIndex);
            
            const sectionItem = btn.closest('.section-item');
            const titleDisplay = sectionItem.querySelector('.section-title-display');
            const itemsDisplay = sectionItem.querySelector('.section-items-display');
            
            const currentTitle = titleDisplay.textContent.trim();
            const currentItems = itemsDisplay.textContent.trim();
            
            const newTitle = prompt('Edit section name:', currentTitle);
            if (newTitle === null) return;
            
            const newCategory = prompt('Edit category (optional):', '') || '';
            const newItemsInput = prompt('Edit items (comma-separated):', currentItems);
            const newItems = newItemsInput ? newItemsInput.split(',').map(item => item.trim()).filter(Boolean) : [];
            
            try {
                await apiCall(`/api/grocery-stores/${storeId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        action: 'update_section',
                        section_index: sectionIndex,
                        section: {
                            aisle_number: newTitle,
                            category: newCategory,
                            items: newItems
                        }
                    })
                });
                
                if (onUpdate) await onUpdate();
            } catch (error) {
                console.error('Error updating section:', error);
                alert(`Failed to update section: ${error.message}`);
            }
        }
        
        // Delete section
        if (e.target.closest('.delete-section-btn')) {
            e.preventDefault();
            const btn = e.target.closest('.delete-section-btn');
            const sectionIndex = parseInt(btn.dataset.sectionIndex);
            
            if (!confirm('Delete this section? This will also delete all photos associated with it.')) return;
            
            try {
                await apiCall(`/api/grocery-stores/${storeId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        action: 'delete_section',
                        section_index: sectionIndex
                    })
                });
                
                if (onUpdate) await onUpdate();
            } catch (error) {
                console.error('Error deleting section:', error);
                alert(`Failed to delete section: ${error.message}`);
            }
        }
        
        // Delete section photo (handled in same click handler)
        if (e.target.closest('.delete-section-photo-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.delete-section-photo-btn');
            const sectionIndex = parseInt(btn.dataset.sectionIndex);
            const photoId = btn.dataset.photoId;
            
            if (!confirm('Delete this photo?')) return;
            
            try {
                await apiCall(`/api/grocery-stores/${storeId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        action: 'delete_section_photo',
                        section_index: sectionIndex,
                        photo_id: photoId
                    })
                });
                
                if (onUpdate) await onUpdate();
            } catch (error) {
                console.error('Error deleting section photo:', error);
                alert(`Failed to delete photo: ${error.message}`);
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
    
    // Handle all change events via event delegation (only set up once)
    container.addEventListener('change', async (e) => {
        // Add section from photo
        if (e.target.id === 'add-section-photo-input') {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            await handleAddSectionFromPhoto(storeId, files[0], onUpdate);
            e.target.value = '';
        }
        // Section photo upload
        else if (e.target.classList.contains('section-photo-input')) {
            const sectionIndex = parseInt(e.target.dataset.sectionIndex);
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            await handleSectionPhotoUpload(storeId, sectionIndex, files, onUpdate);
            e.target.value = '';
        }
    });
};

// Handle adding a new section from photo
const handleAddSectionFromPhoto = async (storeId, file, onUpdate) => {
    const { showLoadingOverlay, updateLoadingOverlay, hideLoadingOverlay } = await import('./overlay-utils.js');
    
    showLoadingOverlay('Creating section from photo...', 'Uploading and analyzing photo...');
    
    try {
        updateLoadingOverlay('Creating section from photo...', 'Uploading photo...');
        
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('create_new_section', '1');
        
        await apiFetch(`/api/store-photos/${storeId}`, {
            method: 'POST',
            body: formData,
            timeout: 600000 // 10 minutes for AI processing
        });
        
        if (onUpdate) await onUpdate();
    } catch (error) {
        console.error('Error creating section from photo:', error);
        alert(`Failed to create section from photo: ${error.message}`);
    } finally {
        hideLoadingOverlay();
    }
};

// Handle section-specific photo upload
const handleSectionPhotoUpload = async (storeId, sectionIndex, files, onUpdate) => {
    const { showLoadingOverlay, updateLoadingOverlay, hideLoadingOverlay } = await import('./overlay-utils.js');
    
    showLoadingOverlay('Uploading photos...', `Uploading ${files.length} photo(s) to section`);
    
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            updateLoadingOverlay('Uploading photos...', `Uploading photo ${i + 1} of ${files.length}`);
            
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('section_index', sectionIndex);
            
            await apiFetch(`/api/store-photos/${storeId}`, {
                method: 'POST',
                body: formData,
                timeout: 600000 // 10 minutes for AI processing
            });
        }
        
        if (onUpdate) await onUpdate();
    } catch (error) {
        console.error('Error uploading section photos:', error);
        alert(`Failed to upload photos: ${error.message}`);
    } finally {
        hideLoadingOverlay();
    }
};

// Handle store deletion
export const handleStoreDelete = async (storeId) => {
    if (!confirm('Delete this store? This will also delete all associated photos.')) return;
    
    try {
        await apiCall(`/api/grocery-stores/${storeId}`, {
            method: 'DELETE'
        });
        
        // Redirect to stores listing page
        window.location.href = '/stores.php';
    } catch (error) {
        console.error('Error deleting store:', error);
        alert(`Failed to delete store: ${error.message}`);
        throw error;
    }
};


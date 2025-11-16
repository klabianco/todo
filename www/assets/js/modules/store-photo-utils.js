/**
 * Photo utility functions for store pages
 */
import { showLoadingOverlay, updateLoadingOverlay, hideLoadingOverlay } from './overlay-utils.js';

// Get photo ID (handles both old string format and new object format)
export const getPhotoId = (photo) => {
    return typeof photo === 'string' ? photo : (photo.id || photo);
};

// Get photo date (taken if available, otherwise added)
export const getPhotoDate = (photo) => {
    if (typeof photo === 'string') {
        return null; // Old format, no date info
    }
    return photo.date_taken || photo.date_added || null;
};

// Format photo date for display
export const formatPhotoDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    } catch {
        return '';
    }
};

// Render a single photo
export const renderPhoto = (photo, storeId, size = 'large') => {
    const photoId = getPhotoId(photo);
    const photoDate = getPhotoDate(photo);
    const displayDate = formatPhotoDate(photoDate);
    const photoUrl = `/api/store-photos/${storeId}/${photoId}`;
    
    const sizeClasses = {
        small: 'h-24',
        large: 'h-64'
    };
    const heightClass = sizeClasses[size] || sizeClasses.large;
    
    return `
        <div class="relative group cursor-pointer view-photo" data-photo-url="${photoUrl}">
            <img 
                src="${photoUrl}" 
                alt="Store photo" 
                class="w-full ${heightClass} object-cover rounded-md"
                loading="lazy"
            />
            ${displayDate ? `
                <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                    ${displayDate}
                </div>
            ` : ''}
            <button 
                class="delete-photo-btn absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                data-photo-id="${photoId}"
                title="Delete photo"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;
};


// Handle multiple photo uploads with error reporting
export const handleMultiplePhotoUploads = async (storeId, files, onComplete) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    let successCount = 0;
    let errorCount = 0;
    let layoutUpdatedCount = 0;
    const errors = [];
    const layoutUpdates = [];
    
    // Show initial overlay
    if (fileArray.length === 1) {
        showLoadingOverlay(`Uploading and analyzing ${fileArray[0].name}...`);
    } else {
        showLoadingOverlay(`Uploading and analyzing ${fileArray.length} photos...`);
    }
    
    for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const current = i + 1;
        const total = fileArray.length;
        
        try {
            // Update status for current file
            if (fileArray.length > 1) {
                updateLoadingOverlay(`Uploading ${file.name} (${current}/${total})...`);
            } else {
                updateLoadingOverlay(`Uploading ${file.name}...`);
            }
            
            const formData = new FormData();
            formData.append('photo', file);
            
            const response = await fetch(`/api/store-photos/${storeId}`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to upload photo');
            }
            
            // Update status for AI analysis
            if (fileArray.length > 1) {
                updateLoadingOverlay(`Analyzing ${file.name} with AI (${current}/${total})...`);
            } else {
                updateLoadingOverlay(`Analyzing ${file.name} with AI...`);
            }
            
            const result = await response.json();
            successCount++;
            
            // Check for layout updates
            if (result.layout_updated) {
                layoutUpdatedCount++;
                const items = result.detected_items || [];
                const aisle = result.aisle || 'Unknown aisle';
                const category = result.category || '';
                layoutUpdates.push(`${file.name}: Detected ${items.length} items in ${aisle}${category ? ` (${category})` : ''}`);
            }
            
            // Log any analysis errors
            if (result.analysis_error) {
                errors.push(`${file.name}: AI analysis failed - ${result.analysis_error}`);
            }
        } catch (error) {
            errorCount++;
            errors.push(`${file.name}: ${error.message}`);
        }
    }
    
    // Reload store to show updated layout
    if (onComplete) {
        await onComplete();
    }
    
    // Hide overlay
    hideLoadingOverlay();
    
    // Only show alert if there are errors
    if (errorCount > 0) {
        const errorMsg = errors.length > 3 
            ? `${errors.slice(0, 3).join('\n')}\n...and ${errors.length - 3} more`
            : errors.join('\n');
        alert(`Failed to upload ${errorCount} photo(s):\n${errorMsg}`);
    }
};


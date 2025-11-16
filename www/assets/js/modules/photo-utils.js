/**
 * Shared utilities for photo uploads
 */

// Upload photo with error handling
export const uploadPhoto = async (url, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    
    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload photo');
    }
    
    return await response.json();
};


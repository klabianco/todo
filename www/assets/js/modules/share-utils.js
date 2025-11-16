/**
 * Shared utilities for share URL functionality
 */

// Setup share URL handlers
export const setupShareUrlHandlers = (prefix = '') => {
    const idPrefix = prefix ? `${prefix}-` : '';
    const shareUrlContainer = document.getElementById(`${idPrefix}share-url-container`);
    const shareUrlInput = document.getElementById(`${idPrefix}share-url`);
    const copyButton = document.getElementById(`copy-${idPrefix}share-url`);
    const closeButton = document.getElementById(`close-${idPrefix}share-url`);
    const shareButton = document.getElementById(`${idPrefix}share-button`);
    
    if (copyButton && shareUrlInput) {
        copyButton.addEventListener('click', () => {
            shareUrlInput.select();
            document.execCommand('copy');
            showNotification('Share link copied to clipboard!', 'success');
        });
    }
    
    if (closeButton && shareUrlContainer && shareButton) {
        closeButton.addEventListener('click', () => {
            shareUrlContainer.classList.add('hidden');
            shareButton.classList.remove('hidden');
        });
    }
};

// Show notification
export const showNotification = (message, type = 'success') => {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    notification.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded-md shadow-lg z-50`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
};

// Copy URL to clipboard and show share container
export const showShareUrl = (url, prefix = '') => {
    const idPrefix = prefix ? `${prefix}-` : '';
    const shareUrlContainer = document.getElementById(`${idPrefix}share-url-container`);
    const shareUrlInput = document.getElementById(`${idPrefix}share-url`);
    const shareButton = document.getElementById(`${idPrefix}share-button`);
    
    if (shareUrlInput) {
        shareUrlInput.value = url;
    }
    
    if (shareUrlContainer) {
        shareUrlContainer.classList.remove('hidden');
    }
    
    if (shareButton) {
        shareButton.classList.add('hidden');
    }
    
    if (shareUrlInput) {
        shareUrlInput.select();
        document.execCommand('copy');
    }
    
    showNotification('Share link copied to clipboard!', 'success');
};


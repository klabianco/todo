/**
 * Shared utilities for loading overlays
 */

// Escape HTML to prevent XSS
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Show loading overlay
export const showLoadingOverlay = (message = 'Processing...', subMessage = 'Please wait') => {
    // Remove any existing overlay
    hideLoadingOverlay();
    
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center';
    overlay.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl flex flex-col items-center">
            <svg class="animate-spin h-8 w-8 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="text-gray-700 dark:text-gray-200 font-medium">${escapeHtml(message)}</p>
            ${subMessage ? `<p class="text-sm text-gray-500 dark:text-gray-400 mt-2">${escapeHtml(subMessage)}</p>` : ''}
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
};

// Update loading overlay message
export const updateLoadingOverlay = (message, subMessage = null) => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        const messageEl = overlay.querySelector('p.font-medium');
        const subMessageEl = overlay.querySelector('p.text-sm');
        if (messageEl) {
            messageEl.textContent = message;
        }
        if (subMessageEl && subMessage !== null) {
            subMessageEl.textContent = subMessage;
        } else if (subMessage === null && subMessageEl) {
            subMessageEl.remove();
        }
    }
};

// Hide loading overlay
export const hideLoadingOverlay = () => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
};


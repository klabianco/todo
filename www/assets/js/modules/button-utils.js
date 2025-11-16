/**
 * Shared utilities for button state management
 */

// Set button loading state
export const setButtonLoading = (button, loadingText = 'Loading...') => {
    if (!button || button.disabled) return null;
    
    const originalText = button.textContent || button.innerHTML;
    button.disabled = true;
    button.textContent = loadingText;
    
    return originalText;
};

// Restore button state
export const restoreButtonState = (button, originalText) => {
    if (!button) return;
    button.disabled = false;
    if (originalText) {
        button.textContent = originalText;
    }
};

// Execute async action with button loading state
export const withButtonLoading = async (button, loadingText, asyncFn) => {
    const originalText = setButtonLoading(button, loadingText);
    try {
        return await asyncFn();
    } finally {
        restoreButtonState(button, originalText);
    }
};


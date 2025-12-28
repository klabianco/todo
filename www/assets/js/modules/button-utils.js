/**
 * Shared utilities for button state management
 */

// Set button loading state
export const setButtonLoading = (button, loadingHTML = 'Loading...') => {
    if (!button || button.disabled) return null;

    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingHTML;

    return originalHTML;
};

// Restore button state
export const restoreButtonState = (button, originalHTML) => {
    if (!button) return;
    button.disabled = false;
    if (originalHTML) {
        button.innerHTML = originalHTML;
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


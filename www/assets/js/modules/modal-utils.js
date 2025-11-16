/**
 * Shared utilities for modal functionality
 */

// Setup modal close handlers
export const setupModalCloseHandlers = (modalId, closeButtonId, cancelButtonId = null) => {
    const modal = document.getElementById(modalId);
    const closeButton = document.getElementById(closeButtonId);
    const cancelButton = cancelButtonId ? document.getElementById(cancelButtonId) : null;
    
    const closeModal = () => {
        if (modal) {
            modal.classList.add('hidden');
        }
    };
    
    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }
    
    if (cancelButton) {
        cancelButton.addEventListener('click', closeModal);
    }
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    return { modal, closeModal };
};

// Setup file input button
export const setupFileInputButton = (buttonId, inputId) => {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    
    if (button && input) {
        button.addEventListener('click', () => {
            input.click();
        });
    }
    
    return { button, input };
};


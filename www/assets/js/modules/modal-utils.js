/**
 * Shared utilities for modal functionality
 */
import { $ } from './utils.js';

// Show modal
export const showModal = (modalId) => {
    const modal = $(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
    return modal;
};

// Hide modal
export const hideModal = (modalId) => {
    const modal = $(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
    return modal;
};

// Setup modal close handlers
export const setupModalCloseHandlers = (modalId, closeButtonId, cancelButtonId = null) => {
    const modal = $(modalId);
    const closeButton = closeButtonId ? $(closeButtonId) : null;
    const cancelButton = cancelButtonId ? $(cancelButtonId) : null;
    
    const closeModal = () => hideModal(modalId);
    
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
    const button = $(buttonId);
    const input = $(inputId);
    
    if (button && input) {
        button.addEventListener('click', () => {
            input.click();
        });
    }
    
    return { button, input };
};


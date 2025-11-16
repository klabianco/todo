/**
 * Shared utilities for event listener setup
 */
import { $ } from './utils.js';

// Setup click handler for element
export const onClick = (elementId, handler) => {
    const element = typeof elementId === 'string' ? $(elementId) : elementId;
    if (element) {
        element.addEventListener('click', handler);
    }
    return element;
};

// Setup multiple click handlers at once
export const setupClickHandlers = (handlers) => {
    Object.entries(handlers).forEach(([id, handler]) => {
        onClick(id, handler);
    });
};

// Setup keyboard handler (e.g., Enter, Escape)
export const onKeyDown = (elementId, handler) => {
    const element = typeof elementId === 'string' ? $(elementId) : elementId;
    if (element) {
        element.addEventListener('keydown', handler);
    }
    return element;
};

// Setup keyboard handler for Ctrl/Cmd+Enter
export const onCtrlEnter = (elementId, handler) => {
    return onKeyDown(elementId, (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handler(e);
        }
    });
};


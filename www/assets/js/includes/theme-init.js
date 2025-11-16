/**
 * Initialize theme system
 * Shared script for theme initialization
 */
import { initializeTheme, toggleTheme } from '/assets/js/modules/theme.js';

// Initialize theme on page load
initializeTheme();

// Set up theme toggle button
const toggleButton = document.getElementById('theme-toggle');
if (toggleButton) {
    toggleButton.addEventListener('click', toggleTheme);
}


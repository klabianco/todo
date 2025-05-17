/**
 * Main entry point for the Todo application
 * Imports the modular components and initializes the app
 */
import { init } from './modules/app.js';

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});

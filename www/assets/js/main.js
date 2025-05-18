/**
 * Main entry point for the Todo application
 * Imports the modular components and initializes the app
 */
import { init } from './modules/app.js';
import { initializeTheme, toggleTheme } from './modules/theme.js';

// Initialize the application when the DOM is ready. If the script is
// injected after the DOMContentLoaded event has already fired, call
// `init` immediately so the application still starts.
function startApp() {
    initializeTheme();
    const toggleButton = document.getElementById('theme-toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleTheme);
    }
    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // DOM has already loaded, run immediately
    startApp();
}

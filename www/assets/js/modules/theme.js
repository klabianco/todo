const STORAGE_KEY = 'theme';

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
        updateThemeIcon('dark');
    } else {
        root.classList.remove('dark');
        updateThemeIcon('light');
    }
}

function updateThemeIcon(theme) {
    const toggleButton = document.getElementById('theme-toggle');
    if (!toggleButton) return;
    
    const sunIcon = toggleButton.querySelector('.sun-icon');
    const moonIcon = toggleButton.querySelector('.moon-icon');
    
    if (theme === 'dark') {
        // In dark mode, show the sun icon
        if (sunIcon) sunIcon.style.display = 'block';
        if (moonIcon) moonIcon.style.display = 'none';
    } else {
        // In light mode, show the moon icon
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'block';
    }
}

export function toggleTheme() {
    const current = localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
}

export function initializeTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved ? saved : (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
    
    // Initialize the icon state immediately to prevent both icons showing at once
    setTimeout(() => updateThemeIcon(theme), 0);
}

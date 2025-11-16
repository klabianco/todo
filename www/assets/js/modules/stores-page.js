/**
 * Stores page functionality
 * Shared utilities for displaying stores
 */
import { escapeHtml, apiFetch } from './utils.js';

// Load stores from API
export const loadStoresFromAPI = async () => {
    const response = await apiFetch('/api/grocery-stores');
    
    if (!response.ok) {
        throw new Error(`Failed to load stores: ${response.status}`);
    }
    
    const data = await response.json();
    return data.stores || [];
};

// Helper to parse store data
const parseStoreData = (store) => {
    const parts = store.name.split('\n');
    return {
        name: parts[0],
        details: parts.slice(1).join('\n'),
        createdDate: new Date(store.created).toLocaleDateString()
    };
};

// Render a single store card
export const renderStoreCard = (store, escapeHtmlFn = escapeHtml) => {
    const { name, details, createdDate } = parseStoreData(store);
    
    return `
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow w-full">
            <div class="mb-2">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">${escapeHtmlFn(name)}</h3>
                ${details ? `<div class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-2">${escapeHtmlFn(details)}</div>` : ''}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-500 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                Added: ${createdDate}
            </div>
        </div>
    `;
};

// Render loading spinner
export const renderLoadingSpinner = (message = 'Loading...', escapeHtmlFn = escapeHtml) => {
    return `
        <div class="text-center py-12">
            <svg class="animate-spin h-12 w-12 text-purple-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="text-gray-600 dark:text-gray-400">${escapeHtmlFn(message)}</p>
        </div>
    `;
};

// Render empty state
export const renderEmptyState = (message = 'No stores found', submessage = 'Stores will appear here once they are added.', escapeHtmlFn = escapeHtml) => {
    return `
        <div class="text-center py-12">
            <p class="text-gray-500 dark:text-gray-400 text-lg">${escapeHtmlFn(message)}</p>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-2">${escapeHtmlFn(submessage)}</p>
        </div>
    `;
};

// Render error state
export const renderErrorState = (message = 'Failed to load stores', showRetry = true, escapeHtmlFn = escapeHtml) => {
    return `
        <div class="text-center py-12">
            <p class="text-red-600 dark:text-red-400 mb-2">${escapeHtmlFn(message)}</p>
            ${showRetry ? '<button id="retry-button" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-4">Retry</button>' : ''}
        </div>
    `;
};


// Export stores to PDF
export const exportStoresToPDF = (stores, filename) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 7;
    let y = margin;
    
    // Title
    doc.setFontSize(18);
    doc.text('Grocery Stores', margin, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, margin, y);
    y += 10;
    
    doc.setTextColor(0, 0, 0);
    
    stores.forEach((store, index) => {
        if (y > pageHeight - margin - 20) {
            doc.addPage();
            y = margin;
        }
        
        const { name, details, createdDate } = parseStoreData(store);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. ${name}`, margin, y);
        y += lineHeight;
        
        if (details) {
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            const lines = doc.splitTextToSize(details, pageWidth - margin * 2);
            doc.text(lines, margin, y);
            y += lineHeight * lines.length;
        }
        
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Added: ${createdDate}`, margin, y);
        y += lineHeight + 3;
        
        doc.setTextColor(0, 0, 0);
    });
    
    doc.save(filename);
};

// Export stores to Excel
export const exportStoresToExcel = (stores, filename) => {
    const worksheetData = [
        ['Store Name', 'Address', 'Date Added'],
        ...stores.map(store => {
            const { name, details, createdDate } = parseStoreData(store);
            return [name, details || '', createdDate];
        })
    ];
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    ws['!cols'] = [
        { wch: 30 }, // Store Name
        { wch: 40 }, // Address
        { wch: 12 }  // Date Added
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Grocery Stores');
    XLSX.writeFile(wb, filename);
};

// Export stores to JSON
export const exportStoresToJSON = (stores, filename) => {
    const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        stores: stores
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


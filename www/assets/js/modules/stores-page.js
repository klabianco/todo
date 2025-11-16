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
    // Handle old format (name with newlines) and new format (structured data)
    let name = store.name || '';
    let details = '';
    
    // Build details from structured fields
    const detailParts = [];
    if (store.city || store.state) {
        const location = [store.city, store.state].filter(Boolean).join(', ');
        if (location) detailParts.push(location);
    }
    if (store.phone) {
        detailParts.push(store.phone);
    }
    if (store.profile) {
        detailParts.push(store.profile);
    }
    
    // If no structured data, fall back to old format
    if (detailParts.length === 0 && name.includes('\n')) {
        const parts = name.split('\n');
        name = parts[0];
        details = parts.slice(1).join('\n');
    } else {
        details = detailParts.join('\n\n');
    }
    
    return {
        name: name,
        details: details,
        createdDate: new Date(store.created).toLocaleDateString()
    };
};

// Render photo upload button HTML
const renderPhotoUploadButton = (storeId) => `
    <label class="cursor-pointer">
        <input 
            type="file" 
            accept="image/*" 
            multiple
            class="hidden store-photo-input" 
            data-store-id="${storeId}"
        />
        <span class="text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-md inline-flex items-center">
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
            </svg>
            Add Photos
        </span>
    </label>
`;

// Get photo ID (handles both old string format and new object format)
const getPhotoId = (photo) => {
    return typeof photo === 'string' ? photo : (photo.id || photo);
};

// Get photo date (taken if available, otherwise added)
const getPhotoDate = (photo) => {
    if (typeof photo === 'string') {
        return null; // Old format, no date info
    }
    return photo.date_taken || photo.date_added || null;
};

// Format photo date for display
const formatPhotoDate = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    } catch {
        return '';
    }
};

// Render photo grid HTML
const renderPhotoGrid = (photos, storeId) => {
    if (!photos || photos.length === 0) return '';
    
    return `
        <div class="mt-3 grid grid-cols-3 gap-2">
            ${photos.map(photo => {
                const photoId = getPhotoId(photo);
                const photoDate = getPhotoDate(photo);
                const displayDate = formatPhotoDate(photoDate);
                
                return `
                    <div class="relative group">
                        <img 
                            src="/api/store-photos/${storeId}/${photoId}" 
                            alt="Store photo" 
                            class="w-full h-24 object-cover rounded-md"
                            loading="lazy"
                        />
                        ${displayDate ? `
                            <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-1 py-0.5 rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                                ${displayDate}
                            </div>
                        ` : ''}
                        <button 
                            class="delete-photo-btn absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-store-id="${storeId}"
                            data-photo-id="${photoId}"
                            title="Delete photo"
                        >
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

// Render a single store card
export const renderStoreCard = (store, escapeHtmlFn = escapeHtml) => {
    const { name, details, createdDate } = parseStoreData(store);
    const photos = store.photos || [];
    
    return `
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow w-full">
            <div class="mb-2">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">${escapeHtmlFn(name)}</h3>
                ${details ? `<div class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-2">${escapeHtmlFn(details)}</div>` : ''}
            </div>
            
            ${renderPhotoGrid(photos, store.id)}
            
            <div class="mt-3 flex items-center justify-between">
                <div class="text-xs text-gray-500 dark:text-gray-500">
                    Added: ${createdDate}
                </div>
                <div class="flex items-center gap-2">
                    ${renderPhotoUploadButton(store.id)}
                    <button 
                        class="delete-store-btn text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-md inline-flex items-center"
                        data-store-id="${store.id}"
                        title="Delete store"
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
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


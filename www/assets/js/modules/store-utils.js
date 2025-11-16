/**
 * Store utility functions
 */

// Convert aisle_layout from object to string format (for backward compatibility)
export const normalizeAisleLayout = (aisleLayout) => {
    if (!aisleLayout) {
        return '';
    }
    
    if (typeof aisleLayout === 'string') {
        return aisleLayout;
    }
    
    if (typeof aisleLayout === 'object' && aisleLayout !== null) {
        // Convert object format to string
        return Object.entries(aisleLayout)
            .map(([aisle, items]) => `${aisle}: ${items}`)
            .join('\n');
    }
    
    return '';
};

// Get preview of aisle layout (first N aisles)
export const getAisleLayoutPreview = (aisleLayout, maxAisles = 3) => {
    // Handle array format (new format)
    if (Array.isArray(aisleLayout) && aisleLayout.length > 0) {
        const previewAisles = aisleLayout.slice(0, maxAisles);
        const preview = previewAisles.map(aisle => {
            const items = Array.isArray(aisle.items) ? aisle.items.slice(0, 3).join(', ') : '';
            const moreItems = Array.isArray(aisle.items) && aisle.items.length > 3 ? '...' : '';
            return `${aisle.aisle_number || 'Unknown'}: ${items}${moreItems}`;
        }).join('\n');
        const hasMore = aisleLayout.length > maxAisles;
        return { preview, hasMore, fullText: '' };
    }
    
    // Handle legacy string format
    const layoutText = normalizeAisleLayout(aisleLayout);
    if (!layoutText) {
        return { preview: '', hasMore: false, fullText: '' };
    }
    
    const lines = layoutText.split('\n');
    const preview = lines.slice(0, maxAisles).join('\n');
    const hasMore = lines.length > maxAisles;
    
    return { preview, hasMore, fullText: layoutText };
};


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

// Get preview of aisle layout (first N lines)
export const getAisleLayoutPreview = (aisleLayout, maxLines = 3) => {
    const layoutText = normalizeAisleLayout(aisleLayout);
    if (!layoutText) {
        return '';
    }
    
    const lines = layoutText.split('\n');
    const preview = lines.slice(0, maxLines).join('\n');
    const hasMore = lines.length > maxLines;
    
    return { preview, hasMore, fullText: layoutText };
};


<?php
/**
 * Store helper functions
 */

// Convert aisle_layout from object/array to string format (for backward compatibility)
if (!function_exists('normalize_aisle_layout')) {
function normalize_aisle_layout($aisle_layout) {
    if (empty($aisle_layout)) {
        return null;
    }
    
    if (is_string($aisle_layout)) {
        return $aisle_layout;
    }
    
    if (is_array($aisle_layout)) {
        // Convert object/array format to string
        $layout_parts = [];
        foreach ($aisle_layout as $aisle => $items) {
            $layout_parts[] = $aisle . ': ' . $items;
        }
        return implode("\n", $layout_parts);
    }
    
    return null;
}
}

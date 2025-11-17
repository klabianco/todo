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

// Ensure photos array exists and is an array
if (!function_exists('ensure_photos_array')) {
function ensure_photos_array(&$array, $key = 'photos') {
    if (!isset($array[$key]) || !is_array($array[$key])) {
        $array[$key] = [];
    }
}
}

// Create a new section with default values
if (!function_exists('create_default_section')) {
function create_default_section($aisle_number = 'New Section', $category = 'General', $items = [], $photos = []) {
    return [
        'aisle_number' => $aisle_number,
        'category' => $category,
        'items' => is_array($items) ? $items : [],
        'photos' => is_array($photos) ? $photos : []
    ];
}
}

// Add photo to section or store photos array
if (!function_exists('add_photo_to_array')) {
function add_photo_to_array(&$target, $photo_metadata, $is_section = false) {
    ensure_photos_array($target, 'photos');
    $target['photos'][] = $photo_metadata;
}
}

// Update layout description if valid
if (!function_exists('update_layout_description_if_valid')) {
function update_layout_description_if_valid(&$store, $updated_layout_result) {
    if (isset($updated_layout_result['layout_description']) && 
        is_string($updated_layout_result['layout_description']) && 
        !empty($updated_layout_result['layout_description'])) {
        $store['layout_description'] = $updated_layout_result['layout_description'];
    }
}
}

// Handle photo upload fallback when AI analysis fails
if (!function_exists('handle_photo_upload_fallback')) {
function handle_photo_upload_fallback(&$store, $current_layout, $photo_metadata, $create_new_section, $is_section_photo, $section_index) {
    if ($create_new_section && is_array($current_layout)) {
        $new_section = create_default_section('New Section', 'General', [], [$photo_metadata]);
        $store['aisle_layout'][] = $new_section;
    } elseif ($is_section_photo && is_array($current_layout) && isset($current_layout[$section_index])) {
        $section = &$current_layout[$section_index];
        add_photo_to_array($section, $photo_metadata, true);
        $store['aisle_layout'] = $current_layout;
    } else {
        add_photo_to_array($store, $photo_metadata, false);
    }
}
}

<?php
/**
 * Photo upload helper functions
 */

// Photo upload validation constants
define('PHOTO_ALLOWED_TYPES', ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);
define('PHOTO_MAX_SIZE', 5 * 1024 * 1024); // 5MB

// Validate uploaded photo
function validate_photo_upload($file) {
    if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) {
        return ['error' => 'No photo uploaded or upload error'];
    }
    
    if (!in_array($file['type'], PHOTO_ALLOWED_TYPES)) {
        return ['error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'];
    }
    
    if ($file['size'] > PHOTO_MAX_SIZE) {
        return ['error' => 'File too large. Maximum size is 5MB.'];
    }
    
    return null; // Valid
}

// Save uploaded photo and return photo ID
function save_uploaded_photo($file, $store_id, $data_dir) {
    if (!function_exists('get_store_photos_dir')) {
        // Fallback if function not available
        $photos_dir = $data_dir . '/store-photos/' . $store_id;
        if (!is_dir($photos_dir)) {
            mkdir($photos_dir, 0755, true);
        }
    } else {
        $photos_dir = get_store_photos_dir($store_id);
    }
    
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $photo_id = 'photo-' . bin2hex(random_bytes(8)) . '.' . $extension;
    $photo_path = $photos_dir . '/' . $photo_id;
    
    if (!move_uploaded_file($file['tmp_name'], $photo_path)) {
        return ['error' => 'Failed to save photo'];
    }
    
    return ['photo_id' => $photo_id, 'photo_path' => $photo_path];
}


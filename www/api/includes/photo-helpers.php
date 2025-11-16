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

// Extract EXIF date taken from photo
function extract_photo_date_taken($photo_path) {
    if (!function_exists('exif_read_data')) {
        return null;
    }
    
    $exif = @exif_read_data($photo_path);
    if (!$exif) {
        return null;
    }
    
    // Try different EXIF date fields
    $date_fields = ['DateTimeOriginal', 'DateTime', 'DateTimeDigitized'];
    foreach ($date_fields as $field) {
        if (isset($exif[$field])) {
            $date = $exif[$field];
            // Convert EXIF date format to ISO 8601
            if (preg_match('/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/', $date, $matches)) {
                return sprintf('%s-%s-%sT%s:%s:%s', $matches[1], $matches[2], $matches[3], $matches[4], $matches[5], $matches[6]);
            }
        }
    }
    
    return null;
}

// Save uploaded photo and return photo metadata
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
    
    // Extract date taken from EXIF if available
    $date_taken = extract_photo_date_taken($photo_path);
    $date_added = date('c');
    
    return [
        'photo_id' => $photo_id,
        'photo_path' => $photo_path,
        'date_taken' => $date_taken,
        'date_added' => $date_added
    ];
}


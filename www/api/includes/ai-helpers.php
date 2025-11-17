<?php
/**
 * AI helper functions for common AI operations
 */

// Helper function to clean and parse AI JSON response
if (!function_exists('parse_ai_json_response')) {
    function parse_ai_json_response($response) {
        // Clean markdown code blocks
        $response = trim(preg_replace('/^```(?:json)?\s*|\s*```$/m', '', trim($response)));
        
        if (empty($response)) {
            return null;
        }
        
        $result = json_decode($response, true);
        
        // If decode failed, log error
        if ($result === null && json_last_error() !== JSON_ERROR_NONE) {
            error_log('AI JSON decode error: ' . json_last_error_msg());
            error_log('AI raw response: ' . substr($response, 0, 500));
            return null;
        }
        
        return $result;
    }
}

// Set extended execution time for AI operations
function set_ai_execution_time($seconds = 600) {
    set_time_limit($seconds);
    ini_set('max_execution_time', $seconds);
}

// Execute AI request with common setup and error handling
function execute_ai_request($prompt, $systemMessage, $models = null) {
    global $aiModelFallbacks;
    
    if ($models === null) {
        $models = $aiModelFallbacks;
    }
    
    $ai = new AI();
    $ai->setJsonResponse(true);
    $ai->setSystemMessage($systemMessage);
    $ai->setPrompt($prompt);
    
    $response = try_ai_models($ai, $models);
    
    if (isset($response['error'])) {
        return ['error' => $response['error']];
    }
    
    $parsed = parse_ai_json_response($response);
    
    if ($parsed === null) {
        return ['error' => 'Failed to parse AI response'];
    }
    
    return $parsed;
}

// Step 1: Parse basic store information (name, city, state, phone)
function parse_store_basic_info($input) {
    $systemMessage = "You are a helpful assistant that extracts structured information from grocery store descriptions.";
    
    $prompt = "Extract the following information from this grocery store description:\n\n" . 
              $input . "\n\n" .
              "Return a JSON object with these exact fields:\n" .
              "- name: The grocery store name (required)\n" .
              "- city: The city where the store is located (required if available)\n" .
              "- state: The state where the store is located (required if available, use 2-letter abbreviation)\n" .
              "- phone: The phone number (required if available, format as (XXX) XXX-XXXX)\n\n" .
              "If any information is not available in the input, use null for that field. Always include the name field.";
    
    return execute_ai_request($prompt, $systemMessage);
}

// Format store location string
function format_store_location($city, $state) {
    $parts = array_filter([$city, $state]);
    return $parts ? implode(', ', $parts) : '';
}

// Step 2: Generate aisle layout (item locations)
function generate_aisle_layout($store_info, $input) {
    set_ai_execution_time(600); // 10 minutes per step
    
    $store_name = $store_info['name'] ?? 'the store';
    $location = format_store_location($store_info['city'] ?? null, $store_info['state'] ?? null);
    
    $systemMessage = "You are a helpful assistant that creates detailed aisle-by-aisle item location guides.";
    
    $prompt = "Based on this store information:\n" .
              "Store: " . $store_name . "\n" .
              ($location ? "Location: " . $location . "\n" : "") .
              "Original input: " . $input . "\n\n" .
              "Create a detailed aisle-by-aisle guide showing where items are located in the store.\n\n" .
              "Format it as a JSON array of objects, where each object represents an aisle/section. Each object should have:\n" .
              "- aisle_number: The aisle or section identifier (e.g., \"Aisle 1\", \"Produce Section\", \"Bakery\")\n" .
              "- items: An array of strings listing the items/products found in that aisle\n" .
              "- category: A category name for the aisle (e.g., \"Produce\", \"Bakery\", \"Dairy\", \"Meat\")\n\n" .
              "Example format:\n" .
              "[\n" .
              "  {\"aisle_number\": \"Aisle 1\", \"items\": [\"Fresh fruits\", \"Fresh vegetables\", \"Organic produce\"], \"category\": \"Produce\"},\n" .
              "  {\"aisle_number\": \"Aisle 2\", \"items\": [\"Bread\", \"Pastries\", \"Cakes\"], \"category\": \"Bakery\"},\n" .
              "  {\"aisle_number\": \"Aisle 3\", \"items\": [\"Milk\", \"Eggs\", \"Cheese\", \"Yogurt\"], \"category\": \"Dairy\"}\n" .
              "]\n\n" .
              "If the store layout is not known, create a typical grocery store layout based on common store organization. Make it practical and useful for shoppers.\n\n" .
              "Return a JSON object with this field:\n" .
              "- aisle_layout: A JSON array of aisle objects (as described above)\n\n" .
              "Return ONLY a valid JSON object.";
    
    $ai = new AI();
    $ai->setJsonResponse(true);
    $ai->setSystemMessage($systemMessage);
    $ai->setPrompt($prompt);
    
    global $aiModelFallbacks;
    $response = try_ai_models($ai, $aiModelFallbacks);
    
    if (isset($response['error'])) {
        return ['error' => $response['error']];
    }
    
    $parsed = parse_ai_json_response($response);
    
    if ($parsed === null) {
        return ['error' => 'Failed to parse aisle layout response'];
    }
    
    // Ensure aisle_layout is a JSON array (not a string)
    // The AI should return it as an array, but we'll validate and keep it as-is
    if (isset($parsed['aisle_layout'])) {
        // If it's already an array, keep it
        if (is_array($parsed['aisle_layout'])) {
            // Good, it's already in the correct format
        } 
        // If it's a string, try to parse it as JSON
        else if (is_string($parsed['aisle_layout'])) {
            $decoded = json_decode($parsed['aisle_layout'], true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $parsed['aisle_layout'] = $decoded;
            }
        }
    }
    
    return $parsed;
}


// Analyze a store photo to detect items and their section/location
function analyze_store_photo($photo_path) {
    set_ai_execution_time(300);
    
    // Read and encode image as base64
    $image_data = file_get_contents($photo_path);
    $base64_image = base64_encode($image_data);
    
    $ai = new AI();
    $ai->setJsonResponse(true); // Use JSON mode for gpt-5-nano
    $ai->setSystemMessage("You are a helpful assistant that analyzes store photos to identify products and their locations.");
    $ai->setImage($base64_image);
    $ai->setPrompt("Analyze this store photo and identify all the products and items visible, along with their location/section. You MUST return a JSON object with these exact fields:\n" .
                  "- aisle_number: The section name or location identifier. This could be an aisle number (e.g., 'Aisle 5'), a department name (e.g., 'Produce Section', 'Deli Counter', 'Bakery', 'Meat Counter', 'Seafood Counter', 'Pharmacy', etc.), or any other store section. If not visible, estimate based on the products shown. Use a descriptive string value.\n" .
                  "- items: An array of strings listing ALL the products/items you can see in the photo. Be specific and comprehensive. This field is REQUIRED and must contain at least one item.\n" .
                  "- category: The general category of items in this section (e.g., 'Produce', 'Dairy', 'Meat', 'Bakery', 'Deli', 'Seafood', 'Canned Goods', etc.).\n\n" .
                  "Examples:\n" .
                  "{\"aisle_number\": \"Aisle 5\", \"items\": [\"Milk\", \"Cheese\", \"Yogurt\"], \"category\": \"Dairy\"}\n" .
                  "{\"aisle_number\": \"Deli Counter\", \"items\": [\"Sliced ham\", \"Sliced turkey\", \"Cheese selection\"], \"category\": \"Deli\"}\n" .
                  "{\"aisle_number\": \"Produce Section\", \"items\": [\"Apples\", \"Bananas\", \"Lettuce\"], \"category\": \"Produce\"}\n\n" .
                  "Return ONLY a valid JSON object with the 'items' array containing at least one item.");
    
    // Use vision API for image analysis
    ob_start();
    $response = $ai->getResponseFromOpenAIVision();
    $output = ob_get_clean();
    
    if ($response === false || empty($response)) {
        $error = 'Failed to analyze photo: ' . ($output ?: 'No response from AI');
        error_log("Vision API error: $error");
        return ['error' => $error];
    }
    
    // Check for error messages in response
    if (is_string($response) && (strpos($response, 'Error:') === 0 || strpos($response, 'error') !== false)) {
        return ['error' => $response];
    }
    
    // The response should now be the extracted JSON text string from getResponseFromOpenAIVision
    // But if getResponseFromOpenAIVision returned the full array, we need to extract it here
    $parsed = parse_ai_json_response($response);
    
    // If parsed result is an array, it means getResponseFromOpenAIVision didn't extract the text
    // We need to extract it ourselves
    if (is_array($parsed) && count($parsed) >= 2) {
        // Find the assistant message in the array
        $extractedText = null;
        foreach ($parsed as $item) {
            if (is_array($item) && isset($item['type']) && $item['type'] === 'message' && 
                isset($item['role']) && $item['role'] === 'assistant' && 
                isset($item['content']) && is_array($item['content'])) {
                // Extract text from content array
                foreach ($item['content'] as $contentItem) {
                    if (is_array($contentItem) && isset($contentItem['type']) && $contentItem['type'] === 'output_text' && isset($contentItem['text'])) {
                        $extractedText = $contentItem['text'];
                        break 2; // Break out of both loops
                    }
                }
            }
        }
        
        if ($extractedText) {
            // Now parse the extracted JSON text
            $parsed = parse_ai_json_response($extractedText);
            if ($parsed === null) {
                return ['error' => 'Failed to parse extracted JSON text'];
            }
        }
    }
    
    if ($parsed === null) {
        return ['error' => 'Failed to parse AI response'];
    }
    
    // Normalize the response structure - check for different possible field names
    $normalized = [];
    
    // Check for items (could be 'items', 'sections', 'products', etc.)
    if (isset($parsed['items']) && is_array($parsed['items'])) {
        $normalized['items'] = $parsed['items'];
    } elseif (isset($parsed['sections']) && is_array($parsed['sections'])) {
        // If AI returned 'sections' instead of 'items', use that
        $normalized['items'] = $parsed['sections'];
    } elseif (isset($parsed['products']) && is_array($parsed['products'])) {
        $normalized['items'] = $parsed['products'];
    }
    
    // Check for aisle_number (could be 'aisle', 'aisle_number', 'aisle_name', etc.)
    if (isset($parsed['aisle_number'])) {
        $normalized['aisle_number'] = $parsed['aisle_number'];
    } elseif (isset($parsed['aisle'])) {
        $normalized['aisle_number'] = $parsed['aisle'];
    } elseif (isset($parsed['aisle_name'])) {
        $normalized['aisle_number'] = $parsed['aisle_name'];
    }
    
    // Check for category
    if (isset($parsed['category'])) {
        $normalized['category'] = $parsed['category'];
    }
    
    // If we have items, return normalized structure
    if (!empty($normalized['items'])) {
        return $normalized;
    }
    
    // Try one more time to find items in any nested structure
    if (is_array($parsed)) {
        foreach ($parsed as $key => $value) {
            if (is_array($value) && !empty($value) && isset($value[0])) {
                // This might be an items array
                $normalized['items'] = $value;
                if (isset($parsed['aisle_number']) || isset($parsed['aisle'])) {
                    $normalized['aisle_number'] = $parsed['aisle_number'] ?? $parsed['aisle'] ?? null;
                }
                if (isset($parsed['category'])) {
                    $normalized['category'] = $parsed['category'];
                }
                if (!empty($normalized['items'])) {
                    return $normalized;
                }
            }
        }
    }
    
    return $parsed; // Return original in case items are there but we missed them
}

// Update store aisle layout based on photo analysis
function update_aisle_layout_from_photo($current_layout, $photo_analysis) {
    set_ai_execution_time(300);
    
    // Determine if current_layout is an array (new format) or string (legacy)
    $is_array_format = is_array($current_layout);
    $layout_for_prompt = '';
    
    if ($is_array_format) {
        // Convert array to readable format for AI prompt
        $layout_lines = [];
        foreach ($current_layout as $aisle) {
            if (is_array($aisle) && isset($aisle['aisle_number'])) {
                $items = is_array($aisle['items']) ? implode(', ', $aisle['items']) : '';
                $layout_lines[] = $aisle['aisle_number'] . ': ' . $items;
            }
        }
        $layout_for_prompt = implode("\n", $layout_lines);
    } else {
        $layout_for_prompt = is_string($current_layout) ? $current_layout : '';
    }
    
    $systemMessage = "You are a helpful assistant that updates store layouts based on photo analysis.";
    
    $section_name = $photo_analysis['aisle_number'] ?? 'Unknown Section';
    $category = $photo_analysis['category'] ?? 'Unknown';
    $items = implode(', ', $photo_analysis['items'] ?? []);
    
    $prompt = "You have a store's current layout and new information from a photo analysis.\n\n" .
              "Current aisle/item layout:\n" . ($layout_for_prompt ?: "No layout information yet.") . "\n\n" .
              "Photo analysis results:\n" .
              "- Section/Location: " . $section_name . "\n" .
              "- Category: " . $category . "\n" .
              "- Items found: " . $items . "\n\n" .
              "Update the aisle/item layout:\n" .
              "- If this section/location already exists, update it with the new items found in the photo.\n" .
              "- If this is a NEW section/location, ADD it as a new entry.\n" .
              "- Maintain consistency and organization. Keep existing sections that weren't updated.\n" .
              "- Return as a JSON array of objects, where each object has:\n" .
              "  * aisle_number: The aisle/section identifier\n" .
              "  * items: An array of item strings\n" .
              "  * category: The category name\n\n" .
              "Return ONLY a JSON array of objects (not wrapped in an object).\n\n" .
              "Example response format:\n" .
              "[\n" .
              "  {\"aisle_number\": \"Aisle 1\", \"items\": [\"Produce\", \"Vegetables\"], \"category\": \"Produce\"},\n" .
              "  {\"aisle_number\": \"Aisle 5\", \"items\": [\"Milk\", \"Cheese\"], \"category\": \"Dairy\"}\n" .
              "]";
    
    $ai = new AI();
    $ai->setJsonResponse(true);
    $ai->setSystemMessage($systemMessage);
    $ai->setPrompt($prompt);
    
    global $aiModelFallbacks;
    $response = try_ai_models($ai, $aiModelFallbacks);
    
    if (isset($response['error'])) {
        return ['error' => $response['error']];
    }
    
    // Parse the JSON response
    $parsed = parse_ai_json_response($response);
    
    if ($parsed === null) {
        return ['error' => 'Failed to parse layout update response'];
    }
    
    // Extract layout - should be an array (may be direct array or wrapped in object)
    $updated_layout = null;
    if (is_array($parsed) && isset($parsed[0]) && is_array($parsed[0])) {
        // Direct array response
        $updated_layout = $parsed;
    } elseif (is_array($parsed) && isset($parsed['aisle_layout'])) {
        // Wrapped in object
        $updated_layout = $parsed['aisle_layout'];
    } else {
        // Try to use parsed directly if it's an array
        $updated_layout = is_array($parsed) ? $parsed : null;
    }
    
    // Ensure layout is an array (new format)
    if (!is_array($updated_layout)) {
        // If AI returned a string, try to parse it or fall back to merging manually
        if (is_string($updated_layout)) {
            $decoded = json_decode($updated_layout, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $updated_layout = $decoded;
            } else {
                // Fallback: merge new section into existing array
                if ($is_array_format && is_array($current_layout)) {
                    $updated_layout = $current_layout;
                    // Find and update or add the section
                    $found = false;
                    foreach ($updated_layout as &$aisle) {
                        if (isset($aisle['aisle_number']) && $aisle['aisle_number'] === $section_name) {
                            $aisle['items'] = is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [];
                            $aisle['category'] = $category;
                            $found = true;
                            break;
                        }
                    }
                    if (!$found) {
                        $updated_layout[] = [
                            'aisle_number' => $section_name,
                            'items' => is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [],
                            'category' => $category
                        ];
                    }
                } else {
                    // Legacy format - keep as string
                    $updated_layout = $updated_layout ?: $current_layout;
                }
            }
        } else {
            // Fallback: merge new section into existing array
            if ($is_array_format && is_array($current_layout)) {
                $updated_layout = $current_layout;
                $found = false;
                foreach ($updated_layout as &$aisle) {
                    if (isset($aisle['aisle_number']) && $aisle['aisle_number'] === $section_name) {
                        $aisle['items'] = is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [];
                        $aisle['category'] = $category;
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    $updated_layout[] = [
                        'aisle_number' => $section_name,
                        'items' => is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [],
                        'category' => $category
                    ];
                }
            } else {
                $updated_layout = $current_layout;
            }
        }
    }
    
    // Validate and clean up the array structure - ensure items is always an array
    if (is_array($updated_layout)) {
        foreach ($updated_layout as &$aisle) {
            if (is_array($aisle)) {
                // Ensure items is an array
                if (!isset($aisle['items']) || !is_array($aisle['items'])) {
                    // If items exists but isn't an array, try to convert it
                    if (isset($aisle['items']) && is_string($aisle['items'])) {
                        // Try to parse as JSON array
                        $decoded = json_decode($aisle['items'], true);
                        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                            $aisle['items'] = $decoded;
                        } else {
                            // Split by comma if it's a comma-separated string
                            $aisle['items'] = array_filter(array_map('trim', explode(',', $aisle['items'])));
                        }
                    } else {
                        $aisle['items'] = [];
                    }
                }
                // Ensure aisle_number exists
                if (!isset($aisle['aisle_number']) || empty($aisle['aisle_number'])) {
                    $aisle['aisle_number'] = 'Unknown';
                }
            }
        }
        unset($aisle); // Break reference
    }
    
    return [
        'aisle_layout' => $updated_layout
    ];
}


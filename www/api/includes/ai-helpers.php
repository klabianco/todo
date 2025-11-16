<?php
/**
 * AI helper functions for common AI operations
 */

// Set extended execution time for AI operations
function set_ai_execution_time($seconds = 300) {
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

// Parse store information using AI
function parse_store_with_ai($input) {
    $systemMessage = "You are a helpful assistant that extracts structured information from grocery store descriptions and creates aisle-by-aisle layout guides.";
    
    $prompt = "Extract the following information from this grocery store description:\n\n" . 
              $input . "\n\n" .
              "Return a JSON object with these exact fields:\n" .
              "- name: The grocery store name (required)\n" .
              "- city: The city where the store is located (required if available)\n" .
              "- state: The state where the store is located (required if available, use 2-letter abbreviation)\n" .
              "- phone: The phone number (required if available, format as (XXX) XXX-XXXX)\n" .
              "- aisle_layout: A detailed aisle-by-aisle guide showing where items are located in the store. Format it as a STRING (not an object) with each aisle on a new line. For example: \"Aisle 1: Produce, fresh fruits and vegetables\\nAisle 2: Bakery, breads and pastries\\nAisle 3: Dairy, milk, eggs, cheese\\nAisle 4: Meat, fresh cuts of beef, pork, chicken\" etc. If the store layout is not known, create a typical grocery store layout based on common store organization. Make it practical and useful for shoppers. Return ONLY a plain text string, not a JSON object.\n\n" .
              "If any information is not available in the input, use null for that field. Always include the name and aisle_layout fields.";
    
    return execute_ai_request($prompt, $systemMessage);
}

// Create a new store with AI parsing
function create_store_with_ai($input, $stores_file) {
    // Set extended execution time for AI
    set_ai_execution_time(300);
    
    // Parse store information
    $parsed = parse_store_with_ai($input);
    
    if (isset($parsed['error'])) {
        return ['error' => $parsed['error']];
    }
    
    if (!isset($parsed['name']) || empty($parsed['name'])) {
        return ['error' => 'Failed to extract store name from input'];
    }
    
    // Create store object
    require __DIR__ . '/store-helpers.php';
    
    $newStore = [
        'id' => 'store-' . bin2hex(random_bytes(8)),
        'name' => $parsed['name'],
        'city' => $parsed['city'] ?? null,
        'state' => $parsed['state'] ?? null,
        'phone' => $parsed['phone'] ?? null,
        'aisle_layout' => normalize_aisle_layout($parsed['aisle_layout'] ?? null),
        'created' => date('c')
    ];
    
    // Save to file
    $stores = read_json_file($stores_file, []);
    $stores[] = $newStore;
    write_json_file($stores_file, $stores);
    
    return ['store' => $newStore];
}


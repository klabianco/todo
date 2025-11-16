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
    $systemMessage = "You are a helpful assistant that extracts structured information from grocery store descriptions.";
    
    $prompt = "Extract the following information from this grocery store description:\n\n" . 
              $input . "\n\n" .
              "Return a JSON object with these exact fields:\n" .
              "- name: The grocery store name (required)\n" .
              "- city: The city where the store is located (required if available)\n" .
              "- state: The state where the store is located (required if available, use 2-letter abbreviation)\n" .
              "- phone: The phone number (required if available, format as (XXX) XXX-XXXX)\n" .
              "- profile: A brief 2-3 sentence profile/description of the grocery store, including what makes it special, its focus (organic, ethnic foods, local produce, etc.), and any notable features. Make it informative and engaging.\n\n" .
              "If any information is not available in the input, use null for that field. Always include the name and profile fields.";
    
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
    $newStore = [
        'id' => 'store-' . bin2hex(random_bytes(8)),
        'name' => $parsed['name'],
        'city' => $parsed['city'] ?? null,
        'state' => $parsed['state'] ?? null,
        'phone' => $parsed['phone'] ?? null,
        'profile' => $parsed['profile'] ?? null,
        'created' => date('c')
    ];
    
    // Save to file
    $stores = read_json_file($stores_file, []);
    $stores[] = $newStore;
    write_json_file($stores_file, $stores);
    
    return ['store' => $newStore];
}


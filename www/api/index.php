<?php
// Set headers for JSON API (can be overridden for file serving)
$is_file_request = false;
if (!isset($_GET['is_file'])) {
header('Content-Type: application/json');
}
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
// Prevent caching so clients always fetch the latest list data
if (!isset($_GET['is_file'])) {
header('Cache-Control: no-store');
}

// Handle OPTIONS request for CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Debug info for error responses
$debug = [
    'request_uri' => $_SERVER['REQUEST_URI'],
    'request_method' => $_SERVER['REQUEST_METHOD']
];

// Parse the URL to determine the action
$request_uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri_parts = explode('/', trim($request_uri, '/'));

// Find the position of 'api' in the URL path
$api_pos = array_search('api', $uri_parts);
if ($api_pos === false) {
    http_response_code(404);
    echo json_encode(['error' => 'API endpoint not found', 'debug' => $debug]);
    exit;
}

// Extract the relevant parts of the URL after 'api'
$api_parts = array_slice($uri_parts, $api_pos + 1);
$resource = isset($api_parts[0]) ? $api_parts[0] : null;
$id = isset($api_parts[1]) ? $api_parts[1] : null;
$sub_id = isset($api_parts[2]) ? $api_parts[2] : null; // For nested resources like store-photos/{store_id}/{photo_id}

// Ensure data directory exists
$data_dir = __DIR__ . '/data';
if (!file_exists($data_dir)) {
    mkdir($data_dir, 0755, true);
}

// Generate a unique 8-character share ID
function generate_share_id() {
    return bin2hex(random_bytes(4));
}

// Get the path to a task list file
function get_task_file_path($share_id) {
    global $data_dir;
    return $data_dir . '/' . $share_id . '.json';
}

// Get the path to a stores list file
function get_stores_list_file_path($share_id) {
    global $data_dir;
    return $data_dir . '/stores-' . $share_id . '.json';
}

// Get the path to store photos directory
function get_store_photos_dir($store_id) {
    global $data_dir;
    $photos_dir = $data_dir . '/store-photos/' . $store_id;
    if (!file_exists($photos_dir)) {
        mkdir($photos_dir, 0755, true);
    }
    return $photos_dir;
}

// Helper function to read JSON file
function read_json_file($path, $default = []) {
    return file_exists($path) ? json_decode(file_get_contents($path), true) : $default;
}

// Helper function to write JSON file
function write_json_file($path, $data) {
    return file_put_contents($path, json_encode($data));
}

// Helper function to send JSON response
function json_response($data, $status_code = 200) {
    http_response_code($status_code);
    echo json_encode($data);
    exit;
}

// Helper function to get request body as JSON
function get_request_body() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

// ----- User-specific helpers -----
function get_user_id() {
    if (isset($_COOKIE['todoUserId'])) {
        return $_COOKIE['todoUserId'];
    }
    $id = bin2hex(random_bytes(16));
    setcookie('todoUserId', $id, time() + 31536000, '/'); // 1 year
    return $id;
}

function get_user_dir($user_id) {
    global $data_dir;
    $dir = $data_dir . '/users/' . $user_id;
    if (!file_exists($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

function get_user_tasks_path($user_id, $date) {
    return get_user_dir($user_id) . '/' . $date . '.json';
}

function get_user_sticky_path($user_id) {
    return get_user_dir($user_id) . '/sticky.json';
}

function get_user_data_path($user_id, $name) {
    return get_user_dir($user_id) . '/' . $name . '.json';
}

// Helper function to try AI models with fallback
function try_ai_models($ai, $models) {
    $lastError = null;
    
    foreach ($models as $model) {
        try {
            ob_start();
            $response = @$ai->getResponseFromOpenAi(
                $ai->getSystemMessage(),
                1.0,
                0,
                $model,
                2000,
                true
            );
            $output = ob_get_clean();
            
            // Check for errors in output
            if (!empty($output) && stripos($output, 'error') !== false) {
                error_log("AI sort: Model $model output: " . $output);
                $lastError = $output;
                continue;
            }
            
            // Validate response
            if ($response !== false && $response !== null && !empty(trim($response))) {
                error_log("AI sort: Successfully got response from model: $model");
                return $response;
            }
            
            // Log invalid response
            $responseLength = is_string($response) ? strlen($response) : 'N/A';
            $responsePreview = is_string($response) ? substr($response, 0, 200) : 'N/A';
            error_log("AI sort: Model $model returned empty/invalid response. Type: " . gettype($response) . ", Length: $responseLength, Preview: $responsePreview");
            $lastError = "Empty or invalid response from $model";
        } catch (Throwable $e) {
            error_log("AI sort: Exception with model $model: " . $e->getMessage() . " | Type: " . get_class($e));
            $lastError = $e->getMessage();
        }
    }
    
    return ['error' => $lastError ?: 'All models failed'];
}

// Helper function to extract sorted items from AI response
function extract_sorted_items($aiResult) {
    $keys = ['sortedItems', 'items', 'sorted'];
    
    foreach ($keys as $key) {
        if (isset($aiResult[$key]) && is_array($aiResult[$key])) {
            return $aiResult[$key];
        }
    }
    
    // If response is directly an array
    if (is_array($aiResult) && isset($aiResult[0])) {
        return $aiResult;
    }
    
    return null;
}

// Helper function to extract aisle assignments from AI response
function extract_aisle_assignments($aiResult) {
    $keys = ['assignments', 'aisles', 'items', 'results'];
    foreach ($keys as $key) {
        if (isset($aiResult[$key]) && is_array($aiResult[$key])) {
            return $aiResult[$key];
        }
    }

    // If response is directly an array
    if (is_array($aiResult) && isset($aiResult[0])) {
        return $aiResult;
    }

    return null;
}

function normalize_assignment_row($row) {
    if (!is_array($row)) return null;
    $id = $row['id'] ?? $row['task_id'] ?? $row['taskId'] ?? null;
    $aisle = $row['aisle_number'] ?? $row['aisle'] ?? $row['section'] ?? $row['department'] ?? null;
    $text = $row['task'] ?? $row['text'] ?? null;

    if (!$id && !$text) return null;

    return [
        'id' => $id,
        'task' => $text,
        'aisle' => is_string($aisle) ? trim($aisle) : $aisle,
    ];
}

function build_aisle_index_map_from_layout($aisle_layout) {
    $map = [];
    if (!is_array($aisle_layout)) return $map;
    $idx = 0;
    foreach ($aisle_layout as $section) {
        if (!is_array($section)) continue;
        $name = $section['aisle_number'] ?? null;
        if (!is_string($name) || trim($name) === '') continue;
        $name = trim($name);
        if (!isset($map[$name])) {
            $map[$name] = $idx;
        }
        $idx++;
    }
    return $map;
}

function apply_aisle_assignments_to_tasks($tasks, $assignments, $aisleIndexByName, $unknownIndex = 9999) {
    // Index tasks by id (preferred) and also by text (fallback)
    $byId = [];
    $byText = [];
    foreach ($tasks as $i => $t) {
        if (isset($t['id'])) {
            $byId[(string)$t['id']] = $i;
        }
        if (isset($t['task']) && is_string($t['task'])) {
            $byText[$t['task']][] = $i;
        }
    }

    // Start with unknown for all
    $updated = $tasks;
    foreach ($updated as &$t) {
        $t['aisle'] = $t['aisle'] ?? null;
        $t['aisle_index'] = $t['aisle_index'] ?? $unknownIndex;
    }
    unset($t);

    foreach ($assignments as $row) {
        $norm = normalize_assignment_row($row);
        if (!$norm) continue;

        $aisle = $norm['aisle'];
        if (!is_string($aisle) || $aisle === '') {
            $aisle = 'Unknown';
        }

        $idx = $aisleIndexByName[$aisle] ?? $unknownIndex;

        $taskIndex = null;
        if (!empty($norm['id'])) {
            $id = (string)$norm['id'];
            if (isset($byId[$id])) {
                $taskIndex = $byId[$id];
            }
        }

        if ($taskIndex === null && !empty($norm['task']) && isset($byText[$norm['task']]) && !empty($byText[$norm['task']])) {
            // Handle duplicates by consuming first unused index
            $taskIndex = array_shift($byText[$norm['task']]);
        }

        if ($taskIndex === null) continue;
        $updated[$taskIndex]['aisle'] = $aisle;
        $updated[$taskIndex]['aisle_index'] = $idx;
    }

    return $updated;
}

// Helper function to reorder tasks based on sorted items
function reorder_tasks($tasks, $sortedItems) {
    // Build task map (handles duplicates)
    $taskMap = [];
    foreach ($tasks as $task) {
        $taskMap[$task['task']][] = $task;
    }
    
    // Reorder tasks based on AI sorting
    $sortedTasks = [];
    foreach ($sortedItems as $text) {
        // Handle both string and object formats
        $taskText = is_string($text) ? $text : ($text['task'] ?? $text['text'] ?? $text);
        
        if (!empty($taskMap[$taskText])) {
            $sortedTasks[] = array_shift($taskMap[$taskText]);
        }
    }
    
    // Add remaining tasks (safety fallback)
    foreach ($taskMap as $remainingTasks) {
        $sortedTasks = array_merge($sortedTasks, $remainingTasks);
    }
    
    return $sortedTasks;
}

// Determine and handle the request
switch ($resource) {
    case 'lists':
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'POST':
                // Create a new shared task list
                $data = get_request_body();
                $share_id = generate_share_id();
                
                $list_data = [
                    'id' => $share_id,
                    'tasks' => $data['tasks'] ?? [],
                    'focusId' => $data['focusId'] ?? null,
                    'created' => date('c'),
                    'lastModified' => date('c')
                ];
                
                write_json_file(get_task_file_path($share_id), $list_data);
                json_response(['shareId' => $share_id]);
                break;
                
            case 'GET':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                    $file_path = get_task_file_path($id);
                    if (file_exists($file_path)) {
                        echo file_get_contents($file_path);
                } else {
                    json_response(['error' => 'Task list not found'], 404);
                }
                break;
                
            case 'PUT':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                    $file_path = get_task_file_path($id);
                if (!file_exists($file_path)) {
                    json_response(['error' => 'Task list not found'], 404);
                }
                
                $data = get_request_body();
                $list_data = read_json_file($file_path);
                $list_data['tasks'] = $data['tasks'] ?? [];
                if (isset($data['focusId'])) {
                    $list_data['focusId'] = $data['focusId'];
                        }
                        // Always update the lastModified timestamp with current server time
                        // This ensures changes are detected by viewers polling for updates
                        $list_data['lastModified'] = date('c');
                        
                write_json_file($file_path, $list_data);
                json_response(['success' => true]);
                break;
                
            case 'DELETE':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                    $file_path = get_task_file_path($id);
                if (!file_exists($file_path)) {
                    json_response(['error' => 'Task list not found'], 404);
                }
                
                // Remove from all user subscriptions
                        $users_dir = $data_dir . '/users';
                        if (file_exists($users_dir)) {
                    foreach (glob($users_dir . '/*', GLOB_ONLYDIR) as $user_dir) {
                                $subscribed_path = $user_dir . '/subscribed.json';
                        $subscribed_data = read_json_file($subscribed_path, []);
                        if (is_array($subscribed_data) && !empty($subscribed_data)) {
                            $updated_lists = array_values(array_filter($subscribed_data, function($item) use ($id) {
                                            return !isset($item['id']) || $item['id'] !== $id;
                            }));
                            write_json_file($subscribed_path, $updated_lists);
                                    }
                                }
                            }
                
                        unlink($file_path);
                json_response(['success' => true]);
                break;
                
            default:
                json_response(['error' => 'Method not allowed'], 405);
        }
        break;
        
    case 'user':
        $sub = isset($api_parts[1]) ? $api_parts[1] : null;
        $subid = isset($api_parts[2]) ? $api_parts[2] : null;
        $userId = get_user_id();
        switch ($sub) {
            case 'tasks':
                if (!$subid) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Date is required']);
                    break;
                }
                $tasksPath = get_user_tasks_path($userId, $subid);
                $stickyPath = get_user_sticky_path($userId);
                switch ($_SERVER['REQUEST_METHOD']) {
                    case 'GET':
                        $tasks = read_json_file($tasksPath, []);
                        $sticky = read_json_file($stickyPath, []);
                        json_response(['tasks' => array_merge($tasks, $sticky)]);
                        break;
                    case 'PUT':
                        $data = get_request_body();
                        $incoming = $data['tasks'] ?? [];
                        $stickyTasks = [];
                        $nonSticky = [];
                        foreach ($incoming as $t) {
                            if (!empty($t['sticky'])) {
                                $stickyTasks[] = $t;
                            } else {
                                $nonSticky[] = $t;
                            }
                        }
                        write_json_file($tasksPath, $nonSticky);
                        write_json_file($stickyPath, $stickyTasks);
                        json_response(['success' => true]);
                        break;
                    default:
                        json_response(['error' => 'Method not allowed'], 405);
                }
                break;

            case 'subscriptions':
            case 'owned':
                $path = get_user_data_path($userId, $sub);
                switch ($_SERVER['REQUEST_METHOD']) {
                    case 'GET':
                        json_response(['lists' => read_json_file($path, [])]);
                        break;
                    case 'PUT':
                        $data = get_request_body();
                        write_json_file($path, $data['lists'] ?? []);
                        json_response(['success' => true]);
                        break;
                    default:
                        json_response(['error' => 'Method not allowed'], 405);
                }
                break;

            default:
                json_response(['error' => 'User resource not found'], 404);
        }
        break;

    case 'sort':
        // AI-powered grocery aisle assignment endpoint (frontend sorts programmatically)
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method not allowed'], 405);
        }
        
        require __DIR__ . '/../../config/config.php';
        require __DIR__ . '/includes/ai-helpers.php';
        
        $data = get_request_body();
        $tasks = $data['tasks'] ?? [];
        $store = $data['store'] ?? null;
        
        if (empty($tasks)) {
            json_response(['tasks' => []]);
        }
        
        try {
            require __DIR__ . '/includes/store-helpers.php';
            
            // Extract minimal task data for AI processing (use ids to handle duplicates safely)
            $taskItems = [];
            foreach ($tasks as $t) {
                if (!isset($t['id']) || !isset($t['task'])) continue;
                $taskItems[] = [
                    'id' => (string)$t['id'],
                    'task' => (string)$t['task'],
                ];
            }
            
            // Build prompt based on whether we have store layout data
            $systemMessage = "You are a grocery shopping assistant. Your job is to assign each item to the correct aisle/section (or department) so the app can sort programmatically.";
            $prompt = "Assign an aisle/section to each grocery item below.";
            $aisleIndexByName = [];
            $unknownIndex = 9999;
            
            if ($store && isset($store['aisle_layout']) && !empty($store['aisle_layout'])) {
                // Use store-specific layout
                $aisle_layout = clean_aisle_layout($store['aisle_layout']);
                
                if (!empty($aisle_layout) && is_array($aisle_layout)) {
                    $aisleIndexByName = build_aisle_index_map_from_layout($aisle_layout);
                    // Format aisle layout for the prompt
                    $layout_text = "Store: " . ($store['name'] ?? 'Unknown') . "\n\n";
                    $layout_text .= "Aisle/Section Layout:\n";
                    foreach ($aisle_layout as $section) {
                        if (is_array($section) && isset($section['aisle_number'])) {
                            $aisle_name = $section['aisle_number'] ?? 'Unknown';
                            $category = $section['category'] ?? '';
                            $items = is_array($section['items'] ?? null) ? implode(', ', $section['items']) : '';
                            $layout_text .= "- {$aisle_name}" . ($category ? " ({$category})" : '') . ": {$items}\n";
                        }
                    }
                    
                    $systemMessage .= " You have access to the specific store's aisle layout. You MUST choose an aisle_number that exactly matches one of the aisle/section names from the layout, or 'Unknown' if no match.";
                    $prompt .= " for shopping at " . ($store['name'] ?? 'this store') . ". Use the store's aisle layout below to assign each item to the best matching aisle/section.\n\n" .
                              $layout_text . "\n\n" .
                              "Items (each has an id):\n" . json_encode($taskItems, JSON_PRETTY_PRINT) . "\n\n" .
                              "Return ONLY a valid JSON object with this exact structure:\n\n" .
                              "{\n" .
                              "  \"assignments\": [\n" .
                              "    {\"id\": \"<id>\", \"aisle_number\": \"<exact aisle/section name from layout or 'Unknown'>\"}\n" .
                              "  ]\n" .
                              "}\n\n" .
                              "Rules:\n" .
                              "- The assignments array MUST contain one entry per input item id.\n" .
                              "- Do NOT reorder or omit items.\n" .
                              "- Only use aisle_number values that exactly match a layout aisle/section name, or 'Unknown'.\n";
                } else {
                    // Store selected but no valid layout - fall back to generic sorting
                    $departments = [
                        'Produce',
                        'Bakery',
                        'Meat & Seafood',
                        'Deli',
                        'Dairy',
                        'Frozen',
                        'Pantry',
                        'Beverages',
                        'Snacks',
                        'Household',
                        'Health & Beauty',
                        'Pharmacy',
                        'Other',
                    ];
                    $aisleIndexByName = array_flip($departments);
                    $systemMessage .= " Choose a department for each item from the provided list.";
                    $prompt .= "\n\nNo store layout is available. Assign each item to ONE of these departments (use exact spelling):\n" .
                              json_encode($departments, JSON_PRETTY_PRINT) . "\n\n" .
                              "Items (each has an id):\n" . json_encode($taskItems, JSON_PRETTY_PRINT) . "\n\n" .
                              "Return ONLY a valid JSON object with this exact structure:\n\n" .
                              "{\n" .
                              "  \"assignments\": [\n" .
                              "    {\"id\": \"<id>\", \"aisle_number\": \"<one department from list>\"}\n" .
                              "  ]\n" .
                              "}\n\n" .
                              "Rules:\n" .
                              "- The assignments array MUST contain one entry per input item id.\n" .
                              "- Do NOT reorder or omit items.\n";
                }
            } else {
                // No store selected - use generic department assignment
                $departments = [
                    'Produce',
                    'Bakery',
                    'Meat & Seafood',
                    'Deli',
                    'Dairy',
                    'Frozen',
                    'Pantry',
                    'Beverages',
                    'Snacks',
                    'Household',
                    'Health & Beauty',
                    'Pharmacy',
                    'Other',
                ];
                $aisleIndexByName = array_flip($departments);
                $systemMessage .= " Choose a department for each item from the provided list.";
                $prompt .= "\n\nNo store selected. Assign each item to ONE of these departments (use exact spelling):\n" .
                          json_encode($departments, JSON_PRETTY_PRINT) . "\n\n" .
                          "Items (each has an id):\n" . json_encode($taskItems, JSON_PRETTY_PRINT) . "\n\n" .
                          "Return ONLY a valid JSON object with this exact structure:\n\n" .
                          "{\n" .
                          "  \"assignments\": [\n" .
                          "    {\"id\": \"<id>\", \"aisle_number\": \"<one department from list>\"}\n" .
                          "  ]\n" .
                          "}\n\n" .
                          "Rules:\n" .
                          "- The assignments array MUST contain one entry per input item id.\n" .
                          "- Do NOT reorder or omit items.\n";
            }
            
            // Create AI instance and set up prompt for aisle assignment
            $ai = new AI();
            $ai->setJsonResponse(true);
            $ai->setSystemMessage($systemMessage . " You MUST return a valid JSON object with an 'assignments' array.");
            $ai->setPrompt($prompt);
            
            // Try AI models with fallback
            global $aiModelFallbacks;
            $response = try_ai_models($ai, $aiModelFallbacks);
            
            // Check if we got an error instead of a response
            if (is_array($response) && isset($response['error'])) {
                error_log('AI sort: All models failed. Last error: ' . $response['error']);
                json_response(['tasks' => $tasks, 'error' => 'AI service unavailable. Please check API key and model availability.']);
            }
            
            // Parse AI response
            $aiResult = parse_ai_json_response($response);
            if ($aiResult === null) {
                error_log('AI sort: Response is empty or invalid after parsing');
                json_response(['tasks' => $tasks, 'error' => 'AI service returned invalid response']);
            }
            
            // Extract assignments
            $assignments = extract_aisle_assignments($aiResult);
            if ($assignments === null || !is_array($assignments)) {
                error_log('AI aisle assign invalid response format. Response: ' . substr($response, 0, 1000));
                error_log('Parsed result: ' . json_encode($aiResult));
                json_response(['tasks' => $tasks, 'error' => 'Invalid AI response format']);
            }

            // Apply aisle assignment to tasks (frontend will sort)
            $updatedTasks = apply_aisle_assignments_to_tasks($tasks, $assignments, $aisleIndexByName, $unknownIndex);

            json_response(['tasks' => $updatedTasks]);
        } catch (Exception $e) {
            error_log('AI sort error: ' . $e->getMessage());
            json_response(['tasks' => $tasks, 'error' => 'Sorting failed, returning original order']);
        }
        break;

    case 'import-url':
        // AI-powered URL import endpoint - fetches URL content and extracts items
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method not allowed'], 405);
        }
        
        require __DIR__ . '/../../config/config.php';
        require __DIR__ . '/includes/ai-helpers.php';
        set_ai_execution_time(300);
        
        $data = get_request_body();
        $url = $data['url'] ?? '';
        
        if (empty($url)) {
            json_response(['error' => 'URL is required'], 400);
        }
        
        // Validate URL
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            json_response(['error' => 'Invalid URL format'], 400);
        }
        
        try {
            // Fetch URL content
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            
            $html = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);
            
            if ($html === false || !empty($error)) {
                error_log('URL fetch error: ' . $error);
                json_response(['error' => 'Failed to fetch URL: ' . ($error ?: 'Unknown error')], 500);
            }
            
            if ($httpCode !== 200) {
                error_log('URL fetch HTTP error: ' . $httpCode);
                json_response(['error' => 'Failed to fetch URL: HTTP ' . $httpCode], 500);
            }
            
            // Extract text content from HTML (simple approach - remove script/style tags and get text)
            $html = preg_replace('/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/mi', '', $html);
            $html = preg_replace('/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/mi', '', $html);
            $text = strip_tags($html);
            $text = preg_replace('/\s+/', ' ', $text); // Normalize whitespace
            $text = trim($text);
            
            // Limit text length to avoid token limits (keep first 8000 characters)
            if (strlen($text) > 8000) {
                $text = substr($text, 0, 8000) . '...';
            }
            
            if (empty($text)) {
                json_response(['error' => 'No text content found in URL'], 400);
            }
            
            // Extract title from HTML (try to get page title)
            $title = '';
            if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $matches)) {
                $title = trim($matches[1]);
            }
            // Fallback: use URL domain/name if no title found
            if (empty($title)) {
                $parsedUrl = parse_url($url);
                $title = isset($parsedUrl['host']) ? $parsedUrl['host'] : 'Imported List';
            }
            
            // Extract items using AI
            $systemMessage = "You are a helpful assistant that extracts actionable items (like ingredients, tasks, or items to buy) from web content. Extract all relevant items and return them as a simple list. For recipes, extract ingredients. For articles, extract actionable items or tasks mentioned.";
            $prompt = "Extract all actionable items (ingredients, tasks, items to buy, etc.) from the following content. Return ONLY a valid JSON object with this exact structure:\n\n{\n  \"items\": [\"item1\", \"item2\", \"item3\", ...]\n}\n\nContent:\n" . $text . "\n\nReturn the items as a simple array of strings. Each item should be clear and actionable (e.g., \"2 cups flour\" or \"Buy milk\" or \"Call dentist\").";
            
            $aiResult = execute_ai_request($prompt, $systemMessage);
            
            if (isset($aiResult['error'])) {
                error_log('AI import-url: ' . $aiResult['error']);
                json_response(['error' => 'AI service unavailable: ' . $aiResult['error']], 500);
            }
            
            // Extract items from various possible JSON structures
            $items = [];
            if (isset($aiResult['items']) && is_array($aiResult['items'])) {
                $items = $aiResult['items'];
            } elseif (isset($aiResult['ingredients']) && is_array($aiResult['ingredients'])) {
                $items = $aiResult['ingredients'];
            } elseif (is_array($aiResult)) {
                // If it's a direct array, use it
                $items = array_values($aiResult);
            }
            
            if (empty($items)) {
                error_log('AI import-url: No items extracted. Response: ' . substr($response, 0, 1000));
                json_response(['error' => 'No items could be extracted from the URL content'], 400);
            }
            
            json_response([
                'title' => $title,
                'items' => $items,
                'count' => count($items)
            ]);
        } catch (Exception $e) {
            error_log('AI import-url error: ' . $e->getMessage());
            json_response(['error' => 'Import failed: ' . $e->getMessage()], 500);
        }
        break;

    case 'grocery-stores':
    case 'store-photos':
        // Grocery stores endpoint - shared across all users
        $stores_file = $data_dir . '/grocery-stores.json';
        
        // Helper function to find store index by ID
        if (!function_exists('find_store_index')) {
            function find_store_index($stores, $id) {
                foreach ($stores as $index => $store) {
                    if ($store['id'] === $id) {
                        return $index;
                    }
                }
                return null;
            }
        }
        
        // Helper function to validate store name
        if (!function_exists('validate_store_name')) {
            function validate_store_name($name) {
                $name = trim($name ?? '');
                if (empty($name)) {
                    json_response(['error' => 'Store name is required'], 400);
                }
                return $name;
            }
        }
        
        // Handle store-photos case
        if ($resource === 'store-photos') {
            $store_id = $id;
            $photo_id = $sub_id;
            
            if (!$store_id && $_SERVER['REQUEST_METHOD'] !== 'GET') {
                json_response(['error' => 'Store ID is required'], 400);
            }
            
            // Verify store exists (except for GET requests which serve files)
            if ($_SERVER['REQUEST_METHOD'] !== 'GET' || $photo_id) {
                $stores = read_json_file($stores_file, []);
                $storeIndex = find_store_index($stores, $store_id);
                if ($storeIndex === null) {
                    json_response(['error' => 'Store not found'], 404);
                }
            }
            
            switch ($_SERVER['REQUEST_METHOD']) {
                case 'GET':
                    // Serve photo file
                    if (!$store_id || !$photo_id) {
                        http_response_code(400);
                        header('Content-Type: application/json');
                        echo json_encode(['error' => 'Store ID and Photo ID are required']);
                        exit;
                    }
                    
                    $photos_dir = get_store_photos_dir($store_id);
                    $photo_path = $photos_dir . '/' . $photo_id;
                    
                    if (!file_exists($photo_path)) {
                        http_response_code(404);
                        exit;
                    }
                    
                    // Override JSON headers for file serving
                    header_remove('Content-Type');
                    header_remove('Cache-Control');
                    $mime_type = mime_content_type($photo_path);
                    header('Content-Type: ' . $mime_type);
                    header('Cache-Control: public, max-age=31536000'); // Cache for 1 year
                    readfile($photo_path);
                    exit;
                    
                case 'POST':
                    // Upload a photo for a store
                    try {
                        require __DIR__ . '/includes/photo-helpers.php';
                        require __DIR__ . '/../../config/config.php';
                        require __DIR__ . '/includes/ai-helpers.php';
                        
                        // Ensure stores are loaded (they should be from the outer scope, but ensure they exist)
                        if (!isset($stores) || !isset($storeIndex)) {
                            $stores = read_json_file($stores_file, []);
                            $storeIndex = find_store_index($stores, $store_id);
                            if ($storeIndex === null) {
                                json_response(['error' => 'Store not found'], 404);
                            }
                        }
                        
                        $file = $_FILES['photo'] ?? null;
                        $validation_error = validate_photo_upload($file);
                        if ($validation_error) {
                            json_response($validation_error, 400);
                        }
                        
                        // Check if this is a section-specific upload or new section creation
                        $section_index = isset($_POST['section_index']) ? (int)$_POST['section_index'] : null;
                        $create_new_section = isset($_POST['create_new_section']) && $_POST['create_new_section'] === '1';
                        $is_section_photo = $section_index !== null && $section_index >= 0;
                        
                        $save_result = save_uploaded_photo($file, $store_id, $data_dir);
                        if (isset($save_result['error'])) {
                            json_response($save_result, 500);
                        }
                        
                        $photo_id = $save_result['photo_id'];
                        $photo_path = $save_result['photo_path'];
                        $photo_metadata = [
                            'id' => $photo_id,
                            'date_taken' => $save_result['date_taken'] ?? null,
                            'date_added' => $save_result['date_added'] ?? date('c')
                        ];
                        
                        // Analyze photo with AI to detect items and section/location
                        $photo_analysis = null;
                        $layout_updated = false;
                        $analysis_error = null;
                        try {
                            $photo_analysis = analyze_store_photo($photo_path);
                            
                            if (isset($photo_analysis['error'])) {
                                $analysis_error = is_string($photo_analysis['error']) ? $photo_analysis['error'] : json_encode($photo_analysis['error']);
                            } elseif (!empty($photo_analysis['items'])) {
                                require __DIR__ . '/includes/store-helpers.php';
                                
                                // Clean the existing layout before working with it
                                $current_layout = clean_aisle_layout($stores[$storeIndex]['aisle_layout'] ?? null);
                                
                                if ($create_new_section) {
                                    // Create new section from photo - just add it directly, no AI update needed
                                    $new_section = create_default_section(
                                        $photo_analysis['aisle_number'] ?? 'New Section',
                                        $photo_analysis['category'] ?? 'General',
                                        is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [],
                                        [$photo_metadata]
                                    );
                                    $current_layout[] = $new_section;
                                    save_store_layout($stores[$storeIndex], $current_layout);
                                    $layout_updated = true;
                                } elseif ($is_section_photo && is_array($current_layout) && isset($current_layout[$section_index])) {
                                    // Section-specific photo: only update that section
                                    $section = &$current_layout[$section_index];
                                    $section['items'] = is_array($photo_analysis['items'] ?? null) ? $photo_analysis['items'] : [];
                                    if (isset($photo_analysis['category'])) {
                                        $section['category'] = $photo_analysis['category'];
                                    }
                                    add_photo_to_array($section, $photo_metadata, true);
                                    
                                    // Update layout (may merge with other sections)
                                    $updated_layout_result = update_aisle_layout_from_photo($current_layout, $photo_analysis);
                                    $result = apply_layout_update_result($stores[$storeIndex], $updated_layout_result, $current_layout);
                                    if (isset($result['error'])) {
                                        $analysis_error = $result['error'];
                                    } else {
                                        $layout_updated = true;
                                    }
                                } else {
                                    // General photo: update entire layout
                                    $updated_layout_result = update_aisle_layout_from_photo($current_layout, $photo_analysis);
                                    $result = apply_layout_update_result($stores[$storeIndex], $updated_layout_result);
                                    if (isset($result['error'])) {
                                        $analysis_error = $result['error'];
                                    } else {
                                        $layout_updated = true;
                                    }
                                    add_photo_to_array($stores[$storeIndex], $photo_metadata, false);
                                }
                            } else {
                                if (empty($photo_analysis)) {
                                    $analysis_error = "Photo analysis returned empty result";
                                } elseif (!is_array($photo_analysis)) {
                                    $analysis_error = "Photo analysis returned invalid format: " . gettype($photo_analysis);
                                } elseif (!isset($photo_analysis['items']) || empty($photo_analysis['items'])) {
                                    $analysis_error = "No items detected in photo";
                                }
                                
                                // Still add photo even if analysis fails
                                require __DIR__ . '/includes/store-helpers.php';
                                handle_photo_upload_fallback($stores[$storeIndex], $current_layout, $photo_metadata, $create_new_section, $is_section_photo, $section_index);
                            }
                        } catch (Exception $e) {
                            $analysis_error = is_string($e->getMessage()) ? $e->getMessage() : 'Exception: ' . get_class($e);
                            error_log("Exception analyzing photo: " . $analysis_error);
                            // Continue with photo upload even if analysis fails
                            require __DIR__ . '/includes/store-helpers.php';
                            handle_photo_upload_fallback($stores[$storeIndex], $current_layout, $photo_metadata, $create_new_section, $is_section_photo, $section_index);
                        } catch (Throwable $e) {
                            $analysis_error = is_string($e->getMessage()) ? $e->getMessage() : 'Fatal error: ' . get_class($e);
                            error_log("Fatal error analyzing photo: " . $analysis_error);
                            // Continue with photo upload even if analysis fails
                            require __DIR__ . '/includes/store-helpers.php';
                            handle_photo_upload_fallback($stores[$storeIndex], $current_layout, $photo_metadata, $create_new_section, $is_section_photo, $section_index);
                        }
                        
                        // Updated timestamp is handled by save_store_layout, but ensure it's set if layout wasn't updated
                        if (!$layout_updated) {
                            $stores[$storeIndex]['updated'] = date('c');
                        }
                        write_json_file($stores_file, $stores);
                        
                        $response_data = [
                            'success' => true,
                            'photo' => [
                                'id' => $photo_id,
                                'url' => "/api/store-photos/{$store_id}/{$photo_id}",
                                'date_taken' => $photo_metadata['date_taken'],
                                'date_added' => $photo_metadata['date_added']
                            ]
                        ];
                        
                        if ($layout_updated) {
                            $response_data['layout_updated'] = true;
                            $response_data['store_layout'] = clean_aisle_layout($stores[$storeIndex]['aisle_layout']);
                            $response_data['detected_items'] = $photo_analysis['items'] ?? [];
                            $response_data['aisle'] = $photo_analysis['aisle_number'] ?? null;
                            $response_data['category'] = $photo_analysis['category'] ?? null;
                        }
                        
              if ($analysis_error) {
                  $response_data['analysis_error'] = $analysis_error;
              }
              
              json_response($response_data);
                    } catch (Throwable $e) {
                        error_log("Fatal error in photo upload: " . $e->getMessage() . " | File: " . $e->getFile() . " | Line: " . $e->getLine() . " | Trace: " . $e->getTraceAsString());
                        json_response([
                            'error' => 'Failed to upload photo: ' . $e->getMessage(),
                            'success' => false
                        ], 500);
                    }
                    break;
                    
                case 'DELETE':
                    // Delete a photo
                    if (!$photo_id) {
                        json_response(['error' => 'Photo ID is required'], 400);
                    }
                    
                    $photos_dir = get_store_photos_dir($store_id);
                    $photo_path = $photos_dir . '/' . $photo_id;
                    
                    // Delete the photo file
                    if (file_exists($photo_path)) {
                        unlink($photo_path);
                    }
                    
                    // Remove photo reference from store
                    if (isset($stores[$storeIndex]['photos'])) {
                        $stores[$storeIndex]['photos'] = array_values(array_filter(
                            $stores[$storeIndex]['photos'],
                            function($photo) use ($photo_id) {
                                // Handle both old format (string ID) and new format (object with id)
                                $id = is_array($photo) ? ($photo['id'] ?? null) : $photo;
                                return $id !== $photo_id;
                            }
                        ));
                        $stores[$storeIndex]['updated'] = date('c');
                        write_json_file($stores_file, $stores);
                    }
                    
                    json_response(['success' => true]);
                    break;
                    
                default:
                    json_response(['error' => 'Method not allowed'], 405);
            }
            break; // Exit early for store-photos
        }
        
        // Continue with grocery-stores case
                switch ($_SERVER['REQUEST_METHOD']) {
                    case 'GET':
                // Get all grocery stores
                $stores = read_json_file($stores_file, []);
                json_response(['stores' => $stores]);
                break;
                
            case 'POST':
                // Add a new grocery store with step-by-step AI processing
                require __DIR__ . '/../../config/config.php';
                require __DIR__ . '/includes/ai-helpers.php';
                
                $data = get_request_body();
                $input = trim($data['name'] ?? '');
                $step = $data['step'] ?? null; // 'basic', 'layout_description', 'aisle_layout', 'save', or null for all
                $store_data = $data['store_data'] ?? null; // For step 2, 3, and save, pass previous step data
                
                // If step is 'save' and we have complete store_data, skip AI steps and just save
                if ($step === 'save' && $store_data !== null) {
                    require __DIR__ . '/includes/store-helpers.php';
                    
                    $newStore = [
                        'id' => 'store-' . bin2hex(random_bytes(8)),
                        'name' => $store_data['name'],
                        'city' => $store_data['city'] ?? null,
                        'state' => $store_data['state'] ?? null,
                        'phone' => $store_data['phone'] ?? null,
                        'aisle_layout' => $store_data['aisle_layout'] ?? null,
                        'created' => date('c')
                    ];
                    
                    $stores = read_json_file($stores_file, []);
                    $stores[] = $newStore;
                    write_json_file($stores_file, $stores);
                    
                    json_response(['store' => $newStore, 'success' => true]);
                    break;
                }
                
                if (empty($input)) {
                    json_response(['error' => 'Store information is required'], 400);
                }
                
                set_ai_execution_time(600); // 10 minutes for all steps combined
                
                // Step 1: Parse basic store information
                if ($step === null || $step === 'basic') {
                    $basic_info = parse_store_basic_info($input);
                    
                    if (isset($basic_info['error'])) {
                        error_log("AI store basic info error: " . $basic_info['error']);
                        json_response(['error' => 'Failed to parse store information: ' . $basic_info['error']], 500);
                    }
                    
                    if (!isset($basic_info['name']) || empty($basic_info['name'])) {
                        json_response(['error' => 'Failed to extract store name from input'], 500);
                    }
                    
                    // If only step 1 requested, return basic info
                    if ($step === 'basic') {
                        json_response([
                            'step' => 'basic',
                            'store_data' => $basic_info,
                            'success' => true
                        ]);
                        break;
                    }
                    
                    $store_data = $basic_info;
                }
                
                // Step 2: Generate aisle layout
                if ($step === null || $step === 'aisle_layout') {
                    if ($store_data === null) {
                        json_response(['error' => 'Store basic information required'], 400);
                    }
                    
                    $aisle_result = generate_aisle_layout($store_data, $input);
                    
                    if (isset($aisle_result['error'])) {
                        error_log("AI aisle layout error: " . $aisle_result['error']);
                        json_response(['error' => 'Failed to generate aisle layout: ' . $aisle_result['error']], 500);
                    }
                    
                    $store_data['aisle_layout'] = $aisle_result['aisle_layout'] ?? null;
                    
                    // If only step 2 requested, return updated store data
                    if ($step === 'aisle_layout') {
                        json_response([
                            'step' => 'aisle_layout',
                            'store_data' => $store_data,
                            'success' => true
                        ]);
                        break;
                    }
                }
                
                // All steps complete - save the store
                require __DIR__ . '/includes/store-helpers.php';
                
                $newStore = [
                    'id' => 'store-' . bin2hex(random_bytes(8)),
                    'name' => $store_data['name'],
                    'city' => $store_data['city'] ?? null,
                    'state' => $store_data['state'] ?? null,
                    'phone' => $store_data['phone'] ?? null,
                    'aisle_layout' => $store_data['aisle_layout'] ?? null,
                    'created' => date('c')
                ];
                
                $stores = read_json_file($stores_file, []);
                $stores[] = $newStore;
                write_json_file($stores_file, $stores);
                
                json_response(['store' => $newStore, 'success' => true]);
                break;
                
                    case 'PUT':
                // Update an existing grocery store
                if (!$id) {
                    json_response(['error' => 'Store ID is required'], 400);
                }
                
                $data = get_request_body();
                $name = validate_store_name($data['name'] ?? '');
                
                $stores = read_json_file($stores_file, []);
                $storeIndex = find_store_index($stores, $id);
                
                if ($storeIndex === null) {
                    json_response(['error' => 'Store not found'], 404);
                }
                
                $stores[$storeIndex]['name'] = $name;
                $stores[$storeIndex]['updated'] = date('c');
                write_json_file($stores_file, $stores);
                json_response(['store' => $stores[$storeIndex], 'success' => true]);
                break;
                
            case 'PATCH':
                // Handle section management operations
                if (!$id) {
                    json_response(['error' => 'Store ID is required'], 400);
                }
                
                $data = get_request_body();
                $action = $data['action'] ?? '';
                
                $stores = read_json_file($stores_file, []);
                $storeIndex = find_store_index($stores, $id);
                
                if ($storeIndex === null) {
                    json_response(['error' => 'Store not found'], 404);
                }
                
                $store = &$stores[$storeIndex];
                $aisle_layout = $store['aisle_layout'] ?? [];
                
                // Ensure aisle_layout is an array
                if (!is_array($aisle_layout)) {
                    require __DIR__ . '/includes/store-helpers.php';
                    $aisle_layout = normalize_aisle_layout($aisle_layout) ?? [];
                    if (!is_array($aisle_layout)) {
                        $aisle_layout = [];
                    }
                }
                
                switch ($action) {
                    case 'add_section':
                        $section = $data['section'] ?? null;
                        if (!$section || !isset($section['aisle_number'])) {
                            json_response(['error' => 'Section data is required'], 400);
                        }
                        
                        // Ensure photos array exists
                        if (!isset($section['photos']) || !is_array($section['photos'])) {
                            $section['photos'] = [];
                        }
                        
                        $aisle_layout[] = [
                            'aisle_number' => $section['aisle_number'],
                            'category' => $section['category'] ?? '',
                            'items' => is_array($section['items'] ?? null) ? $section['items'] : [],
                            'photos' => $section['photos']
                        ];
                        
                        $store['aisle_layout'] = $aisle_layout;
                        $store['updated'] = date('c');
                        write_json_file($stores_file, $stores);
                        json_response(['store' => $store, 'success' => true]);
                        break;
                        
                    case 'update_section':
                        $section_index = $data['section_index'] ?? null;
                        $section = $data['section'] ?? null;
                        
                        if ($section_index === null || !is_numeric($section_index)) {
                            json_response(['error' => 'Section index is required'], 400);
                        }
                        
                        if (!$section || !isset($section['aisle_number'])) {
                            json_response(['error' => 'Section data is required'], 400);
                        }
                        
                        $section_index = (int)$section_index;
                        if ($section_index < 0 || $section_index >= count($aisle_layout)) {
                            json_response(['error' => 'Invalid section index'], 400);
                        }
                        
                        // Preserve existing photos
                        $existing_photos = $aisle_layout[$section_index]['photos'] ?? [];
                        if (!is_array($existing_photos)) {
                            $existing_photos = [];
                        }
                        
                        $aisle_layout[$section_index] = [
                            'aisle_number' => $section['aisle_number'],
                            'category' => $section['category'] ?? '',
                            'items' => is_array($section['items'] ?? null) ? $section['items'] : [],
                            'photos' => $existing_photos
                        ];
                        
                        $store['aisle_layout'] = $aisle_layout;
                        $store['updated'] = date('c');
                        write_json_file($stores_file, $stores);
                        json_response(['store' => $store, 'success' => true]);
                        break;
                        
                    case 'delete_section':
                        $section_index = $data['section_index'] ?? null;
                        
                        if ($section_index === null || !is_numeric($section_index)) {
                            json_response(['error' => 'Section index is required'], 400);
                        }
                        
                        $section_index = (int)$section_index;
                        if ($section_index < 0 || $section_index >= count($aisle_layout)) {
                            json_response(['error' => 'Invalid section index'], 400);
                        }
                        
                        // Delete photos associated with this section
                        $section_photos = $aisle_layout[$section_index]['photos'] ?? [];
                        if (is_array($section_photos)) {
                            require __DIR__ . '/includes/photo-helpers.php';
                            foreach ($section_photos as $photo) {
                                if (isset($photo['id'])) {
                                    $photo_path = get_store_photos_dir($id) . '/' . $photo['id'];
                                    if (file_exists($photo_path)) {
                                        @unlink($photo_path);
                                    }
                                }
                            }
                        }
                        
                        array_splice($aisle_layout, $section_index, 1);
                        
                        $store['aisle_layout'] = $aisle_layout;
                        $store['updated'] = date('c');
                        write_json_file($stores_file, $stores);
                        json_response(['store' => $store, 'success' => true]);
                        break;
                        
                    case 'delete_section_photo':
                        $section_index = $data['section_index'] ?? null;
                        $photo_id = $data['photo_id'] ?? null;
                        
                        if ($section_index === null || !is_numeric($section_index)) {
                            json_response(['error' => 'Section index is required'], 400);
                        }
                        
                        if (!$photo_id) {
                            json_response(['error' => 'Photo ID is required'], 400);
                        }
                        
                        $section_index = (int)$section_index;
                        if ($section_index < 0 || $section_index >= count($aisle_layout)) {
                            json_response(['error' => 'Invalid section index'], 400);
                        }
                        
                        $section_photos = &$aisle_layout[$section_index]['photos'];
                        if (!is_array($section_photos)) {
                            $section_photos = [];
                        }
                        
                        // Remove photo from array
                        $section_photos = array_filter($section_photos, function($photo) use ($photo_id) {
                            return isset($photo['id']) && $photo['id'] !== $photo_id;
                        });
                        $section_photos = array_values($section_photos); // Re-index
                        
                        // Delete photo file
                        require __DIR__ . '/includes/photo-helpers.php';
                        $photo_path = get_store_photos_dir($id) . '/' . $photo_id;
                        if (file_exists($photo_path)) {
                            @unlink($photo_path);
                        }
                        
                        $store['aisle_layout'] = $aisle_layout;
                        $store['updated'] = date('c');
                        write_json_file($stores_file, $stores);
                        json_response(['store' => $store, 'success' => true]);
                        break;
                        
                    default:
                        json_response(['error' => 'Invalid action'], 400);
                }
                break;
                
            case 'DELETE':
                // Delete a grocery store
                if (!$id) {
                    json_response(['error' => 'Store ID is required'], 400);
                }
                
                $stores = read_json_file($stores_file, []);
                $storeIndex = find_store_index($stores, $id);
                
                if ($storeIndex === null) {
                    json_response(['error' => 'Store not found'], 404);
                }
                
                // Delete associated photos directory
                $photos_dir = get_store_photos_dir($id);
                if (file_exists($photos_dir)) {
                    // Recursively delete photos directory
                    $files = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($photos_dir, RecursiveDirectoryIterator::SKIP_DOTS),
                        RecursiveIteratorIterator::CHILD_FIRST
                    );
                    foreach ($files as $fileinfo) {
                        $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                        @$todo($fileinfo->getRealPath());
                    }
                    @rmdir($photos_dir);
                }
                
                unset($stores[$storeIndex]);
                write_json_file($stores_file, array_values($stores));
                json_response(['success' => true]);
                        break;
                
                    default:
                json_response(['error' => 'Method not allowed'], 405);
        }
        break;
        
    case 'stores-lists':
        // Share stores lists (similar to task lists)
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'POST':
                // Create a new shared stores list
                $data = get_request_body();
                $share_id = generate_share_id();
                
                $list_data = [
                    'id' => $share_id,
                    'stores' => $data['stores'] ?? [],
                    'created' => date('c'),
                    'lastModified' => date('c')
                ];
                
                write_json_file(get_stores_list_file_path($share_id), $list_data);
                json_response(['shareId' => $share_id]);
                break;
                
            case 'GET':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                $file_path = get_stores_list_file_path($id);
                if (file_exists($file_path)) {
                    echo file_get_contents($file_path);
                } else {
                    json_response(['error' => 'Stores list not found'], 404);
                }
                break;

            case 'PUT':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                $file_path = get_stores_list_file_path($id);
                if (!file_exists($file_path)) {
                    json_response(['error' => 'Stores list not found'], 404);
                }
                
                $data = get_request_body();
                $list_data = read_json_file($file_path);
                $list_data['stores'] = $data['stores'] ?? [];
                $list_data['lastModified'] = date('c');
                
                write_json_file($file_path, $list_data);
                json_response(['success' => true]);
                break;
                
            case 'DELETE':
                if (!$id) {
                    json_response(['error' => 'Share ID is required'], 400);
                }
                $file_path = get_stores_list_file_path($id);
                if (!file_exists($file_path)) {
                    json_response(['error' => 'Stores list not found'], 404);
                }
                
                unlink($file_path);
                json_response(['success' => true]);
                break;
                
            default:
                json_response(['error' => 'Method not allowed'], 405);
        }
        break;

    default:
        json_response(['error' => 'Resource not found'], 404);
}
?>

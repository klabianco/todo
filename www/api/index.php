<?php
// Set headers for JSON API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
// Prevent caching so clients always fetch the latest list data
header('Cache-Control: no-store');

// Handle OPTIONS request for CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Debug info
$debug = [
    'request_uri' => $_SERVER['REQUEST_URI'],
    'request_method' => $_SERVER['REQUEST_METHOD'],
    'php_self' => $_SERVER['PHP_SELF']
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

// Helper function to clean and parse AI JSON response
function parse_ai_json_response($response) {
    // Clean markdown code blocks
    $response = trim(preg_replace('/^```(?:json)?\s*|\s*```$/m', '', trim($response)));
    
    if (empty($response)) {
        return null;
    }
    
    $result = json_decode($response, true);
    
    // If decode failed, log error
    if ($result === null && json_last_error() !== JSON_ERROR_NONE) {
        error_log('AI sort JSON decode error: ' . json_last_error_msg());
        error_log('AI sort raw response: ' . substr($response, 0, 500));
        return null;
    }
    
    return $result;
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
        // AI-powered grocery sorting endpoint - only receives active tasks from frontend
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method not allowed'], 405);
        }
        
        require __DIR__ . '/../../config/config.php';
        
        $data = get_request_body();
        $tasks = $data['tasks'] ?? [];
        
        if (empty($tasks)) {
            json_response(['tasks' => []]);
        }
        
        try {
            // Extract task text for AI processing
            $taskTexts = array_column($tasks, 'task');
            
            // Create AI instance and set up prompt for grocery sorting
            $ai = new AI();
            $ai->setJsonResponse(true);
            $ai->setSystemMessage("You are a grocery shopping assistant. Your job is to sort grocery items in the order they would typically be found in a supermarket, optimizing for shopping efficiency. Group similar items together (e.g., all fruits together, all meats together, dairy together, etc.). Think about typical supermarket layout: produce first, then meats, dairy, frozen foods, pantry items, etc. You MUST return a valid JSON object with a 'sortedItems' array containing strings.");
            $ai->setPrompt("Sort these grocery items in the optimal order for shopping at a supermarket. Return ONLY a valid JSON object with this exact structure:\n\n{\n  \"sortedItems\": [\"item1\", \"item2\", \"item3\", ...]\n}\n\nItems to sort:\n" . 
                         json_encode($taskTexts, JSON_PRETTY_PRINT) . 
                         "\n\nReturn the items in the order they should be shopped, grouped by category (produce together, meats together, dairy together, etc.). The 'sortedItems' array must contain exactly the same item strings as provided, just reordered.");
            
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
            
            // Extract sorted items
            $sortedItems = extract_sorted_items($aiResult);
            if ($sortedItems === null || !is_array($sortedItems)) {
                error_log('AI sort invalid response format. Response: ' . substr($response, 0, 1000));
                error_log('Parsed result: ' . json_encode($aiResult));
                json_response(['tasks' => $tasks, 'error' => 'Invalid AI response format']);
            }
            
            // Verify count match (warn but don't fail)
            if (count($sortedItems) !== count($tasks)) {
                error_log('AI sort count mismatch: sent ' . count($tasks) . ', got ' . count($sortedItems));
            }
            
            // Reorder tasks based on AI sorting
            $sortedTasks = reorder_tasks($tasks, $sortedItems);
            
            json_response(['tasks' => $sortedTasks]);
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
        
        // Increase execution time limit for AI operations (5 minutes)
        set_time_limit(300);
        ini_set('max_execution_time', 300);
        
        require __DIR__ . '/../../config/config.php';
        
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
            
            // Create AI instance and set up prompt for extracting items
            $ai = new AI();
            $ai->setJsonResponse(true);
            $ai->setSystemMessage("You are a helpful assistant that extracts actionable items (like ingredients, tasks, or items to buy) from web content. Extract all relevant items and return them as a simple list. For recipes, extract ingredients. For articles, extract actionable items or tasks mentioned.");
            $ai->setPrompt("Extract all actionable items (ingredients, tasks, items to buy, etc.) from the following content. Return ONLY a valid JSON object with this exact structure:\n\n{\n  \"items\": [\"item1\", \"item2\", \"item3\", ...]\n}\n\nContent:\n" . $text . "\n\nReturn the items as a simple array of strings. Each item should be clear and actionable (e.g., \"2 cups flour\" or \"Buy milk\" or \"Call dentist\").");
            
            // Try AI models with fallback
            global $aiModelFallbacks;
            $response = try_ai_models($ai, $aiModelFallbacks);
            
            // Check if we got an error instead of a response
            if (is_array($response) && isset($response['error'])) {
                error_log('AI import-url: All models failed. Last error: ' . $response['error']);
                json_response(['error' => 'AI service unavailable. Please check API key and model availability.'], 500);
            }
            
            // Parse AI response
            $aiResult = parse_ai_json_response($response);
            if ($aiResult === null) {
                error_log('AI import-url: Response is empty or invalid after parsing');
                json_response(['error' => 'AI service returned invalid response'], 500);
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
        // Grocery stores endpoint - shared across all users
        $stores_file = $data_dir . '/grocery-stores.json';
        
        // Helper function to find store index by ID
        function find_store_index($stores, $id) {
            foreach ($stores as $index => $store) {
                if ($store['id'] === $id) {
                    return $index;
                }
            }
            return null;
        }
        
        // Helper function to validate store name
        function validate_store_name($name) {
            $name = trim($name ?? '');
            if (empty($name)) {
                json_response(['error' => 'Store name is required'], 400);
            }
            return $name;
        }
        
        switch ($_SERVER['REQUEST_METHOD']) {
            case 'GET':
                // Get all grocery stores
                $stores = read_json_file($stores_file, []);
                json_response(['stores' => $stores]);
                break;
                
            case 'POST':
                // Add a new grocery store
                $data = get_request_body();
                $name = validate_store_name($data['name'] ?? '');
                
                $stores = read_json_file($stores_file, []);
                $newStore = [
                    'id' => 'store-' . bin2hex(random_bytes(8)),
                    'name' => $name,
                    'created' => date('c')
                ];
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
                
                unset($stores[$storeIndex]);
                write_json_file($stores_file, array_values($stores));
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

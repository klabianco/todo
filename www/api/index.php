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
        
        // Extract task text for AI processing
        $taskTexts = array_column($tasks, 'task');
        
        // Create AI instance and set up prompt for grocery sorting
        $ai = new AI();
        $ai->setJsonResponse(true);
        $ai->setSystemMessage("You are a grocery shopping assistant. Your job is to sort grocery items in the order they would typically be found in a supermarket, optimizing for shopping efficiency. Group similar items together (e.g., all fruits together, all meats together, dairy together, etc.). Think about typical supermarket layout: produce first, then meats, dairy, frozen foods, pantry items, etc. You MUST return a valid JSON object with a 'sortedItems' array containing strings.");
        $ai->setPrompt("Sort these grocery items in the optimal order for shopping at a supermarket. Return ONLY a valid JSON object with this exact structure:\n\n{\n  \"sortedItems\": [\"item1\", \"item2\", \"item3\", ...]\n}\n\nItems to sort:\n" . 
                     json_encode($taskTexts, JSON_PRETTY_PRINT) . 
                     "\n\nReturn the items in the order they should be shopped, grouped by category (produce together, meats together, dairy together, etc.). The 'sortedItems' array must contain exactly the same item strings as provided, just reordered.");
        
        try {
            $response = $ai->getResponseFromOpenAi(
                $ai->getSystemMessage(),
                1.0, // Temperature 1.0 for compatibility with gpt-5-nano
                0,
                "gpt-5-nano",
                2000,
                true
            );
            
            // Clean and parse JSON response
            $response = trim($response);
            // Remove any markdown code blocks if present
            $response = preg_replace('/^```json\s*/', '', $response);
            $response = preg_replace('/^```\s*/', '', $response);
            $response = preg_replace('/\s*```$/', '', $response);
            $response = trim($response);
            
            $aiResult = json_decode($response, true);
            
            // If first decode failed, try decoding again (in case response is double-encoded)
            if ($aiResult === null && json_last_error() !== JSON_ERROR_NONE) {
                $decoded = json_decode($response, true);
                if ($decoded !== null) {
                    $aiResult = $decoded;
                }
            }
            
            // Extract sorted items from various possible response formats
            $sortedItems = null;
            if (isset($aiResult['sortedItems']) && is_array($aiResult['sortedItems'])) {
                $sortedItems = $aiResult['sortedItems'];
            } elseif (isset($aiResult['items']) && is_array($aiResult['items'])) {
                $sortedItems = $aiResult['items'];
            } elseif (isset($aiResult['sorted']) && is_array($aiResult['sorted'])) {
                $sortedItems = $aiResult['sorted'];
            } elseif (is_array($aiResult) && isset($aiResult[0])) {
                // If response is directly an array
                $sortedItems = $aiResult;
            }
            
            if ($sortedItems === null || !is_array($sortedItems)) {
                error_log('AI sort invalid response format. Response: ' . substr($response, 0, 1000));
                error_log('Parsed result: ' . json_encode($aiResult));
                json_response(['tasks' => $tasks, 'error' => 'Invalid AI response format']);
            }
            
            // Verify count match (warn but don't fail)
            if (count($sortedItems) !== count($tasks)) {
                error_log('AI sort count mismatch: sent ' . count($tasks) . ', got ' . count($sortedItems));
            }
            
            // Build task map (handles duplicates)
            $taskMap = [];
            foreach ($tasks as $task) {
                $taskMap[$task['task']][] = $task;
            }
            
            // Reorder tasks based on AI sorting
            $sortedTasks = [];
            foreach ($sortedItems as $text) {
                // Handle both string and object formats
                $taskText = is_string($text) ? $text : (isset($text['task']) ? $text['task'] : (isset($text['text']) ? $text['text'] : $text));
                
                if (!empty($taskMap[$taskText])) {
                    $sortedTasks[] = array_shift($taskMap[$taskText]);
                }
            }
            
            // Add remaining tasks (safety fallback)
            foreach ($taskMap as $remainingTasks) {
                $sortedTasks = array_merge($sortedTasks, $remainingTasks);
            }
            
            json_response(['tasks' => $sortedTasks]);
        } catch (Exception $e) {
            error_log('AI sort error: ' . $e->getMessage());
            json_response(['tasks' => $tasks, 'error' => 'Sorting failed, returning original order']);
        }
        break;

    default:
        json_response(['error' => 'Resource not found'], 404);
}
?>

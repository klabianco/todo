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
                $data = json_decode(file_get_contents('php://input'), true);
                $share_id = generate_share_id();
                $tasks = isset($data['tasks']) ? $data['tasks'] : [];
                $focus_id = isset($data['focusId']) ? $data['focusId'] : null;
                
                $list_data = [
                    'id' => $share_id,
                    'tasks' => $tasks,
                    'focusId' => $focus_id,
                    'created' => date('c'),
                    'lastModified' => date('c')
                ];
                
                file_put_contents(get_task_file_path($share_id), json_encode($list_data));
                echo json_encode(['shareId' => $share_id]);
                break;
                
            case 'GET':
                if ($id) {
                    // Get a specific task list
                    $file_path = get_task_file_path($id);
                    if (file_exists($file_path)) {
                        echo file_get_contents($file_path);
                    } else {
                        http_response_code(404);
                        echo json_encode(['error' => 'Task list not found']);
                    }
                } else {
                    http_response_code(400);
                    echo json_encode(['error' => 'Share ID is required']);
                }
                break;
                
            case 'PUT':
                if ($id) {
                    // Update a specific task list
                    $file_path = get_task_file_path($id);
                    if (file_exists($file_path)) {
                        $data = json_decode(file_get_contents('php://input'), true);
                        $tasks = isset($data['tasks']) ? $data['tasks'] : [];
                        $focus_id = isset($data['focusId']) ? $data['focusId'] : null;

                        $list_data = json_decode(file_get_contents($file_path), true);
                        $list_data['tasks'] = $tasks;
                        if ($focus_id !== null) {
                            $list_data['focusId'] = $focus_id;
                        }
                        
                        // Always update the lastModified timestamp with current server time
                        // This ensures changes are detected by viewers polling for updates
                        $list_data['lastModified'] = date('c');
                        
                        file_put_contents($file_path, json_encode($list_data));
                        echo json_encode(['success' => true]);
                    } else {
                        http_response_code(404);
                        echo json_encode(['error' => 'Task list not found']);
                    }
                } else {
                    http_response_code(400);
                    echo json_encode(['error' => 'Share ID is required']);
                }
                break;
                
            case 'DELETE':
                if ($id) {
                    // Delete a specific task list
                    $file_path = get_task_file_path($id);
                    if (file_exists($file_path)) {
                        // Get all users with subscription data
                        $users_dir = $data_dir . '/users';
                        if (file_exists($users_dir)) {
                            $user_dirs = glob($users_dir . '/*', GLOB_ONLYDIR);
                            
                            // Process each user's subscriptions
                            foreach ($user_dirs as $user_dir) {
                                $subscribed_path = $user_dir . '/subscribed.json';
                                if (file_exists($subscribed_path)) {
                                    $subscribed_data = json_decode(file_get_contents($subscribed_path), true);
                                    if (is_array($subscribed_data)) {
                                        // Remove the deleted list from subscriptions
                                        $updated_lists = array_filter($subscribed_data, function($item) use ($id) {
                                            return !isset($item['id']) || $item['id'] !== $id;
                                        });
                                        
                                        // Save updated subscriptions
                                        file_put_contents($subscribed_path, json_encode(array_values($updated_lists)));
                                    }
                                }
                            }
                        }
                        
                        // Delete the list file
                        unlink($file_path);
                        echo json_encode(['success' => true]);
                    } else {
                        http_response_code(404);
                        echo json_encode(['error' => 'Task list not found']);
                    }
                } else {
                    http_response_code(400);
                    echo json_encode(['error' => 'Share ID is required']);
                }
                break;
                
            default:
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
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
                        $tasks = file_exists($tasksPath) ? json_decode(file_get_contents($tasksPath), true) : [];
                        $sticky = file_exists($stickyPath) ? json_decode(file_get_contents($stickyPath), true) : [];
                        echo json_encode(['tasks' => array_merge($tasks, $sticky)]);
                        break;
                    case 'PUT':
                        $data = json_decode(file_get_contents('php://input'), true);
                        $incoming = isset($data['tasks']) ? $data['tasks'] : [];
                        $stickyTasks = [];
                        $nonSticky = [];
                        foreach ($incoming as $t) {
                            if (isset($t['sticky']) && $t['sticky']) {
                                $stickyTasks[] = $t;
                            } else {
                                $nonSticky[] = $t;
                            }
                        }
                        file_put_contents($tasksPath, json_encode($nonSticky));
                        file_put_contents($stickyPath, json_encode($stickyTasks));
                        echo json_encode(['success' => true]);
                        break;
                    default:
                        http_response_code(405);
                        echo json_encode(['error' => 'Method not allowed']);
                }
                break;

            case 'subscriptions':
                $path = get_user_data_path($userId, 'subscribed');
                switch ($_SERVER['REQUEST_METHOD']) {
                    case 'GET':
                        $lists = file_exists($path) ? json_decode(file_get_contents($path), true) : [];
                        echo json_encode(['lists' => $lists]);
                        break;
                    case 'PUT':
                        $data = json_decode(file_get_contents('php://input'), true);
                        $lists = isset($data['lists']) ? $data['lists'] : [];
                        file_put_contents($path, json_encode($lists));
                        echo json_encode(['success' => true]);
                        break;
                    default:
                        http_response_code(405);
                        echo json_encode(['error' => 'Method not allowed']);
                }
                break;

            case 'owned':
                $path = get_user_data_path($userId, 'owned');
                switch ($_SERVER['REQUEST_METHOD']) {
                    case 'GET':
                        $lists = file_exists($path) ? json_decode(file_get_contents($path), true) : [];
                        echo json_encode(['lists' => $lists]);
                        break;
                    case 'PUT':
                        $data = json_decode(file_get_contents('php://input'), true);
                        $lists = isset($data['lists']) ? $data['lists'] : [];
                        file_put_contents($path, json_encode($lists));
                        echo json_encode(['success' => true]);
                        break;
                    default:
                        http_response_code(405);
                        echo json_encode(['error' => 'Method not allowed']);
                }
                break;

            default:
                http_response_code(404);
                echo json_encode(['error' => 'User resource not found']);
        }
        break;

    case 'sort':
        // AI-powered grocery sorting endpoint
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            require __DIR__ . '/../../config/config.php';
            
            $data = json_decode(file_get_contents('php://input'), true);
            $tasks = isset($data['tasks']) ? $data['tasks'] : [];
            
            if (empty($tasks)) {
                echo json_encode(['tasks' => []]);
                exit;
            }
            
            // Separate active and completed tasks - only sort active ones
            $activeTasks = [];
            $completedTasks = [];
            
            foreach ($tasks as $task) {
                if (isset($task['completed']) && $task['completed']) {
                    $completedTasks[] = $task;
                } else {
                    $activeTasks[] = $task;
                }
            }
            
            // Only sort if we have active tasks to sort
            if (empty($activeTasks)) {
                echo json_encode(['tasks' => $tasks]);
                exit;
            }
            
            // Extract task text for AI processing (only from active tasks)
            $taskTexts = array_map(function($task) {
                return $task['task'];
            }, $activeTasks);
            
            // Create AI instance and set up prompt for grocery sorting
            $ai = new AI();
            $ai->setJsonResponse(true);
            
            $systemMessage = "You are a grocery shopping assistant. Your job is to sort grocery items in the order they would typically be found in a supermarket, optimizing for shopping efficiency. Group similar items together (e.g., all fruits together, all meats together, dairy together, etc.). Think about typical supermarket layout: produce first, then meats, dairy, frozen foods, pantry items, etc.";
            
            $prompt = "Sort these grocery items in the optimal order for shopping at a supermarket. Return ONLY a JSON object with an array called 'sortedItems' containing the task text strings in the optimal order:\n\n" . 
                     json_encode($taskTexts, JSON_PRETTY_PRINT) . 
                     "\n\nReturn the items in the order they should be shopped, grouped by category (produce together, meats together, dairy together, etc.).";
            
            $ai->setPrompt($prompt);
            $ai->setSystemMessage($systemMessage);
            
            try {
                // Use gpt-5-nano for fast, efficient sorting
                $model = "gpt-5-nano";
                
                // Some models only support temperature of 1.0
                // Use temperature 1.0 for compatibility
                $temperature = 1.0;
                
                // Use OpenAI with a fast model for sorting
                $response = $ai->getResponseFromOpenAi(
                    $systemMessage,
                    $temperature,
                    0,
                    $model,
                    2000,
                    true
                );
                
                $aiResult = json_decode($response, true);
                
                if (!isset($aiResult['sortedItems']) || !is_array($aiResult['sortedItems'])) {
                    // Fallback: return original order if AI response is invalid
                    echo json_encode(['tasks' => $tasks]);
                    exit;
                }
                
                $sortedTexts = $aiResult['sortedItems'];
                
                // Create a map of task text to task objects
                $taskMap = [];
                foreach ($activeTasks as $task) {
                    $text = $task['task'];
                    if (!isset($taskMap[$text])) {
                        $taskMap[$text] = [];
                    }
                    $taskMap[$text][] = $task;
                }
                
                // Reorder active tasks based on AI sorting
                $sortedActiveTasks = [];
                foreach ($sortedTexts as $text) {
                    if (isset($taskMap[$text]) && !empty($taskMap[$text])) {
                        // Take the first matching task
                        $sortedActiveTasks[] = array_shift($taskMap[$text]);
                    }
                }
                
                // Add any remaining tasks that weren't in the AI response (shouldn't happen, but safety)
                foreach ($taskMap as $remainingTasks) {
                    foreach ($remainingTasks as $task) {
                        $sortedActiveTasks[] = $task;
                    }
                }
                
                // Combine: sorted active tasks first, then completed tasks (in their original order)
                // Completed tasks are NOT sorted - they stay exactly as they were
                $resultTasks = array_merge($sortedActiveTasks, $completedTasks);
                
                echo json_encode(['tasks' => $resultTasks]);
            } catch (Exception $e) {
                // On error, return original order
                error_log('AI sort error: ' . $e->getMessage());
                echo json_encode(['tasks' => $tasks, 'error' => 'Sorting failed, returning original order']);
            }
        } else {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Resource not found']);
}
?>

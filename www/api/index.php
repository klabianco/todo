<?php
// Set headers for JSON API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

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
                
            default:
                http_response_code(405);
                echo json_encode(['error' => 'Method not allowed']);
        }
        break;
        
    default:
        http_response_code(404);
        echo json_encode(['error' => 'Resource not found']);
}
?>

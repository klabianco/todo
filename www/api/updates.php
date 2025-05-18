<?php
// Simple Server-Sent Events endpoint for real-time updates
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Ensure script doesn't timeout
set_time_limit(0);

// Get share ID
$shareId = isset($_GET['share']) ? $_GET['share'] : null;
if (!$shareId) {
    http_response_code(400);
    echo "data: {\"error\":\"Share ID required\"}\n\n";
    flush();
    exit;
}

// Data directory and file path
$dataDir = __DIR__ . '/data';
$filepath = $dataDir . '/' . $shareId . '.json';
if (!file_exists($filepath)) {
    http_response_code(404);
    echo "data: {\"error\":\"List not found\"}\n\n";
    flush();
    exit;
}

$lastModified = filemtime($filepath);

// Keep connection open and send updates when file changes
while (true) {
    if (connection_aborted()) {
        break;
    }
    clearstatcache(false, $filepath);
    $currentModified = filemtime($filepath);
    if ($currentModified !== $lastModified) {
        $lastModified = $currentModified;
        $data = file_get_contents($filepath);
        echo "data: $data\n\n";
        ob_flush();
        flush();
    }
    sleep(2);
}
?>

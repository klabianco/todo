<?php
// Simple Server-Sent Events endpoint for real-time updates
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
// Allow cross-origin requests like the REST API
header('Access-Control-Allow-Origin: *');

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
// Send a comment every so often so Cloudflare doesn't close the connection
$lastPing = time();
$pingInterval = 25; // seconds

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
        $lastPing = time();
    }
    if (time() - $lastPing >= $pingInterval) {
        echo ": ping\n\n";
        ob_flush();
        flush();
        $lastPing = time();
    }
    sleep(2);
}
?>

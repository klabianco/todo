<?php

error_reporting(E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../../error_log');

require __DIR__ . '/../../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . "/../..");
$dotenv->load();

$defaultOpenAIModel = "gpt-5-mini";

// AI model fallback list (primary first, then fallbacks)
$aiModelFallbacks = ["gpt-5-mini", "gpt-4o-mini", "gpt-3.5-turbo"];

spl_autoload_register(function ($class_name) {
    include(__DIR__ . '/../src/' . $class_name . '.php');
});
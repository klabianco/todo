<?php

error_reporting(E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../../error_log');

require __DIR__ . '/../../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . "/../..");
$dotenv->load();

$defaultOpenAIModel = "gpt-5-mini";

spl_autoload_register(function ($class_name) {
    include(__DIR__ . '/../src/' . $class_name . '.php');
});
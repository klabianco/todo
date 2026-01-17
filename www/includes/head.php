<?php
/**
 * Shared HTML head section
 * @param string $title Page title
 * @param array $extraScripts Additional script tags to include
 * @param bool $includeThemeScript Whether to include theme initialization script
 */
function renderHead($title = 'Todo', $extraScripts = [], $includeThemeScript = false) {
    $defaultScripts = [
        'sortablejs' => '<script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>',
        'jspdf' => '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>',
        'xlsx' => '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
    ];
    
    $scriptsToInclude = array_intersect_key($defaultScripts, array_flip($extraScripts));
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title><?php echo htmlspecialchars($title); ?></title>
    <!-- Open Graph meta tags for social sharing -->
    <meta property="og:title" content="<?php echo htmlspecialchars($title); ?>">
    <meta property="og:type" content="website">
    <meta property="og:description" content="<?php echo htmlspecialchars($title); ?>">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="<?php echo htmlspecialchars($title); ?>">
    <!-- Tailwind CSS (production version) -->
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <!-- Font Awesome icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <?php foreach ($scriptsToInclude as $script): ?>
    <?php echo $script . "\n    "; ?>
    <?php endforeach; ?>
    <!-- Minimal styles without animations -->
    <link rel="stylesheet" href="/assets/css/todo.css">
    <?php if ($includeThemeScript): ?>
    <script type="module" src="/assets/js/includes/theme-init.js"></script>
    <?php endif; ?>
</head>
<body class="bg-gray-100 text-gray-700 min-h-screen dark:bg-gray-900 dark:text-gray-300">
<?php
}
?>


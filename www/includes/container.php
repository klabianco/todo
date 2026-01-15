<?php
/**
 * Render page container wrapper
 * @param string $maxWidth Tailwind max-width class (default: 'max-w-lg')
 */
function renderContainerStart($maxWidth = 'max-w-2xl') {
    ?>
    <div class="container mx-auto px-6 py-8 <?php echo htmlspecialchars($maxWidth); ?>">
<?php
}

function renderContainerEnd() {
    ?>
    </div>
<?php
}
?>


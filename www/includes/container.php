<?php
/**
 * Render page container wrapper
 * @param string $maxWidth Tailwind max-width class (default: 'max-w-lg')
 */
function renderContainerStart($maxWidth = 'max-w-lg') {
    ?>
    <div class="container mx-auto px-4 py-6 <?php echo htmlspecialchars($maxWidth); ?>">
<?php
}

function renderContainerEnd() {
    ?>
    </div>
<?php
}
?>


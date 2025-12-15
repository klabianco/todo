/**
 * Import and Export functionality for the Todo app
 */
import * as utils from './utils.js';
import * as storage from './storage.js';
import { showLoadingOverlay, hideLoadingOverlay } from './overlay-utils.js';

// Flatten tasks for display (recursive)
export const flattenTasksForDisplay = (tasks, level = 0, parentPath = '', includeSubtasks = true) => {
    const result = [];
    tasks.forEach(task => {
        const indent = '  '.repeat(level);
        const path = parentPath ? `${parentPath} > ${task.task}` : task.task;
        result.push({
            task: task.task,
            completed: task.completed,
            level: level,
            indent: indent,
            path: path,
            subtasks: task.subtasks || []
        });
        
        if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
            result.push(...flattenTasksForDisplay(task.subtasks, level + 1, path, includeSubtasks));
        }
    });
    return result;
};

// Export to PDF
export const exportToPDF = (tasks, filename, includeSubtasks = true) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const flattened = flattenTasksForDisplay(tasks, 0, '', includeSubtasks);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 7;
    let y = margin;
    
    // Title
    doc.setFontSize(18);
    doc.text('Todo List', margin, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Exported: ${new Date().toLocaleDateString()}`, margin, y);
    y += 10;
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    
    // Group by completion status
    const activeTasks = utils.filterTasks(flattened, { completed: false });
    const completedTasks = utils.filterTasks(flattened, { completed: true });
    
    // Active tasks
    if (activeTasks.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Active Tasks', margin, y);
        y += 8;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        activeTasks.forEach(task => {
            if (y > pageHeight - margin - 10) {
                doc.addPage();
                y = margin;
            }
            const text = `${task.indent}${task.task}`;
            doc.text(text, margin, y, { maxWidth: pageWidth - margin * 2 });
            y += lineHeight;
        });
        y += 5;
    }
    
    // Completed tasks
    if (completedTasks.length > 0) {
        if (y > pageHeight - margin - 15) {
            doc.addPage();
            y = margin;
        }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Completed Tasks', margin, y);
        y += 8;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        
        completedTasks.forEach(task => {
            if (y > pageHeight - margin - 10) {
                doc.addPage();
                y = margin;
            }
            const text = `${task.indent}✓ ${task.task}`;
            doc.text(text, margin, y, { maxWidth: pageWidth - margin * 2 });
            y += lineHeight;
        });
    }
    
    doc.save(filename);
};

// Export to Excel
export const exportToExcel = (tasks, filename, includeSubtasks = true) => {
    const flattened = flattenTasksForDisplay(tasks, 0, '', includeSubtasks);
    
    const worksheetData = [['Task', 'Status', 'Level']];
    
    flattened.forEach(task => {
        worksheetData.push([
            task.task,
            task.completed ? 'Completed' : 'Active',
            task.level
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    ws['!cols'] = [
        { wch: 50 },
        { wch: 12 },
        { wch: 8 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Todo List');
    XLSX.writeFile(wb, filename);
};

// Handle Confirm Export
export const handleConfirmExport = async (currentFocusedTaskId) => {
    const exportModal = document.getElementById('export-modal');
    const exportOption = document.querySelector('input[name="export-option"]:checked')?.value || 'all';
    const exportFormat = document.querySelector('input[name="export-format"]:checked')?.value || 'json';
    const includeCompleted = document.querySelector('input[name="export-completed"]:checked')?.value || 'include';
    
    try {
        const allTasks = await storage.loadTasks();
        let tasksToExport = [];
        
        if (exportOption === 'current') {
            if (currentFocusedTaskId) {
                const result = utils.findTaskById(allTasks, currentFocusedTaskId);
                if (result?.task) {
                    tasksToExport = result.task.subtasks || [];
                }
            } else {
                const context = utils.getCurrentViewContext(allTasks, currentFocusedTaskId, utils.findTaskById);
                if (context) {
                    tasksToExport = context.tasks;
                } else {
                    tasksToExport = [];
                }
            }
        } else {
            tasksToExport = allTasks;
        }
        
        if (includeCompleted === 'exclude') {
            tasksToExport = utils.filterTasks(tasksToExport, { completed: false });
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        const includeSubtasks = exportOption === 'all';
        
        if (exportFormat === 'pdf') {
            exportToPDF(tasksToExport, `todo-list-${dateStr}.pdf`, includeSubtasks);
        } else if (exportFormat === 'excel') {
            exportToExcel(tasksToExport, `todo-list-${dateStr}.xlsx`, includeSubtasks);
        } else {
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                tasks: tasksToExport
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `todo-list-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        if (exportModal) {
            exportModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    } catch (error) {
        console.error('Error exporting:', error);
        alert('Failed to export list: ' + error.message);
    }
};

// Handle Import File
export const handleImportFile = async (event, renderTasks) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const importModal = document.getElementById('import-modal');
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (!importData.tasks || !Array.isArray(importData.tasks)) {
            throw new Error('Invalid file format. Expected a JSON file with a "tasks" array.');
        }
        
        if (importModal) {
            importModal.classList.add('hidden');
        }
        
        const confirmed = confirm(
            `This will import ${importData.tasks.length} task(s). ` +
            `Do you want to merge with your current list or replace it?\n\n` +
            `Click OK to merge, Cancel to replace.`
        );
        
        const currentTasks = await storage.loadTasks();
        let finalTasks = [];
        
        if (confirmed) {
            const existingIds = new Set(currentTasks.map(t => t.id));
            const newTasks = importData.tasks.filter(t => !existingIds.has(t.id));
            finalTasks = [...currentTasks, ...newTasks];
        } else {
            finalTasks = importData.tasks;
        }
        
        await storage.saveTasks(finalTasks);
        await renderTasks();
        
        alert(`Successfully imported ${importData.tasks.length} task(s)!`);
        event.target.value = '';
    } catch (error) {
        console.error('Error importing:', error);
        alert('Failed to import list: ' + error.message);
        event.target.value = '';
    }
};

// Check if URL is a todo share link and extract the share ID
export const extractShareIdFromUrl = (url) => {
    try {
        const parsed = new URL(url);
        if (parsed.hostname === 'todo.o9p.net' || parsed.hostname === 'www.todo.o9p.net' || parsed.hostname === 'local.todo.o9p.net') {
            const shareId = parsed.searchParams.get('share');
            if (shareId) return shareId;
        }
    } catch (e) {
        // Not a valid URL
    }
    return null;
};

// Handle importing from a share link
export const handleImportFromShareLink = async (shareId, importModal, importUrlInput, currentFocusedTaskId, renderTasks) => {
    showLoadingOverlay('Importing shared list...', 'Please wait');
    
    try {
        const response = await utils.apiFetch(`/api/lists/${shareId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Shared list not found. It may have been deleted.');
            }
            throw new Error('Failed to fetch shared list');
        }
        
        const data = await response.json();
        
        if (!data.tasks || !Array.isArray(data.tasks) || data.tasks.length === 0) {
            throw new Error('The shared list is empty');
        }
        
        if (importModal) {
            importModal.classList.add('hidden');
        }
        
        const currentTasks = await storage.loadTasks();
        const importedTasks = utils.reassignTaskIds(data.tasks);
        const totalImported = utils.countTasks(importedTasks);
        
        if (currentFocusedTaskId) {
            const focusedResult = utils.findTaskById(currentTasks, currentFocusedTaskId);
            if (focusedResult && focusedResult.task) {
                const focusedTask = focusedResult.task;
                if (!focusedTask.subtasks) {
                    focusedTask.subtasks = [];
                }
                importedTasks.forEach(t => t.parentId = currentFocusedTaskId);
                utils.insertAtActiveTop(focusedTask.subtasks, ...importedTasks);
            }
        } else {
            utils.insertAtActiveTop(currentTasks, ...importedTasks);
        }
        
        await storage.saveTasks(currentTasks);
        await renderTasks();
        
        alert(`Successfully imported ${totalImported} item(s) from shared list!`);
        
        if (importUrlInput) {
            importUrlInput.value = '';
        }
    } finally {
        hideLoadingOverlay();
    }
};

// Handle Import from URL (AI extraction or share link)
export const handleImportFromUrl = async (currentFocusedTaskId, renderTasks) => {
    const importUrlInput = utils.$('import-url-input');
    const confirmImportUrlButton = utils.$('confirm-import-url');
    const cancelImportButton = utils.$('cancel-import');
    const importModal = utils.$('import-modal');
    
    const url = importUrlInput?.value.trim();
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL');
        return;
    }
    
    // Check if this is a share link
    const shareId = extractShareIdFromUrl(url);
    if (shareId) {
        const originalText = confirmImportUrlButton.innerHTML;
        utils.setButtonLoading(confirmImportUrlButton, 'Importing...');
        confirmImportUrlButton.disabled = true;
        if (cancelImportButton) cancelImportButton.disabled = true;
        if (importUrlInput) importUrlInput.disabled = true;
        
        try {
            await handleImportFromShareLink(shareId, importModal, importUrlInput, currentFocusedTaskId, renderTasks);
        } catch (error) {
            console.error('Error importing from share link:', error);
            alert('Failed to import shared list: ' + error.message);
        } finally {
            utils.restoreButtonState(confirmImportUrlButton, originalText);
            if (confirmImportUrlButton) confirmImportUrlButton.disabled = false;
            if (cancelImportButton) cancelImportButton.disabled = false;
            if (importUrlInput) importUrlInput.disabled = false;
        }
        return;
    }
    
    // Not a share link - proceed with AI extraction
    showLoadingOverlay('Fetching URL and extracting items with AI...', 'Please wait');
    
    const originalText = confirmImportUrlButton.innerHTML;
    utils.setButtonLoading(confirmImportUrlButton, 'Importing...');
    confirmImportUrlButton.disabled = true;
    if (cancelImportButton) cancelImportButton.disabled = true;
    if (importUrlInput) importUrlInput.disabled = true;
    
    try {
        const response = await utils.apiFetch('/api/import-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to import from URL');
        }
        
        const data = await response.json();
        
        if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
            throw new Error('No items could be extracted from the URL');
        }
        
        if (importModal) {
            importModal.classList.add('hidden');
        }
        
        const currentTasks = await storage.loadTasks();
        const parentTaskTitle = data.title || 'Imported List';
        const parentTaskId = utils.generateUUID();
        
        const subtasks = data.items.map(item => ({
            id: utils.generateUUID(),
            task: item,
            completed: false,
            sticky: false,
            subtasks: [],
            parentId: parentTaskId,
            created: new Date().toISOString()
        }));
        
        const parentTask = {
            id: parentTaskId,
            task: parentTaskTitle,
            completed: false,
            sticky: false,
            subtasks: subtasks,
            created: new Date().toISOString()
        };
        
        if (currentFocusedTaskId) {
            const focusedResult = utils.findTaskById(currentTasks, currentFocusedTaskId);
            if (focusedResult && focusedResult.task) {
                const focusedTask = focusedResult.task;
                parentTask.parentId = currentFocusedTaskId;
                if (!focusedTask.subtasks) {
                    focusedTask.subtasks = [];
                }
                utils.insertAtActiveTop(focusedTask.subtasks, parentTask);
            } else {
                utils.insertAtActiveTop(currentTasks, parentTask);
            }
        } else {
            utils.insertAtActiveTop(currentTasks, parentTask);
        }
        
        await storage.saveTasks(currentTasks);
        await renderTasks();
        
        alert(`Successfully imported ${data.items.length} item(s) from URL as subtasks!`);
        
        if (importUrlInput) {
            importUrlInput.value = '';
        }
    } catch (error) {
        console.error('Error importing from URL:', error);
        alert('Failed to import from URL: ' + error.message);
    } finally {
        hideLoadingOverlay();
        utils.restoreButtonState(confirmImportUrlButton, originalText);
        if (confirmImportUrlButton) confirmImportUrlButton.disabled = false;
        if (cancelImportButton) cancelImportButton.disabled = false;
        if (importUrlInput) importUrlInput.disabled = false;
    }
};

// Show export modal
export const handleExportClick = () => {
    const exportModal = document.getElementById('export-modal');
    if (exportModal) {
        exportModal.classList.remove('hidden');
    }
};

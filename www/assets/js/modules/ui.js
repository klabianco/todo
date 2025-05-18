/**
 * UI-related functions for the Todo app
 */
import { $, createSeparator } from './utils.js';
import { getShareId, getIsSharedList, isOwnedList, unsubscribeFromSharedList, saveSubscribedLists } from './storage.js';

// DOM elements
export const domElements = {
    taskForm: $('task-form'),
    taskInput: $('task-input'),
    activeTaskList: $('active-task-list'),
    completedTaskList: $('completed-task-list'),
    completedSection: $('completed-section'),
    taskCount: $('task-count'),
    completedCount: $('completed-count'),
    emptyState: $('empty-state'),
    taskBreadcrumb: $('task-breadcrumb'),
    focusTitle: $('focus-title'),
    prevDayButton: $('prev-day'),
    nextDayButton: $('next-day'),
    currentDateDisplay: $('current-date'),
    shareButton: $('share-button'),
    shareUrlContainer: $('share-url-container'),
    shareUrlInput: $('share-url'),
    copyShareUrlButton: $('copy-share-url'),
    backToPersonalButton: $('back-to-personal-button')
};

// Variables for Sortable instances
let activeSortable = null;
let completedSortable = null;

// Toggle empty state visibility
export const toggleEmptyState = isEmpty => {
    domElements.emptyState.style.display = isEmpty ? 'block' : 'none';
};

// Toggle completed section visibility
export const toggleCompletedSection = hasCompletedTasks => {
    domElements.completedSection.style.display = hasCompletedTasks ? 'block' : 'none';
};

// Toggle subtask section visibility
export const toggleSubtaskSection = (taskId, taskElement) => {
    const subtaskSection = taskElement.querySelector('.subtask-section');
    if (subtaskSection.classList.contains('hidden')) {
        subtaskSection.classList.remove('hidden');
    } else {
        subtaskSection.classList.add('hidden');
    }
};

// Create HTML for a task item
export const createTaskElement = (
    task,
    level = 0,
    onCheckboxChange,
    onDelete,
    onToggleSticky,
    onTaskClick,
    showSubtasks = true
) => {
    const li = document.createElement('li');
    li.dataset.id = task.id;
    li.dataset.level = level;
    li.className = `task-item ${level > 0 ? 'ml-' + (level * 4) : ''} mb-2 border rounded-lg ${task.completed ? 'completed bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'} ${task.sticky ? 'border-amber-400' : 'dark:border-gray-600'}`;
    
    // Main task row with controls
    const taskRow = document.createElement('div');
    taskRow.className = 'flex items-center justify-between p-3';
    
    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle mr-2 text-gray-400 cursor-grab p-1';
    dragHandle.innerHTML = `
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
        </svg>
    `;
    dragHandle.title = 'Drag to reorder';
    // Add a click event to stop propagation and prevent other handlers from stealing the event
    dragHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    
    // Checkbox and task text
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center flex-1';
    
    // Add drag handle to the left div
    leftDiv.appendChild(dragHandle);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.className = 'mr-3 h-5 w-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500';
    
    // Add event listener to checkbox
    checkbox.addEventListener('change', () => {
        if (onCheckboxChange) onCheckboxChange(task.id);
    });
    
    const span = document.createElement('span');
    span.className = task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'dark:text-gray-100';
    span.textContent = task.task;
    span.draggable = true;
    
    // Make task text clickable to focus on this task
    span.style.cursor = 'pointer';
    span.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onTaskClick) onTaskClick(task.id, task.task);
    });
    
    span.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', task.id);
    });
    
    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(span);
    
    // Task actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex items-center';
    
    // Sticky toggle button
    const stickyButton = document.createElement('button');
    stickyButton.className = 'mr-2';
    stickyButton.style.fontSize = '1.25rem';
    stickyButton.style.display = 'flex';
    stickyButton.style.alignItems = 'center';
    
    if (task.sticky) {
        // Pinned state - show a red pushpin with a glow effect
        stickyButton.innerHTML = '📌';
        stickyButton.style.color = '#f59e0b'; // amber-500
        stickyButton.style.textShadow = '0 0 5px rgba(245, 158, 11, 0.5)';
    } else {
        // Unpinned state - show a more subtle gray pushpin outline
        stickyButton.innerHTML = '<span style="opacity: 0.5; filter: grayscale(100%);">📌</span>';
        stickyButton.style.color = '#9ca3af'; // gray-400
    }
    
    stickyButton.title = task.sticky ? 'Unpin task (will no longer appear on all days)' : 'Pin task (will appear on all days)';
    
    // Add event listener to sticky button
    stickyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onToggleSticky) onToggleSticky(task.id);
    });
    
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'text-gray-400 hover:text-red-500';
    deleteButton.innerHTML = `
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
    `;
    deleteButton.title = 'Delete task';
    
    // Add event listener to delete button
    deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(task.id, li);
    });
    
    // Add buttons to actions div
    actionsDiv.appendChild(stickyButton);
    actionsDiv.appendChild(deleteButton);
    
    // Add both sides to the task row
    taskRow.appendChild(leftDiv);
    taskRow.appendChild(actionsDiv);
    
    // Add task row to the list item
    li.appendChild(taskRow);
    
    // Add subtasks section (only when allowed)
    if (showSubtasks && task.subtasks && task.subtasks.length > 0) {
        const subtaskCount = task.subtasks.length;
        const activeSubtasks = task.subtasks.filter(st => !st.completed).length;
        
        // Add a subtasks indicator
        const subtasksIndicator = document.createElement('div');
        subtasksIndicator.className = 'px-3 pb-2 -mt-1 text-xs text-gray-500 flex items-center cursor-pointer';
        subtasksIndicator.innerHTML = `
            <svg class="h-4 w-4 mr-1 subtask-toggle ${task.subtasksCollapsed ? 'transform rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
            <span>${subtaskCount} subtask${subtaskCount !== 1 ? 's' : ''} ${activeSubtasks > 0 ? `(${activeSubtasks} active)` : ''}</span>
        `;
        
        subtasksIndicator.addEventListener('click', () => {
            toggleSubtaskSection(task.id, li);
        });
        
        li.appendChild(subtasksIndicator);
        
        // Add subtasks section
        const subtaskSection = document.createElement('div');
        subtaskSection.className = `subtask-section pl-8 pr-3 pb-2 ${task.subtasksCollapsed ? 'hidden' : ''}`;
        
        const subtaskList = document.createElement('ul');
        subtaskList.className = 'space-y-2';
        
        // For each subtask, create a nested task element (with level+1)
        task.subtasks.forEach(subtask => {
            const subtaskElement = createTaskElement(
                subtask,
                level + 1,
                onCheckboxChange,
                onDelete,
                onToggleSticky,
                onTaskClick,
                showSubtasks
            );
            subtaskList.appendChild(subtaskElement);
        });
        
        subtaskSection.appendChild(subtaskList);
        li.appendChild(subtaskSection);
    }
    
    return li;
};

// Initialize Sortable.js
export const initializeSortable = (container, onSortEnd) => {
    return new Sortable(container, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        forceFallback: true, /* Force animation for better UX */
        fallbackClass: 'sortable-fallback',
        fallbackOnBody: true,
        delay: 100, /* Small delay to prevent accidental drags */
        delayOnTouchOnly: true,
        onEnd: onSortEnd
    });
};

// Update breadcrumb trail
export const updateBreadcrumbTrail = (taskNavigationStack, onJumpToBreadcrumb) => {
    const breadcrumbItems = $('breadcrumb-items');
    breadcrumbItems.innerHTML = '';
    
    taskNavigationStack.forEach((item, index) => {
        // Add separator
        breadcrumbItems.appendChild(createSeparator());
        
        // Add breadcrumb item
        const breadcrumbItem = document.createElement('button');
        breadcrumbItem.className = 'text-blue-500 hover:text-blue-700';
        breadcrumbItem.textContent = item.title;
        breadcrumbItem.dataset.index = index;
        breadcrumbItem.addEventListener('click', () => onJumpToBreadcrumb(index));
        breadcrumbItems.appendChild(breadcrumbItem);
    });
};

// Setup UI for shared list
export const setupSharedUI = (isOwner = isOwnedList(getShareId())) => {
    if (getIsSharedList()) {
        // Hide date navigation for shared lists - completely remove instead of just disabling
        domElements.prevDayButton.classList.add('hidden');
        domElements.nextDayButton.classList.add('hidden');
        domElements.currentDateDisplay.textContent = '';
        domElements.currentDateDisplay.className = 'hidden';

        // Show button to return to personal lists
        domElements.backToPersonalButton.classList.remove('hidden');
    }
};

// Add UI for accessing subscribed lists
export const addSubscribedListsUI = (subscribedLists, onListClick) => {
    // Check if there are no subscribed lists
    let subscribedListsContainer = document.getElementById('subscribed-lists-container');
    if (!subscribedLists || subscribedLists.length === 0) {
        if (subscribedListsContainer) {
            subscribedListsContainer.remove();
        }
        return;
    }

    // Check if the container already exists
    if (!subscribedListsContainer) {
        // Create a new container for subscribed lists
        subscribedListsContainer = document.createElement('div');
        subscribedListsContainer.id = 'subscribed-lists-container';
        subscribedListsContainer.className = 'mt-4 p-3 border border-gray-200 rounded-md';

        // Create a heading
        const heading = document.createElement('h3');
        heading.className = 'text-sm font-medium text-gray-700 mb-2';
        heading.textContent = 'My Shared Lists';
        subscribedListsContainer.appendChild(heading);

        // Create a list
        const listElement = document.createElement('ul');
        listElement.id = 'subscribed-lists';
        listElement.className = 'space-y-1';
        subscribedListsContainer.appendChild(listElement);

        // Add the container after the breadcrumb
        const taskBreadcrumb = document.getElementById('task-breadcrumb');
        taskBreadcrumb.parentNode.insertBefore(subscribedListsContainer, taskBreadcrumb.nextSibling);
    }
    
    // Get the list element and clear it
    const listElement = document.getElementById('subscribed-lists');
    listElement.innerHTML = '';
    
    // Add each subscribed list
    subscribedLists.forEach(list => {
        const listItem = document.createElement('li');
        listItem.className = 'flex items-center justify-between';

        const listLink = document.createElement('a');
        listLink.href = list.url;
        listLink.className = 'text-sm text-blue-500 hover:text-blue-700 flex-grow';
        listLink.textContent = list.title || 'Shared List';
        listLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (onListClick) onListClick(list);
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'text-xs text-red-500 hover:text-red-700 ml-2 flex-shrink-0';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            const updated = unsubscribeFromSharedList(list.id);
            saveSubscribedLists(updated);
            addSubscribedListsUI(updated, onListClick);
        });

        listItem.appendChild(listLink);
        listItem.appendChild(removeBtn);
        listElement.appendChild(listItem);
    });
}; 

// Setup share button functionality
export const setupShareButton = (onShareButtonClick) => {
    domElements.shareButton.addEventListener('click', onShareButtonClick);
    
    // Handle copy button click
    domElements.copyShareUrlButton.addEventListener('click', () => {
        domElements.shareUrlInput.select();
        document.execCommand('copy');
        
        // Show copied feedback
        const originalText = domElements.copyShareUrlButton.textContent;
        domElements.copyShareUrlButton.textContent = 'Copied!';
        setTimeout(() => {
            domElements.copyShareUrlButton.textContent = originalText;
        }, 2000);
    });
};

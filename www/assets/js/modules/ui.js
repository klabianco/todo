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
    completedToggle: $('completed-toggle'),
    completedChevron: $('completed-chevron'),
    taskCount: $('task-count'),
    completedCount: $('completed-count'),
    emptyState: $('empty-state'),
    taskBreadcrumb: $('task-breadcrumb'),
    focusTitle: $('focus-title'),
    shareButton: $('share-button'),
    shareUrlContainer: $('share-url-container'),
    shareUrlInput: $('share-url'),
    copyShareUrlButton: $('copy-share-url'),
    closeShareUrlButton: $('close-share-url'),
    backToPersonalButton: $('back-to-personal-button'),
    subscribedListsContainer: $('subscribed-lists-container'),
    subscribedListsList: $('subscribed-lists'),
    notificationContainer: document.createElement('div') // Container for notifications
};

// Variables for Sortable instances
let activeSortable = null;
let completedSortable = null;

// UI preferences
let showLocations = false; // default OFF
export const setShowLocations = (value) => {
    showLocations = !!value;
};
export const getShowLocations = () => showLocations;

let showTimes = false; // default OFF
export const setShowTimes = (value) => {
    showTimes = !!value;
};
export const getShowTimes = () => showTimes;

// Toggle empty state visibility
export const toggleEmptyState = isEmpty => {
    domElements.emptyState.style.display = isEmpty ? 'block' : 'none';
};

// Toggle completed section visibility
export const toggleCompletedSection = hasCompletedTasks => {
    domElements.completedSection.style.display = hasCompletedTasks ? 'block' : 'none';
    // Keep completed list collapsed by default when showing section
    if (hasCompletedTasks && domElements.completedTaskList) {
        domElements.completedTaskList.classList.add('hidden');
        if (domElements.completedChevron) {
            domElements.completedChevron.classList.remove('rotate-180');
        }
    }
};

// Toggle completed tasks list visibility
export const toggleCompletedTasksList = () => {
    if (!domElements.completedTaskList || !domElements.completedChevron) return;
    
    const clearButton = document.getElementById('clear-completed-button');
    const isHidden = domElements.completedTaskList.classList.contains('hidden');
    if (isHidden) {
        domElements.completedTaskList.classList.remove('hidden');
        domElements.completedChevron.classList.add('rotate-180');
        if (clearButton) {
            clearButton.classList.remove('hidden');
        }
    } else {
        domElements.completedTaskList.classList.add('hidden');
        domElements.completedChevron.classList.remove('rotate-180');
        if (clearButton) {
            clearButton.classList.add('hidden');
        }
    }
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
    onEdit,
    showSubtasks = true
) => {
    const li = document.createElement('li');
    li.dataset.id = task.id;
    li.dataset.level = level;
    li.className = `task-item ${level > 0 ? 'ml-' + (level * 4) : ''} rounded-xl ${task.completed ? 'completed bg-gray-100 dark:bg-gray-700/80' : 'bg-gray-50 dark:bg-gray-700/80'} ${task.sticky ? 'ring-2 ring-amber-300 dark:ring-amber-400' : 'dark:ring-1 dark:ring-gray-600'}`;
    
    // Main task row with controls
    const taskRow = document.createElement('div');
    taskRow.className = 'flex items-center justify-between p-4';
    
    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle mr-2 text-gray-300 dark:text-gray-500 cursor-grab p-1 flex-shrink-0';
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
    leftDiv.className = 'flex items-start flex-1';
    
    // Add drag handle to the left div
    leftDiv.appendChild(dragHandle);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.className = 'mr-3 h-5 w-5 min-w-5 flex-shrink-0 rounded border-gray-300 text-gray-800 dark:text-white focus:ring-gray-400 dark:focus:ring-gray-500 dark:border-gray-500 dark:bg-gray-600';
    
    // Add event listener to checkbox
    checkbox.addEventListener('change', () => {
        if (onCheckboxChange) onCheckboxChange(task.id);
    });
    
    // Task text + optional location badge
    const textContainer = document.createElement('div');
    // Two-row layout: location badge on first row, task text on second row
    textContainer.className = 'flex flex-col gap-1 flex-1 min-w-0';

    const span = document.createElement('span');
    span.className = `${task.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'} min-w-0`;
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

    // Badges container for location and time
    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'flex gap-2 flex-wrap';

    // Optional location badge (toggleable; when ON show N/A if not assigned)
    if (showLocations) {
        const locationLabelRaw = (task && task.location != null) ? String(task.location) : '';
        const locationLabel = locationLabelRaw.trim() || 'N/A';
        const isUnassigned = locationLabel === 'N/A';

        const locationBadge = document.createElement('span');
        locationBadge.className = `flex-shrink-0 text-xs px-2 py-0.5 rounded border ${
            isUnassigned
                ? 'border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500'
                : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
        }`;
        locationBadge.textContent = locationLabel;
        locationBadge.title = 'Location/department';
        badgesContainer.appendChild(locationBadge);
    }

    // Optional time badge (toggleable; when ON show N/A if not assigned)
    if (showTimes) {
        const timeRaw = task?.scheduledTime || '';
        const hasTime = timeRaw.trim() !== '';
        let timeLabel = 'N/A';
        if (hasTime) {
            // Format time for display (HH:MM -> h:MM AM/PM)
            const [hours, minutes] = timeRaw.split(':');
            const h = parseInt(hours, 10);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            timeLabel = `${h12}:${minutes} ${ampm}`;
        }

        const timeBadge = document.createElement('span');
        timeBadge.className = `flex-shrink-0 text-xs px-2 py-0.5 rounded border ${
            !hasTime
                ? 'border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-500'
                : 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-600 dark:bg-blue-900 dark:text-blue-300'
        }`;
        timeBadge.textContent = timeLabel;
        timeBadge.title = 'Scheduled time';
        badgesContainer.appendChild(timeBadge);
    }

    // Only add badges container if it has children
    if (badgesContainer.children.length > 0) {
        textContainer.appendChild(badgesContainer);
    }

    textContainer.appendChild(span);
    
    leftDiv.appendChild(checkbox);
    leftDiv.appendChild(textContainer);
    
    // Task actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex items-center';

    // Edit button
    const editButton = document.createElement('button');
    editButton.className = 'mr-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300';
    editButton.innerHTML = `
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
        </svg>
    `;
    editButton.title = 'Edit task details';
    editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onEdit) onEdit(task);
    });

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
    deleteButton.className = 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400';
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
    actionsDiv.appendChild(editButton);
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
                onEdit,
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
        breadcrumbItem.className = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white';
        breadcrumbItem.textContent = item.title;
        breadcrumbItem.dataset.index = index;
        breadcrumbItem.addEventListener('click', () => onJumpToBreadcrumb(index));
        breadcrumbItems.appendChild(breadcrumbItem);
    });
};

// Setup UI for shared list
export const setupSharedUI = (isOwner = isOwnedList(getShareId())) => {
    if (getIsSharedList()) {
        // Show button to return to personal lists
        domElements.backToPersonalButton.classList.remove('hidden');
        
        // Add delete button for owners
        if (isOwner) {
            // Create delete button if it doesn't exist
            let deleteButton = document.getElementById('delete-list-button');
            if (!deleteButton) {
                deleteButton = document.createElement('button');
                deleteButton.id = 'delete-list-button';
                deleteButton.className = 'ml-2 bg-red-500 hover:bg-red-600 text-white py-1 px-3 rounded text-sm flex items-center';
                deleteButton.innerHTML = `
                    <svg class="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    <span>Delete List</span>
                `;
                
                // Add to DOM next to back button
                const buttonContainer = domElements.backToPersonalButton.parentNode;
                buttonContainer.appendChild(deleteButton);
            }
        }
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
        subscribedListsContainer.className = 'mt-4 p-3 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-sm';

        // Create a heading
        const heading = document.createElement('h3');
        heading.className = 'text-sm font-medium text-gray-700 dark:text-gray-200 mb-2';
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
        listLink.className = 'text-sm text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex-grow';
        listLink.textContent = list.title || 'Shared List';
        listLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (onListClick) onListClick(list);
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 ml-2 flex-shrink-0 p-1';
        removeBtn.title = 'Remove from My Lists';
        removeBtn.innerHTML = `
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
        `;
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
    if (domElements.shareButton) {
        domElements.shareButton.addEventListener('click', onShareButtonClick);
    }

    // Handle copy button click
    if (domElements.copyShareUrlButton) {
        domElements.copyShareUrlButton.addEventListener('click', () => {
            domElements.shareUrlInput.select();
            document.execCommand('copy');

            // Show copied feedback on the button
            const originalText = domElements.copyShareUrlButton.textContent;
            domElements.copyShareUrlButton.textContent = 'Copied!';
            setTimeout(() => {
                domElements.copyShareUrlButton.textContent = originalText;
            }, 2000);
            
            // Also show the notification if the function exists
            if (typeof window.showCopiedNotification === 'function') {
                window.showCopiedNotification();
            }
        });
    }
    
    // Handle close button click
    if (domElements.closeShareUrlButton) {
        domElements.closeShareUrlButton.addEventListener('click', () => {
            // Hide the share URL container
            domElements.shareUrlContainer.classList.add('hidden');
            // Show the share button again
            domElements.shareButton.classList.remove('hidden');
        });
    }
};

// Show notification that the list has been updated from a remote source
export const showUpdatedNotification = () => {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg transform transition-all duration-300 flex items-center';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(10px)';
    
    // Add content
    const icon = document.createElement('span');
    icon.innerHTML = `
        <svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
    `;
    
    const text = document.createElement('span');
    text.textContent = 'List updated from shared source';
    
    notification.appendChild(icon);
    notification.appendChild(text);
    
    // Add to container
    domElements.notificationContainer.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Animate out and remove after delay
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
};

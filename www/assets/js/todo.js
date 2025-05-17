document.addEventListener('DOMContentLoaded', () => {
    let taskNavigationStack = [];
    let currentFocusedTaskId = null;
    let draggedTaskId = null;
    
    const getCurrentDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };
    
    let activeDate = getCurrentDate();
    
    const formatDateForDisplay = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    
    const getRelativeDay = (dateString, offsetDays) => {
        const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
        const date = new Date(year, month - 1, day);
        date.setDate(date.getDate() + offsetDays);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    
    const getPreviousDay = dateString => getRelativeDay(dateString, -1);
    const getNextDay = dateString => getRelativeDay(dateString, 1);
    // DOM elements
    const $ = id => document.getElementById(id);
    const taskForm = $('task-form');
    const taskInput = $('task-input');
    const activeTaskList = $('active-task-list');
    const completedTaskList = $('completed-task-list');
    const completedSection = $('completed-section');
    const taskCount = $('task-count');
    const completedCount = $('completed-count');
    const emptyState = $('empty-state');
    const taskBreadcrumb = $('task-breadcrumb');
    const focusTitle = $('focus-title');
    const prevDayButton = $('prev-day');
    const nextDayButton = $('next-day');
    const currentDateDisplay = $('current-date');

    taskBreadcrumb.addEventListener('dragover', e => {
        e.preventDefault();
        taskBreadcrumb.classList.add('drag-over');
    });
    
    taskBreadcrumb.addEventListener('dragleave', () => {
        taskBreadcrumb.classList.remove('drag-over');
    });
    
    taskBreadcrumb.addEventListener('drop', e => {
        e.preventDefault();
        taskBreadcrumb.classList.remove('drag-over');
        const id = draggedTaskId || e.dataTransfer.getData('text/plain');
        if (id) {
            promoteTask(id);
            draggedTaskId = null;
        }
    });

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
    
    const initializeStorage = () => {
        const tasksKey = `todoTasks_${activeDate}`;
        if (!localStorage.getItem(tasksKey)) {
            localStorage.setItem(tasksKey, '[]');
        }
        
        if (!localStorage.getItem('todoStickyTasks')) {
            localStorage.setItem('todoStickyTasks', '[]');
        }
    };
    
    const loadTasks = () => {
        const tasksKey = `todoTasks_${activeDate}`;
        const dateTasks = JSON.parse(localStorage.getItem(tasksKey) || '[]');
        const stickyTasks = JSON.parse(localStorage.getItem('todoStickyTasks') || '[]');
        
        const dateTaskIds = new Set(dateTasks.map(task => task.id));
        const filteredStickyTasks = stickyTasks.filter(stickyTask => !dateTaskIds.has(stickyTask.id));
        
        return [...dateTasks, ...filteredStickyTasks];
    };
    
    const saveTasks = (tasks) => {
        const stickyTasks = tasks.filter(task => task.sticky);
        const nonStickyTasks = tasks.filter(task => !task.sticky);
        
        localStorage.setItem(`todoTasks_${activeDate}`, JSON.stringify(nonStickyTasks));
        localStorage.setItem('todoStickyTasks', JSON.stringify(stickyTasks));
    };
    
    const toggleCompletedSection = hasCompletedTasks => {
        completedSection.style.display = hasCompletedTasks ? 'block' : 'none';
    };
    
    const toggleEmptyState = isEmpty => {
        emptyState.style.display = isEmpty ? 'block' : 'none';
    };
    
    // Create HTML for a task item
    const createTaskElement = (task, level = 0) => {
        const li = document.createElement('li');
        li.dataset.id = task.id;
        li.dataset.level = level;
        li.className = `task-item ${level > 0 ? 'ml-' + (level * 4) : ''} mb-2 border rounded-lg ${task.completed ? 'completed bg-gray-50' : 'bg-white'} ${task.sticky ? 'border-amber-400' : ''}`;
        
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
        
        const span = document.createElement('span');
        span.className = task.completed ? 'line-through text-gray-500' : '';
        span.textContent = task.task;
        span.draggable = true;
        
        // Make task text clickable to focus on this task
        span.style.cursor = 'pointer';
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            focusOnTask(task.id, task.task);
        });
        span.addEventListener('dragstart', (e) => {
            draggedTaskId = task.id;
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
        
        const addSubtaskButton = document.createElement('button');
        addSubtaskButton.className = 'text-gray-400 hover:text-blue-500 mr-2';
        addSubtaskButton.innerHTML = `
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
        `;
        addSubtaskButton.title = 'Add subtask';

        
        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'text-gray-400 hover:text-red-500';
        deleteButton.innerHTML = `
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
        `;
        deleteButton.title = 'Delete task';
        
        actionsDiv.appendChild(stickyButton);
        actionsDiv.appendChild(addSubtaskButton);
        actionsDiv.appendChild(deleteButton);
        
        taskRow.appendChild(leftDiv);
        taskRow.appendChild(actionsDiv);
        
        li.appendChild(taskRow);
        
        // Subtask form (to be shown when clicking the add subtask button)
        const subtaskSection = document.createElement('div');
        subtaskSection.className = 'subtask-section hidden bg-gray-50 p-3 rounded-b-lg border-t';
        
        const subtaskForm = document.createElement('form');
        subtaskForm.className = 'flex items-center mb-3';
        subtaskForm.dataset.parentId = task.id;
        
        const subtaskInput = document.createElement('input');
        subtaskInput.type = 'text';
        subtaskInput.placeholder = 'Add a subtask...';
        subtaskInput.className = 'flex-1 py-1 px-3 rounded-l-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm';
        subtaskInput.required = true;
        
        const subtaskAddBtn = document.createElement('button');
        subtaskAddBtn.type = 'submit';
        subtaskAddBtn.className = 'bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded-r-lg transition duration-200 text-sm';
        subtaskAddBtn.textContent = 'Add';
        
        subtaskForm.appendChild(subtaskInput);
        subtaskForm.appendChild(subtaskAddBtn);
        
        // Subtask list
        const subtaskList = document.createElement('ul');
        subtaskList.className = 'subtask-list space-y-1';
        
        // Add subtasks if they exist
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
                const subtaskElement = createTaskElement(subtask, level + 1);
                subtaskList.appendChild(subtaskElement);
            });
        }
        
        subtaskSection.appendChild(subtaskForm);
        subtaskSection.appendChild(subtaskList);
        
        li.appendChild(subtaskSection);

        // Drag-and-drop to move tasks as subtasks
        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });
        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');
            const id = draggedTaskId || e.dataTransfer.getData('text/plain');
            if (id && id !== task.id) {
                moveTaskAsSubtask(id, task.id);
            }
            draggedTaskId = null;
        });
        
        // Event listeners
        checkbox.addEventListener('change', () => {
            toggleTaskCompletion(task.id);
        });
        
        stickyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTaskSticky(task.id);
        });
        
        addSubtaskButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const subtaskText = prompt('Enter subtask:');
            if (subtaskText && subtaskText.trim() !== '') {
                addSubtask(task.id, subtaskText.trim());
            }
        });

        
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this task?')) {
                deleteTask(task.id, li);
            }
        });
        
        subtaskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const subtaskText = subtaskInput.value.trim();
            
            if (subtaskText) {
                addSubtask(task.id, subtaskText);
                subtaskInput.value = '';
            }
        });
        
        return li;
    };
    
    // Get task count (only counts tasks visible in current view, not nested subtasks)
    const getTaskCount = (tasks) => {
        return tasks.length;
    };
    
    // Focus on a specific task and its subtasks
    const focusOnTask = (taskId, taskTitle) => {
        // If we're already focused on a task, add it to the navigation stack
        if (currentFocusedTaskId) {
            taskNavigationStack.push({
                id: currentFocusedTaskId,
                title: focusTitle.textContent,
                index: taskNavigationStack.length
            });
        }
        
        currentFocusedTaskId = taskId;
        
        // Show breadcrumb navigation
        taskBreadcrumb.classList.remove('hidden');
        
        // Set focus title
        focusTitle.textContent = taskTitle;
        
        // Update breadcrumb trail
        updateBreadcrumbTrail();
        
        // Re-render to show only this task and its subtasks
        renderTasks();
    };
    
    // Go back one level in the navigation
    const goBackOneLevel = () => {
        if (taskNavigationStack.length > 0) {
            // Pop the last task from the stack and focus on it
            const previousTask = taskNavigationStack.pop();
            currentFocusedTaskId = previousTask.id;
            
            // Set focus title to the previous task
            focusTitle.textContent = previousTask.title;
            
            // Update breadcrumb trail
            updateBreadcrumbTrail();
        } else {
            // If no more tasks in stack, go back to root
            currentFocusedTaskId = null;
            taskBreadcrumb.classList.add('hidden');
            focusTitle.textContent = '';
        }
        
        // Re-render with the new focus
        renderTasks();
    };
    
    // Render all tasks
    const renderTasks = () => {
        // Load tasks
        const tasks = loadTasks();
        
        // Clear existing task containers
        activeTaskList.innerHTML = '';
        completedTaskList.innerHTML = '';
        
        // Destroy previous Sortable instances if they exist
        if (window.activeSortable) {
            window.activeSortable.destroy();
            window.activeSortable = null;
        }
        if (window.completedSortable) {
            window.completedSortable.destroy();
            window.completedSortable = null;
        }
        
        let activeTasks = 0;
        let completedTasks = 0;
        
        if (currentFocusedTaskId) {
            // Focus mode: show only the focused task's subtasks
            const result = findTaskById(tasks, currentFocusedTaskId);
            
            if (result) {
                const { task } = result;
                
                // Get all subtasks (or initialize empty array)
                const subtasks = task.subtasks || [];
                const activeSubtasks = subtasks.filter(st => !st.completed);
                const completedSubtasks = subtasks.filter(st => st.completed);
                
                // Add active subtasks
                activeSubtasks.forEach(subtask => {
                    const subtaskElement = createTaskElement(subtask);
                    activeTaskList.appendChild(subtaskElement);
                });
                
                // Add completed subtasks
                completedSubtasks.forEach(subtask => {
                    const subtaskElement = createTaskElement(subtask);
                    completedTaskList.appendChild(subtaskElement);
                });
                
                // Count subtasks
                activeTasks = activeSubtasks.length;
                completedTasks = completedSubtasks.length;
            } else {
                // Task not found, revert to all tasks view
                currentFocusedTaskId = null;
                taskBreadcrumb.classList.add('hidden');
                focusTitle.textContent = '';
                taskNavigationStack = [];
                
                // Re-render all tasks
                return renderTasks();
            }
        } else {
            // Normal mode: show all top-level tasks
            // Filter top-level tasks only
            const allTopLevelTasks = tasks.filter(task => !task.parentId);
            const activeTopLevelTasks = allTopLevelTasks.filter(task => !task.completed);
            const completedTopLevelTasks = allTopLevelTasks.filter(task => task.completed);
            
            // Add active tasks
            activeTopLevelTasks.forEach(task => {
                const taskElement = createTaskElement(task);
                activeTaskList.appendChild(taskElement);
            });
            
            // Add completed tasks
            completedTopLevelTasks.forEach(task => {
                const taskElement = createTaskElement(task);
                completedTaskList.appendChild(taskElement);
            });
            
            // Count tasks
            activeTasks = activeTopLevelTasks.length;
            completedTasks = completedTopLevelTasks.length;
        }
        
        // Update counts
        taskCount.textContent = `${activeTasks} task${activeTasks !== 1 ? 's' : ''}`;
        completedCount.textContent = `${completedTasks} completed`;
        
        // Show/hide empty state
        toggleEmptyState(activeTasks === 0 && !currentFocusedTaskId);
        
        // Show/hide completed section
        toggleCompletedSection(completedTasks > 0);
        
        // Initialize Sortable for active tasks
        if (activeTaskList.children.length > 0) {
            window.activeSortable = new Sortable(activeTaskList, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                forceFallback: true, /* Force animation for better UX */
                fallbackClass: 'sortable-fallback',
                fallbackOnBody: true,
                delay: 100, /* Small delay to prevent accidental drags */
                delayOnTouchOnly: true,
                onEnd: function(evt) {
                    // Get ordered task IDs from the DOM
                    const orderedIds = Array.from(activeTaskList.children).map(el => el.dataset.id);
                    const tasks = loadTasks();
                    
                    if (currentFocusedTaskId) {
                        // We're in focus mode, so we need to reorder the subtasks
                        const result = findTaskById(tasks, currentFocusedTaskId);
                        if (result && result.task) {
                            const { task } = result;
                            const activeSubtasks = task.subtasks.filter(st => !st.completed);
                            const completedSubtasks = task.subtasks.filter(st => st.completed);
                            
                            // Reorder active subtasks based on DOM order
                            const reorderedSubtasks = [];
                            orderedIds.forEach(id => {
                                const subtask = activeSubtasks.find(st => st.id === id);
                                if (subtask) reorderedSubtasks.push(subtask);
                            });
                            
                            // Update task's subtasks array with new order
                            task.subtasks = [...reorderedSubtasks, ...completedSubtasks];
                            saveTasks(tasks);
                        }
                    } else {
                        // We're in normal mode, reorder top-level tasks
                        const activeTopLevelTasks = tasks.filter(t => !t.completed && !t.parentId);
                        const completedTopLevelTasks = tasks.filter(t => t.completed && !t.parentId);
                        const otherTasks = tasks.filter(t => t.parentId); // Keep subtasks
                        
                        // Reorder active top-level tasks based on DOM order
                        const reorderedTasks = [];
                        orderedIds.forEach(id => {
                            const task = activeTopLevelTasks.find(t => t.id === id);
                            if (task) reorderedTasks.push(task);
                        });
                        
                        // Save all tasks with the reordered active tasks
                        saveTasks([...reorderedTasks, ...completedTopLevelTasks, ...otherTasks]);
                    }
                }
            });
        }
        
        // Initialize Sortable for completed tasks
        if (completedTaskList.children.length > 0) {
            window.completedSortable = new Sortable(completedTaskList, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                forceFallback: true, /* Force animation for better UX */
                fallbackClass: 'sortable-fallback',
                fallbackOnBody: true,
                delay: 100, /* Small delay to prevent accidental drags */
                delayOnTouchOnly: true,
                onEnd: function(evt) {
                    // Get ordered task IDs from the DOM
                    const orderedIds = Array.from(completedTaskList.children).map(el => el.dataset.id);
                    const tasks = loadTasks();
                    
                    if (currentFocusedTaskId) {
                        // We're in focus mode, so we need to reorder the subtasks
                        const result = findTaskById(tasks, currentFocusedTaskId);
                        if (result && result.task) {
                            const { task } = result;
                            const activeSubtasks = task.subtasks.filter(st => !st.completed);
                            const completedSubtasks = task.subtasks.filter(st => st.completed);
                            
                            // Reorder completed subtasks based on DOM order
                            const reorderedSubtasks = [];
                            orderedIds.forEach(id => {
                                const subtask = completedSubtasks.find(st => st.id === id);
                                if (subtask) reorderedSubtasks.push(subtask);
                            });
                            
                            // Update task's subtasks array with new order
                            task.subtasks = [...activeSubtasks, ...reorderedSubtasks];
                            saveTasks(tasks);
                        }
                    } else {
                        // We're in normal mode, reorder top-level tasks
                        const activeTopLevelTasks = tasks.filter(t => !t.completed && !t.parentId);
                        const completedTopLevelTasks = tasks.filter(t => t.completed && !t.parentId);
                        const otherTasks = tasks.filter(t => t.parentId); // Keep subtasks
                        
                        // Reorder completed top-level tasks based on DOM order
                        const reorderedTasks = [];
                        orderedIds.forEach(id => {
                            const task = completedTopLevelTasks.find(t => t.id === id);
                            if (task) reorderedTasks.push(task);
                        });
                        
                        // Save all tasks with the reordered completed tasks
                        saveTasks([...activeTopLevelTasks, ...reorderedTasks, ...otherTasks]);
                    }
                }
            });
        }
    };
    
    // Add a new task
    const addTask = (taskText) => {
        // Handle focused mode - add as a subtask if we're focused
        if (currentFocusedTaskId) {
            addSubtask(currentFocusedTaskId, taskText);
            return; // addSubtask will handle saving and rendering
        }
        
        // Otherwise create a top-level task
        const tasks = loadTasks();
        
        // Create new task object
        const newTask = {
            id: generateUUID(),
            task: taskText,
            completed: false,
            sticky: false,
            subtasks: [],
            created: new Date().toISOString()
        };
        
        // Add to tasks array
        tasks.push(newTask);
        
        // Save updated tasks
        saveTasks(tasks);
        
        // Render all tasks to properly update UI
        renderTasks();
        
        return newTask;
    };
    
    // Toggle subtask section visibility
    const toggleSubtaskSection = (taskId, taskElement) => {
        const subtaskSection = taskElement.querySelector('.subtask-section');
        if (subtaskSection.classList.contains('hidden')) {
            subtaskSection.classList.remove('hidden');
        } else {
            subtaskSection.classList.add('hidden');
        }
    };
    
    // Find task by ID (including in subtasks)
    const findTaskById = (tasks, taskId) => {
        // Check top-level tasks first
        const task = tasks.find(t => t.id === taskId);
        if (task) return { task };
        
        // Search in subtasks
        for (const parentTask of tasks) {
            if (parentTask.subtasks) {
                const result = findTaskByIdInSubtasks(parentTask, taskId);
                if (result) return result;
            }
        }
        
        return null;
    };
    
    const findTaskByIdInSubtasks = (parent, taskId) => {
        if (!parent.subtasks) return null;
        
        const task = parent.subtasks.find(t => t.id === taskId);
        if (task) return { task, parent };
        
        // Recursively search deeper
        for (const subtask of parent.subtasks) {
            if (subtask.subtasks) {
                const result = findTaskByIdInSubtasks(subtask, taskId);
                if (result) return result;
            }
        }
        
        return null;
    };
    
    // Add a subtask to a parent task
    const addSubtask = (parentId, subtaskText) => {
        const tasks = loadTasks();
        const result = findTaskById(tasks, parentId);
        
        if (result) {
            const { task } = result;
            
            // Create new subtask
            const newSubtask = {
                id: generateUUID(),
                task: subtaskText,
                completed: false,
                sticky: false,
                subtasks: [],
                created: new Date().toISOString(),
                parentId: task.id
            };
            
            // Add to parent's subtasks
            if (!task.subtasks) task.subtasks = [];
            task.subtasks.push(newSubtask);
            
            // Save and render
            saveTasks(tasks);
            renderTasks();
            
            return newSubtask;
        }
        return null;
    };
    
    // Toggle task completion status
    const toggleTaskCompletion = (taskId) => {
        const tasks = loadTasks();
        const taskResult = findTaskById(tasks, taskId);
        
        if (taskResult) {
            const { task } = taskResult;
            task.completed = !task.completed;
            
            // If we're completing a task, also complete all subtasks
            if (task.completed && task.subtasks && task.subtasks.length > 0) {
                completeAllSubtasks(task, true);
            }
            
            saveTasks(tasks);
            renderTasks();
        }
    };
    
    // Toggle task sticky status
    const toggleTaskSticky = (taskId) => {
        const tasks = loadTasks();
        const taskResult = findTaskById(tasks, taskId);
        
        if (taskResult && taskResult.task) {
            const task = taskResult.task;
            task.sticky = !task.sticky;
            
            // Apply the same sticky status to all subtasks if it's being made sticky
            if (task.subtasks && task.subtasks.length > 0) {
                makeAllSubtasksSticky(task, task.sticky);
            }
            
            saveTasks(tasks);
            renderTasks();
            
            // If we're on a specific day and making a task sticky
            if (task.sticky && activeDate !== getCurrentDate()) {
                // Task is now sticky and will appear on all days
            }
        }
    };
    
    // Helper to recursively make all subtasks sticky
    const makeAllSubtasksSticky = (task, isSticky) => {
        if (task.subtasks && task.subtasks.length > 0) {
            for (const subtask of task.subtasks) {
                subtask.sticky = isSticky;
                // Recursively apply to deeper subtasks
                if (subtask.subtasks && subtask.subtasks.length > 0) {
                    makeAllSubtasksSticky(subtask, isSticky);
                }
            }
        }
    };
    
    // Helper to recursively complete/uncomplete all subtasks
    const completeAllSubtasks = (task, completed) => {
        if (!task.subtasks) return;
        
        task.subtasks.forEach(subtask => {
            subtask.completed = completed;
            if (subtask.subtasks && subtask.subtasks.length > 0) {
                completeAllSubtasks(subtask, completed);
            }
        });
    };
    
    // Delete a task
    const deleteTask = (taskId, element) => {
        // Immediately delete without animation
        const tasks = loadTasks();
        
        // Find and remove task (could be a subtask)
        const result = findTaskById(tasks, taskId);
        
        if (result) {
            const { task, parent } = result;
            
            if (parent) {
                // Remove from parent's subtasks
                parent.subtasks = parent.subtasks.filter(st => st.id !== taskId);
            } else {
                // Remove from top-level tasks
                tasks.splice(tasks.indexOf(task), 1);
            }
            
            saveTasks(tasks);
            
            // For clarity, re-render everything instead of just removing from DOM
            // This ensures subtasks are also properly removed
            renderTasks();
        } else {
            // Fallback to direct DOM removal if not found
            element.remove();
        }
    };

    // Move a task to become a subtask of another task
    const moveTaskAsSubtask = (taskId, newParentId) => {
        const tasks = loadTasks();
        const dragResult = findTaskById(tasks, taskId);
        const parentResult = findTaskById(tasks, newParentId);
        if (!dragResult || !parentResult) return;

        const { task, parent: oldParent } = dragResult;
        const { task: newParent } = parentResult;

        // Remove from old parent or top level
        if (oldParent) {
            oldParent.subtasks = oldParent.subtasks.filter(st => st.id !== taskId);
        } else {
            const idx = tasks.findIndex(t => t.id === taskId);
            if (idx !== -1) tasks.splice(idx, 1);
        }

        if (!newParent.subtasks) newParent.subtasks = [];
        newParent.subtasks.push(task);
        task.parentId = newParent.id;

        saveTasks(tasks);
        renderTasks();
    };

    // Promote a task one level up
    const promoteTask = (taskId) => {
        const tasks = loadTasks();
        const result = findTaskById(tasks, taskId);
        if (!result || !result.parent) return;

        const { task, parent } = result;
        const index = parent.subtasks.findIndex(st => st.id === taskId);
        parent.subtasks.splice(index, 1);

        if (parent.parentId) {
            const grandResult = findTaskById(tasks, parent.parentId);
            if (grandResult) {
                const { task: grand } = grandResult;
                const parentIndex = grand.subtasks.findIndex(st => st.id === parent.id);
                grand.subtasks.splice(parentIndex + 1, 0, task);
                task.parentId = grand.id;
            }
        } else {
            const parentIndex = tasks.findIndex(t => t.id === parent.id);
            tasks.splice(parentIndex + 1, 0, task);
            delete task.parentId;
        }

        saveTasks(tasks);
        renderTasks();
    };
    
    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskText = taskInput.value.trim();
        
        if (taskText) {
            addTask(taskText);
            taskInput.value = '';
            taskInput.focus();
        }
    });
    
    const switchToDate = newDate => {
        activeDate = newDate;
        initializeStorage();
        
        currentDateDisplay.textContent = newDate === getCurrentDate() 
            ? 'Today' 
            : formatDateForDisplay(newDate);
        
        taskNavigationStack = [];
        currentFocusedTaskId = null;
        taskBreadcrumb.classList.add('hidden');
        
        renderTasks();
    };
    
    prevDayButton.addEventListener('click', () => switchToDate(getPreviousDay(activeDate)));
    nextDayButton.addEventListener('click', () => switchToDate(getNextDay(activeDate)));
    
    const updateBreadcrumbTrail = () => {
        const breadcrumbItems = document.getElementById('breadcrumb-items');
        breadcrumbItems.innerHTML = '';
        
        taskNavigationStack.forEach((item, index) => {
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'mx-2 text-gray-500';
            separator.textContent = '/';
            breadcrumbItems.appendChild(separator);
            
            // Add breadcrumb item
            const breadcrumbItem = document.createElement('button');
            breadcrumbItem.className = 'text-blue-500 hover:text-blue-700';
            breadcrumbItem.textContent = item.title;
            breadcrumbItem.dataset.index = index;
            breadcrumbItem.addEventListener('click', () => jumpToBreadcrumb(index));
            breadcrumbItems.appendChild(breadcrumbItem);
        });
        
        if (currentFocusedTaskId) {
            // Add separator and current item
            breadcrumbItems.appendChild(createSeparator());
            
            const currentItem = document.createElement('span');
            currentItem.className = 'text-gray-700 font-medium';
            currentItem.textContent = focusTitle.textContent;
            breadcrumbItems.appendChild(currentItem);
        }
    };
    
    const createSeparator = () => {
        const separator = document.createElement('span');
        separator.className = 'mx-2 text-gray-500';
        separator.textContent = '/';
        return separator;
    };
    
    const jumpToBreadcrumb = (index) => {
        if (index === 'root') {
            currentFocusedTaskId = null;
            taskNavigationStack = [];
            taskBreadcrumb.classList.add('hidden');
            focusTitle.textContent = '';
            renderTasks();
            return;
        }
        
        const targetTask = taskNavigationStack[index];
        taskNavigationStack = taskNavigationStack.slice(0, index);
        
        currentFocusedTaskId = targetTask.id;
        focusTitle.textContent = targetTask.title;
        
        updateBreadcrumbTrail();
        renderTasks();
    };
    
    document.querySelector('.breadcrumb-trail button[data-level="root"]')
        .addEventListener('click', () => jumpToBreadcrumb('root'));
    
    const init = () => {
        initializeStorage();
        currentDateDisplay.textContent = 'Today';
        renderTasks();
    };
    
    init();
});
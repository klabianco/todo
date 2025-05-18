const { useState, useEffect } = React;

function App() {
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState('');
  const [currentParentId, setCurrentParentId] = useState(null);

  // Load tasks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('reactTodoTasksV2');
    if (stored) {
      setTasks(JSON.parse(stored));
    }
  }, []);

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('reactTodoTasksV2', JSON.stringify(tasks));
  }, [tasks]);

  const findTaskById = (list, id) => {
    for (const t of list) {
      if (t.id === id) return t;
      if (t.subtasks && t.subtasks.length > 0) {
        const found = findTaskById(t.subtasks, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateTaskById = (list, id, updater) => {
    return list.map(t => {
      if (t.id === id) {
        return updater(t);
      }
      if (t.subtasks && t.subtasks.length > 0) {
        return { ...t, subtasks: updateTaskById(t.subtasks, id, updater) };
      }
      return t;
    });
  };

  const removeTaskById = (list, id) => {
    return list
      .filter(t => t.id !== id)
      .map(t => ({
        ...t,
        subtasks: t.subtasks ? removeTaskById(t.subtasks, id) : [],
      }));
  };

  const addSubtask = (list, parentId, subtask) => {
    return list.map(t => {
      if (t.id === parentId) {
        const subs = t.subtasks ? [...t.subtasks, subtask] : [subtask];
        return { ...t, subtasks: subs };
      }
      if (t.subtasks && t.subtasks.length > 0) {
        return { ...t, subtasks: addSubtask(t.subtasks, parentId, subtask) };
      }
      return t;
    });
  };

  const addTask = e => {
    e.preventDefault();
    if (!input.trim()) return;

    const newTask = {
      id: Date.now().toString(),
      text: input.trim(),
      completed: false,
      sticky: false,
      subtasks: [],
      parentId: currentParentId,
    };

    if (currentParentId) {
      setTasks(prev => addSubtask(prev, currentParentId, newTask));
    } else {
      setTasks(prev => [...prev, newTask]);
    }

    setInput('');
  };

  const toggleTask = id => {
    setTasks(prev => updateTaskById(prev, id, t => ({ ...t, completed: !t.completed })));
  };

  const toggleSticky = id => {
    setTasks(prev => updateTaskById(prev, id, t => ({ ...t, sticky: !t.sticky })));
  };

  const deleteTask = id => {
    setTasks(prev => removeTaskById(prev, id));
  };

  const currentTasks = currentParentId
    ? findTaskById(tasks, currentParentId)?.subtasks || []
    : tasks;

  const currentTitle = currentParentId ? findTaskById(tasks, currentParentId)?.text : null;

  const goBack = () => {
    if (!currentParentId) return;
    const parent = findTaskById(tasks, currentParentId)?.parentId || null;
    setCurrentParentId(parent);
  };

  const renderTask = task => (
    <li key={task.id} className="flex items-center justify-between task-item border-b border-gray-200 py-2">
      <div className="flex items-center">
        <input
          type="checkbox"
          className="mr-2"
          checked={task.completed}
          onChange={() => toggleTask(task.id)}
        />
        <span
          className={task.completed ? 'line-through text-gray-500 cursor-pointer' : 'cursor-pointer'}
          onClick={() => setCurrentParentId(task.id)}
        >
          {task.text}
        </span>
      </div>
      <div className="flex items-center">
        <button onClick={() => toggleSticky(task.id)} className="mr-2 text-xl">
          {task.sticky ? '📌' : '📍'}
        </button>
        <button onClick={() => deleteTask(task.id)} className="text-sm text-red-500 hover:text-red-700">
          Delete
        </button>
      </div>
    </li>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {currentParentId && (
        <div className="flex items-center mb-4">
          <button
            onClick={goBack}
            className="text-sm bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded mr-2"
          >
            Back
          </button>
          <span className="font-semibold">{currentTitle}</span>
        </div>
      )}
      <form onSubmit={addTask} className="flex items-center mb-6">
        <input
          type="text"
          placeholder="Add a new task..."
          className="flex-1 py-2 px-4 rounded-l-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-r-lg">
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {currentTasks.map(renderTask)}
      </ul>
      {currentTasks.length === 0 && (
        <div className="text-center py-6 text-gray-500">Your task list is empty</div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

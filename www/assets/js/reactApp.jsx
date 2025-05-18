const { useState, useEffect } = React;

function App() {
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState('');

  // Load tasks from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('reactTodoTasks');
    if (stored) {
      setTasks(JSON.parse(stored));
    }
  }, []);

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('reactTodoTasks', JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setTasks([
      ...tasks,
      { id: Date.now().toString(), text: input.trim(), completed: false }
    ]);
    setInput('');
  };

  const toggleTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
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
        {tasks.map(task => (
          <li key={task.id} className="flex items-center justify-between task-item">
            <div className="flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={task.completed}
                onChange={() => toggleTask(task.id)}
              />
              <span className={task.completed ? 'line-through text-gray-500' : ''}>{task.text}</span>
            </div>
            <button
              onClick={() => deleteTask(task.id)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && (
        <div className="text-center py-6 text-gray-500">Your task list is empty</div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

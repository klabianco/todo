import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState('');
  const [currentParentId, setCurrentParentId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const stored = await AsyncStorage.getItem('rnTodoTasksV2');
        if (stored) {
          setTasks(JSON.parse(stored));
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('rnTodoTasksV2', JSON.stringify(tasks));
  }, [tasks]);

  const findTaskById = (list, id) => {
    for (const task of list) {
      if (task.id === id) return task;
      if (task.subtasks && task.subtasks.length > 0) {
        const found = findTaskById(task.subtasks, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateTaskById = (list, id, updater) => {
    return list.map(task => {
      if (task.id === id) {
        return updater(task);
      }
      if (task.subtasks && task.subtasks.length > 0) {
        return { ...task, subtasks: updateTaskById(task.subtasks, id, updater) };
      }
      return task;
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

  const addTask = () => {
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

  const renderItem = ({ item }) => (
    <View style={styles.taskItem}>
      <TouchableOpacity onPress={() => toggleTask(item.id)} style={styles.taskTextWrap}>
        <Text style={item.completed ? styles.completed : styles.taskText}>{item.text}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        <Button
          title={item.sticky ? 'Unpin' : 'Pin'}
          onPress={() => toggleSticky(item.id)}
        />
        <Button title="Open" onPress={() => setCurrentParentId(item.id)} />
        <Button title="Del" onPress={() => deleteTask(item.id)} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {currentParentId && (
        <View style={styles.breadcrumb}>
          <Button title="Back" onPress={goBack} />
          <Text style={styles.title}>{currentTitle}</Text>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a new task..."
          value={input}
          onChangeText={setInput}
        />
        <Button title="Add" onPress={addTask} />
      </View>
      <FlatList
        data={currentTasks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Your task list is empty</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginRight: 8,
    paddingHorizontal: 8,
    height: 40,
  },
  taskItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTextWrap: {
    flex: 1,
  },
  taskText: {
    fontSize: 16,
  },
  completed: {
    fontSize: 16,
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    color: '#6b7280',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
});

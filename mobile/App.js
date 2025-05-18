import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
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
    <View className="flex-row justify-between items-center py-2 border-b border-gray-200">
      <TouchableOpacity onPress={() => toggleTask(item.id)} className="flex-1">
        <Text className={item.completed ? 'text-base line-through text-gray-400' : 'text-base'}>{item.text}</Text>
      </TouchableOpacity>
      <View className="flex-row items-center">
        <Button
          title={item.sticky ? 'Unpin' : 'Pin'}
          onPress={() => toggleSticky(item.id)}
        />
        <Button title="Open" onPress={() => setCurrentParentId(item.id)} />
        <Button title="🗑" onPress={() => deleteTask(item.id)} />
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 p-4 bg-gray-100">
      {currentParentId && (
        <View className="flex-row items-center mb-3">
          <Button title="Back" onPress={goBack} />
          <Text className="ml-2 text-base font-semibold">{currentTitle}</Text>
        </View>
      )}
      <View className="flex-row mb-4">
        <TextInput
          className="flex-1 border border-gray-300 rounded mr-2 px-2 h-10"
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
        ListEmptyComponent={<Text className="text-center mt-8 text-gray-500">Your task list is empty</Text>}
      />
    </SafeAreaView>
  );
}


import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Task, TaskFilters } from '../types/task.types';

interface TaskState {
  tasks: Task[];
  selectedTask: Task | null;
  filters: TaskFilters;
  loading: boolean;
}

const initialState: TaskState = {
  tasks: [],
  selectedTask: null,
  filters: {},
  loading: false
};

const taskSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    setTasks: (state, action: PayloadAction<Task[]>) => {
      state.tasks = action.payload;
      state.loading = false;
    },
    setSelectedTask: (state, action: PayloadAction<Task | null>) => {
      state.selectedTask = action.payload;
    },
    addTask: (state, action: PayloadAction<Task>) => {
      state.tasks.unshift(action.payload);
    },
    upsertTask: (state, action: PayloadAction<Task>) => {
      const existingIndex = state.tasks.findIndex((task) => task.id === action.payload.id);
      if (existingIndex >= 0) {
        state.tasks[existingIndex] = action.payload;
      } else {
        state.tasks.unshift(action.payload);
      }
      if (state.selectedTask?.id === action.payload.id) {
        state.selectedTask = action.payload;
      }
    },
    setFilters: (state, action: PayloadAction<TaskFilters>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    removeTask: (state, action: PayloadAction<number>) => {
      state.tasks = state.tasks.filter((task) => task.id !== action.payload);
    },
    updateTask: (state, action: PayloadAction<Task>) => {
      const idx = state.tasks.findIndex((task) => task.id === action.payload.id);
      if (idx >= 0) {
        state.tasks[idx] = action.payload;
      }
      if (state.selectedTask?.id === action.payload.id) {
        state.selectedTask = action.payload;
      }
    }
  }
});

export const { setTasks, setSelectedTask, addTask, upsertTask, setFilters, removeTask, updateTask } = taskSlice.actions;
export default taskSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Notification } from '../types/notification.types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
}

const getUnreadCount = (notifications: Notification[]) =>
  notifications.filter((notification) => !notification.is_read).length;

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    setNotifications: (state, action: PayloadAction<Notification[]>) => {
      state.notifications = action.payload;
      state.unreadCount = getUnreadCount(action.payload);
    },
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload);
      state.unreadCount = getUnreadCount(state.notifications);
    },
    markAsRead: (state, action: PayloadAction<number>) => {
      const notification = state.notifications.find((item) => item.id === action.payload);
      if (notification) {
        notification.is_read = true;
      }
      state.unreadCount = getUnreadCount(state.notifications);
    },
    markAllRead: (state) => {
      state.notifications = state.notifications.map((notification) => ({
        ...notification,
        is_read: true
      }));
      state.unreadCount = 0;
    }
  }
});

export const { setNotifications, addNotification, markAsRead, markAllRead } =
  notificationSlice.actions;
export default notificationSlice.reducer;

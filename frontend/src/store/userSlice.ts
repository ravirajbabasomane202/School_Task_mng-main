import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../types/user.types';

interface UserState {
  users: User[];
  loading: boolean;
}

const initialState: UserState = {
  users: [],
  loading: false
};

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload;
      state.loading = false;
    }
  }
});

export const { setUsers } = userSlice.actions;
export default userSlice.reducer;

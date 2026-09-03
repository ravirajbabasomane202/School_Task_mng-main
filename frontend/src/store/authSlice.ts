import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../types/user.types';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
}

const userJson = localStorage.getItem('authUser');
const storedAccessToken = sessionStorage.getItem('accessToken');

const initialState: AuthState = {
  user: userJson && storedAccessToken ? (JSON.parse(userJson) as AuthUser) : null,
  token: storedAccessToken,
  isAuthenticated: Boolean(userJson && storedAccessToken)
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: AuthUser; accessToken: string; refreshToken?: string }>
    ) => {
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      state.isAuthenticated = true;
      localStorage.setItem('authUser', JSON.stringify(action.payload.user));
      sessionStorage.setItem('accessToken', action.payload.accessToken);

      if (action.payload.refreshToken) {
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      }
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('authUser');
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessToken');
    }
  }
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;

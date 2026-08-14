import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPARTMENT_HEAD_ROLES, ROLES } from '../constants/roles';
import * as authService from '../services/authService';
import { logout as clearCredentials, setCredentials } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { ChangePasswordPayload, LoginPayload } from '../types/user.types';

const getDashboardPath = (role: string) => {
  if (role === ROLES.CHAIRMAN) {
    return '/chairman';
  }

  if (role === ROLES.DIRECTOR) {
    return '/director';
  }

  if (DEPARTMENT_HEAD_ROLES.includes(role as (typeof DEPARTMENT_HEAD_ROLES)[number])) {
    return '/department';
  }

  return '/login';
};

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const result = await authService.login(payload);
      dispatch(
        setCredentials({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken
        })
      );
      navigate(getDashboardPath(result.user.role), { replace: true });
      return result;
    },
    [dispatch, navigate]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      dispatch(clearCredentials());
      navigate('/', { replace: true });
    }
  }, [dispatch, navigate]);

  const changePassword = useCallback((payload: ChangePasswordPayload) => {
    return authService.changePassword(payload);
  }, []);

  return {
    user,
    isAuthenticated,
    login,
    logout,
    changePassword
  };
};

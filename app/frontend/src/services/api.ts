import axios from 'axios';
import { logout, setCredentials } from '../store/authSlice';
import { store } from '../store';
import { getApiBaseUrl } from '../utils/apiBase';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// Track whether a refresh is already in flight so we don't fire multiple refresh calls
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url ?? '';
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout');

    // On 401, attempt a silent token refresh once before giving up
    if (error.response?.status === 401 && !isAuthRequest && !originalRequest._retry) {
      const storedRefreshToken = localStorage.getItem('refreshToken');

      if (!storedRefreshToken) {
        store.dispatch(logout());
        window.location.assign('/');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue the request until the refresh completes
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${getApiBaseUrl()}/auth/refresh`,
          { refreshToken: storedRefreshToken }
        );
        const newToken: string = response.data.data.accessToken;

        // Persist the new access token unconditionally. If Redux doesn't have a
        // hydrated user yet (e.g. this tab only has a refreshToken in
        // localStorage but no accessToken in sessionStorage - a fresh tab,
        // a browser restart, etc.) fetch the profile via /auth/me so the
        // store gets a real user object. Previously this update was skipped
        // whenever currentUser was null, which meant the token was applied
        // only to the single retried request and never saved anywhere else -
        // causing every other request to keep reading the old/missing token
        // from the store and loop through 401 -> refresh -> 401 forever.
        let currentUser = store.getState().auth.user;
        if (!currentUser) {
          const meResponse = await axios.get(`${getApiBaseUrl()}/auth/me`, {
            headers: { Authorization: `Bearer ${newToken}` }
          });
          currentUser = meResponse.data.data;
        }
        store.dispatch(setCredentials({ user: currentUser, accessToken: newToken }));

        processQueue(null, newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        store.dispatch(logout());
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('accessToken');
        window.location.assign('/login');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
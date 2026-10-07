const DEFAULT_API_BASE_URL = '/api';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:5000';

export const getApiBaseUrl = () => import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_BASE_URL;

export const getBackendBaseUrl = () => {
  const explicitApiUrl = import.meta.env.VITE_API_URL?.trim();
  if (explicitApiUrl) {
    return explicitApiUrl.replace(/\/api\/?$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return DEFAULT_BACKEND_URL;
};

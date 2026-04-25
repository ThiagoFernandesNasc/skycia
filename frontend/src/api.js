import axios from "axios";

const AUTH_TOKEN_STORAGE_KEY = "auth_bearer_token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  withCredentials: true,
});

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token, rememberMe = false) {
  if (!token) return;
  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } else {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (!config.headers) config.headers = {};
  if (token) {
    if (typeof config.headers.set === "function") {
      config.headers.set("Authorization", `Bearer ${token}`);
    } else {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;

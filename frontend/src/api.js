import axios from "axios";

const AUTH_TOKEN_STORAGE_KEY = "auth_bearer_token";

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const isLocalConfigured = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configured || "");

  if (configured && (import.meta.env.DEV || !isLocalConfigured)) return configured;
  if (import.meta.env.DEV) return "http://localhost:3000";
  return window.location.origin;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
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

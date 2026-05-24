import axios from "axios";

function resolveBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BASE_URL ||
    import.meta.env.REACT_APP_API_URL ||
    import.meta.env.BASE_URL ||
    "/api"
  );
}

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
});

let refreshPromise: Promise<string | null> | null = null;

function safeGetStorageItem(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

function safeRemoveStorageItem(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage write failures
  }
}

function clearStoredAuth() {
  safeRemoveStorageItem("accessToken");
  safeRemoveStorageItem("refreshToken");
  safeRemoveStorageItem("role");
}

function readJwtExp(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded?.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  let token = safeGetStorageItem("accessToken");
  const refreshToken = safeGetStorageItem("refreshToken");

  if (token && refreshToken) {
    const exp = readJwtExp(token);
    const now = Math.floor(Date.now() / 1000);
    if (exp && exp <= now + 20) {
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const nextAccessToken = await refreshPromise;
        if (nextAccessToken) token = nextAccessToken;
      } catch {
        // keep existing token; response interceptor will handle auth failures
      }
    }
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken() {
  const refreshToken = safeGetStorageItem("refreshToken");
  if (!refreshToken) return null;

  const response = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    { refreshToken },
    { withCredentials: true }
  );

  const nextAccessToken = response.data?.accessToken ?? null;
  const nextRefreshToken = response.data?.refreshToken ?? null;
  const nextRole = response.data?.role ?? null;

  if (!nextAccessToken || !nextRefreshToken || !nextRole) {
    return null;
  }

  safeSetStorageItem("accessToken", nextAccessToken);
  safeSetStorageItem("refreshToken", nextRefreshToken);
  safeSetStorageItem("role", nextRole);
  return nextAccessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const requestUrl = String(originalRequest?.url ?? "");
    const meBootstrapRequest = requestUrl === "/me" || requestUrl.startsWith("/me?");

    if (error?.response?.status === 404 && meBootstrapRequest) {
      clearStoredAuth();
    }

    if (
      error?.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !requestUrl.includes("/auth/login") &&
      !requestUrl.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;

      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });

        const nextAccessToken = await refreshPromise;
        if (nextAccessToken) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
          return api(originalRequest);
        }
      } catch {
        // Fall through to logout behavior below.
      }
    }

    if (error?.response?.status === 401) {
      clearStoredAuth();
      // Let auth screens and /me bootstrap flow handle route changes.
      if (!requestUrl.startsWith("/me")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

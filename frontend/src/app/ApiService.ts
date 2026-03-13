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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
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

  localStorage.setItem("accessToken", nextAccessToken);
  localStorage.setItem("refreshToken", nextRefreshToken);
  localStorage.setItem("role", nextRole);
  return nextAccessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    if (
      error?.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !String(originalRequest.url ?? "").includes("/auth/login") &&
      !String(originalRequest.url ?? "").includes("/auth/refresh")
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
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("role");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

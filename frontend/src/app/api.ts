import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:8080`;

// Use cookies for USER/RESELLER sessions, JWT for ADMIN (and programmatic API keys)
export const api = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((config) => {
  const role = localStorage.getItem("role");
  const token = localStorage.getItem("accessToken");
  if (token && role === "ADMIN") config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original.__retry) {
      original.__retry = true;
      const refreshToken = localStorage.getItem("refreshToken");
      const role = localStorage.getItem("role");
      if (refreshToken && role === "ADMIN") {
        try {
          const resp = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
          const accessToken = resp.data.accessToken;
          const newRefresh = resp.data.refreshToken;
          if (accessToken) localStorage.setItem("accessToken", accessToken);
          if (newRefresh) localStorage.setItem("refreshToken", newRefresh);
          original.headers.Authorization = `Bearer ${accessToken}`;
          return axios(original);
        } catch (e) {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("role");
          window.location.href = "/login";
        }
      }
      // Session-based: just redirect
      if (role === "USER" || role === "RESELLER") {
        localStorage.removeItem("role");
        window.location.href = "/login";
      }
    }
    throw err;
  }
);

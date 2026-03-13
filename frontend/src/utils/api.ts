// src/utils/api.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken() {
    return localStorage.getItem("accessToken") || "";
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("Accept", "application/json");

    // attach bearer for protected routes
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // set json if body is object
    if (opts.body && !(opts.body instanceof FormData) && !headers.get("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers,
        credentials: "include", // keep cookies if backend uses them anywhere
    });

    // auto-handle non-json
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
        const msg = typeof data === "object" && data?.message ? data.message : `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data;
}

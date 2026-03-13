import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { clearTokens, getRole } from "../auth";

export type Me = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "RESELLER" | "USER";
  credits: number;
  expireAt: string | null;
  acceptedDisclaimerAt: string | null;
  theme: "light" | "dark" | null;
  status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED";
  createdAt: string;
};

type AuthCtx = {
  user: Me | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    try {
      const res = await api.get("/me");
      setUser(res.data.me);
      if (typeof window !== "undefined" && (res.data.me?.theme === "light" || res.data.me?.theme === "dark")) {
        window.localStorage.setItem("dashboardMode", res.data.me.theme);
        window.dispatchEvent(new CustomEvent("dashboard-theme-change", { detail: res.data.me.theme }));
      }
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    // best-effort server logout (clears session cookie)
    api.post("/auth/logout", {}).catch(() => void 0).finally(() => {
      clearTokens();
      setUser(null);
      window.location.href = "/login";
    });
  }

  useEffect(() => {
    // if no tokens, skip
    const role = getRole();
    if (!role) {
      setLoading(false);
      return;
    }
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ user, loading, refreshMe, logout }), [user, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

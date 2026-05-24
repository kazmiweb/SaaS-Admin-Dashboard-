import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../app/api";
import { getRole } from "../app/auth";
import { useServices } from "../app/services/useServices";
import { serviceToPath } from "../app/services/serviceRoutes";

type Role = "ADMIN" | "RESELLER" | "USER";
type NavItem = { label: string; to: string; icon: React.ReactNode };

export function Layout({
  children,
  onLogout,
  title,
  role: roleProp,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  title?: string;
  role?: Role;
}) {
  const role = (roleProp ?? getRole()) as Role;
  const isUserOrReseller = role === "USER" || role === "RESELLER";
  const { services: dynServices } = useServices(isUserOrReseller);
  const loc = useLocation();

  const [me, setMe] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem("elookup_sidebar");
    return saved ? saved === "1" : false;
  });
  const [servicesExpanded, setServicesExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem("elookup_services_expanded");
    return saved ? saved === "1" : true;
  });

  useEffect(() => {
    (async () => {
      try {
        const resp = await api.get("/me");
        setMe(resp.data?.me ?? null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("elookup_sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("elookup_services_expanded", servicesExpanded ? "1" : "0");
  }, [servicesExpanded]);

  const active = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + "/");

  const navItems: NavItem[] = useMemo(() => {
    if (role === "ADMIN") {
      return [
        { label: "Dashboard", to: "/admin/dashboard", icon: "🏠" },
        { label: "API Management", to: "/admin/api-management", icon: "🗄️" },
        { label: "User Management", to: "/admin/user-management", icon: "👥" },
        { label: "Transaction / Revenue", to: "/admin/transactions", icon: "💲" },
        { label: "Security", to: "/admin/security", icon: "🛡️" },
        { label: "Activity Logs", to: "/admin/activity", icon: "📈" },
      ];
    }
    if (role === "RESELLER") {
      return [
        { label: "Dashboard", to: "/reseller/dashboard", icon: "🏠" },
        { label: "Search All in One", to: "/reseller/search", icon: "🔎" },
        { label: "My Users", to: "/reseller/users", icon: "👥" },
        { label: "Transactions", to: "/reseller/transactions", icon: "💲" },
        { label: "Settings", to: "/reseller/settings", icon: "⚙️" },
      ];
    }
    return [
      { label: "Dashboard", to: "/user/dashboard", icon: "🏠" },
      { label: "Search All in One", to: "/user/search", icon: "🔎" },
      { label: "Settings", to: "/user/settings", icon: "⚙️" },
    ];
  }, [role]);

  return (
    <div className="min-h-screen bg-[url('/assets/background-body-admin-D2G-X0Oo.png')] bg-cover bg-center text-white">
      <aside
        className={[
          "fixed left-0 top-0 z-40 h-screen border-r border-white/10 bg-[#5b21f3]/85 backdrop-blur-xl transition-all duration-200 flex flex-col",
          collapsed ? "w-[76px]" : "w-[192px]",
        ].join(" ")}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            {!collapsed && <div className="text-2xl font-extrabold tracking-tight">Trace Verisys</div>}
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/15"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "☰" : "⟨"}
            </button>
          </div>

          {!collapsed && (
            <div className="mt-4 rounded-2xl bg-white/10 p-3">
              <div className="text-sm font-bold">{me?.name || "System User"}</div>
              <div className="text-xs text-white/80 break-all">{me?.email || "-"}</div>
              {role !== "ADMIN" && <div className="mt-2 text-xs font-semibold">{me?.credits ?? 0} credits</div>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {navItems.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold border transition",
                  active(it.to)
                    ? "bg-blue-600/25 border-blue-400/40"
                    : "bg-white/5 border-white/10 hover:bg-white/10",
                  collapsed ? "justify-center" : "",
                ].join(" ")}
                title={collapsed ? it.label : undefined}
              >
                <span className="text-lg">{it.icon}</span>
                {!collapsed && <span>{it.label}</span>}
              </Link>
            ))}
          </div>

          {isUserOrReseller && !collapsed && dynServices?.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setServicesExpanded((v) => !v)}
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
              >
                <span>Services</span>
                <span>{servicesExpanded ? "▾" : "▸"}</span>
              </button>

              {servicesExpanded && (
                <div className="mt-2 space-y-1">
                  {dynServices.map((s: any) => (
                    <a
                      key={s.id}
                      href={serviceToPath(s.name, role)}
                      className="block rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
                    >
                      {s.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-3 space-y-2">
          <button
            onClick={onLogout}
            className={[
              "w-full rounded-xl px-3 py-3 text-sm font-extrabold border transition flex items-center gap-3",
              "bg-red-600 border-red-600 hover:bg-red-700 text-white",
              collapsed ? "justify-center" : "",
            ].join(" ")}
            title={collapsed ? "Logout" : undefined}
          >
            <span className="text-lg">⎋</span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className={[collapsed ? "pl-[76px]" : "pl-[192px]", "transition-all duration-200 min-h-screen"].join(" ")}>
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1320]/20 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="text-lg font-extrabold">{title ?? (role === "ADMIN" ? "Super Admin Dashboard" : "Trace Verisys")}</div>
            {role !== "ADMIN" && (
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/15 px-4 py-1.5 text-sm font-extrabold text-emerald-200">
                {me?.credits ?? 0}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}

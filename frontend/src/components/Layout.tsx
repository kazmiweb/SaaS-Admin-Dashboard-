import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../app/api";
import { getRole } from "../app/auth";

const disclaimerText = `THIS WEBSITE IS STRICTLY FOR LAW ENFORCEMENT DEPARTMENTS AND AUTHORIZED PERSONNEL ONLY.

⚠️ WARNING: Misuse of this system for illegal activities, harassment, or unauthorized purposes is strictly prohibited and may result in criminal prosecution.

By accessing and using this system, you acknowledge that you are solely responsible for your actions and any consequences arising from misuse.`;

type NavItem = { label: string; to: string; icon: React.ReactNode; badge?: string };

export function Layout({ children, onLogout, title }: { children: React.ReactNode; onLogout: () => void; title?: string }) {
  const role = getRole();
  const loc = useLocation();
  const nav = useNavigate();

  const [me, setMe] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem("elookup_sidebar");
    return saved ? saved === "1" : true; // mobile = compact
  });

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    (async () => {
      const resp = await api.get("/me");
      setMe(resp.data.me);
      setShowDisclaimer(!resp.data.me.acceptedDisclaimerAt);
      document.documentElement.classList.toggle("dark", resp.data.me.theme === "dark");
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("elookup_sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  async function toggleTheme() {
    const next = (me?.theme === "dark") ? "light" : "dark";
    await api.post("/me/theme", { theme: next });
    setMe({ ...me, theme: next });
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  async function acceptDisclaimer() {
    if (!agree) return;
    await api.post("/me/accept-disclaimer");
    setShowDisclaimer(false);
  }

  const active = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + "/");

  const userNav: NavItem[] = [
    { label: "Elookup Search", to: "/app/search", icon: <span>🔎</span> },
    // Vehicle tabs placeholders (wire to services later)
    { label: "Punjab Excise", to: "/app/vehicle/punjab", icon: <span>🇵🇰</span> },
    { label: "Sindh Excise", to: "/app/vehicle/sindh", icon: <span>🏜️</span> },
    { label: "Islamabad Excise", to: "/app/vehicle/ict", icon: <span>🏛️</span> },
    { label: "Balochistan Excise", to: "/app/vehicle/balochistan", icon: <span>🏜️</span>, badge: "NEW" },
    { label: "AJK Excise", to: "/app/vehicle/ajk", icon: <span>🏔️</span> },
    { label: "Transaction History", to: "/app/profile", icon: <span>🧾</span> },
  ];

  const adminNav: NavItem[] = [
    { label: "Dashboard", to: "/admin/stats", icon: <span>🧭</span> },
    { label: "API Manager", to: "/admin/apis", icon: <span>🧩</span> },
    { label: "Users", to: "/admin/users", icon: <span>👥</span> },
    { label: "Transactions", to: "/admin/transactions", icon: <span>💳</span> },
    { label: "Security", to: "/admin/security", icon: <span>🛡️</span> },
    { label: "Activity Logs", to: "/admin/activity", icon: <span>🕒</span> },
  ];

  const navItems = useMemo(() => (role === "ADMIN" ? adminNav : userNav), [role]);

  const initials = (me?.name ?? "U").trim().slice(0, 1).toLowerCase();

  return (
    <div className="min-h-screen bg-[#0b1320] text-slate-100">
      {/* Sidebar */}
      <aside
        className={[
          "fixed left-0 top-0 z-40 h-screen border-r border-white/10 bg-[#0f1b2b]/95 backdrop-blur",
          "transition-all duration-200",
          collapsed ? "w-[76px]" : "w-[320px]",
        ].join(" ")}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-black">
              E
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className="text-xl font-extrabold text-blue-400">Elookup {role === "ADMIN" ? <span className="ml-2 text-xs bg-red-600 px-2 py-0.5 rounded-md">ADMIN</span> : <span className="text-blue-300">v2.0</span>}</div>
                <div className="text-xs text-slate-300 -mt-0.5">Intelligence Search</div>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
            title="Toggle"
          >
            ☰
          </button>
        </div>

        {/* Profile */}
        <div className="p-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600/40 to-cyan-600/20 border border-blue-400/20 flex items-center justify-center text-lg font-black">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-extrabold truncate">{me?.name ?? "..."}</div>
                <div className="text-xs text-slate-300 truncate">{me?.email ?? ""}</div>
                <div className="text-sm text-emerald-300 font-bold mt-1">{me?.credits ?? 0} credits</div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="px-3 pb-4 overflow-y-auto h-[calc(100vh-260px)]">
          {role !== "ADMIN" && !collapsed && (
            <div className="px-2 py-2 text-xs text-slate-400 font-bold tracking-wider">MAIN</div>
          )}
          {role !== "ADMIN" && !collapsed && (
            <div className="px-2 pt-3 pb-2 text-xs text-slate-400 font-bold tracking-wider">VEHICLE RECORDS</div>
          )}
          {role !== "ADMIN" && collapsed && <div className="h-2" />}

          <div className="space-y-2">
            {navItems.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold border transition",
                  active(it.to) ? "bg-blue-600/25 border-blue-500/40" : "bg-white/5 border-white/10 hover:bg-white/10",
                  collapsed ? "justify-center" : "",
                ].join(" ")}
                title={collapsed ? it.label : undefined}
              >
                <div className="text-lg">{it.icon}</div>
                {!collapsed && (
                  <div className="flex-1 flex items-center justify-between gap-2">
                    <span>{it.label}</span>
                    {it.badge && <span className="text-[10px] font-extrabold bg-yellow-500/20 text-yellow-200 px-2 py-0.5 rounded-full border border-yellow-500/30">{it.badge}</span>}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            onClick={toggleTheme}
            className={["w-full rounded-xl px-3 py-3 text-sm font-bold border transition flex items-center gap-3",
              "bg-white/5 border-white/10 hover:bg-white/10",
              collapsed ? "justify-center" : ""].join(" ")}
            title={collapsed ? "Theme" : undefined}
          >
            <span className="text-lg">🌓</span>
            {!collapsed && <span>Theme</span>}
          </button>

          <button
            onClick={onLogout}
            className={["w-full rounded-xl px-3 py-3 text-sm font-extrabold border transition flex items-center gap-3",
              "bg-red-600 border-red-600 hover:bg-red-700 text-white",
              collapsed ? "justify-center" : ""].join(" ")}
            title={collapsed ? "Logout" : undefined}
          >
            <span className="text-lg">⎋</span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <main className={[collapsed ? "pl-[76px]" : "pl-[320px]", "transition-all duration-200"].join(" ")}>
        {/* Top bar (mobile + desktop) */}
        <div className="sticky top-0 z-30 bg-[#0b1320]/80 backdrop-blur border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="text-lg font-extrabold">{title ?? (role === "ADMIN" ? "Admin Dashboard" : "Elookup")}</div>
            <div className="flex items-center gap-3">
              {role !== "ADMIN" && (
                <div className="px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 font-extrabold text-sm">
                  {me?.credits ?? 0}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>

      {/* Disclaimer Modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0f1b2b] border border-white/10 shadow-2xl p-6">
            <div className="text-lg font-extrabold">LEGAL NOTICE & DISCLAIMER</div>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{disclaimerText}</pre>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="font-semibold">I UNDERSTAND AND AGREE TO THE TERMS</span>
            </label>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => nav("/login")} className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">Logout</button>
              <button
                disabled={!agree}
                onClick={acceptDisclaimer}
                className={[
                  "px-4 py-2 rounded-xl font-extrabold",
                  agree ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-white/10 text-slate-400 cursor-not-allowed",
                ].join(" ")}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

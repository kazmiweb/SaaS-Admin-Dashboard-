export function getDashboardUi(mode: "light" | "dark") {
  const dark = mode === "dark";

  return {
    shell: {
      appBg: dark ? "#0f172a" : "#eef2f7",
      sidebarBg: dark
        ? "linear-gradient(180deg, #111827 0%, #0f172a 100%)"
        : "linear-gradient(180deg, #f7f7f8 0%, #eceef2 100%)",
      sidebarBorder: dark ? "rgba(148,163,184,0.14)" : "rgba(12,18,28,0.08)",
      sidebarShadow: dark ? "18px 0 40px rgba(0, 0, 0, 0.22)" : "18px 0 40px rgba(15, 23, 42, 0.06)",
      topbarBg: dark ? "rgba(15, 23, 42, 0.82)" : "rgba(255,255,255,0.92)",
    },
    text: {
      primary: dark ? "#f8fafc" : "#101828",
      secondary: dark ? "#cbd5e1" : "#667085",
      muted: dark ? "#94a3b8" : "#6b7280",
      accent: dark ? "#f87171" : "#dc2626",
      accentSoft: dark ? "#34d399" : "#2bb3a3",
    },
    surface: {
      card: dark ? "rgba(15, 23, 42, 0.78)" : "rgba(255,255,255,0.92)",
      cardStrong: dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255,255,255,0.98)",
      border: dark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
      borderStrong: dark ? "rgba(148,163,184,0.24)" : "rgba(15,23,42,0.12)",
      hover: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)",
      input: dark ? "rgba(2, 6, 23, 0.52)" : "#ffffff",
      inputBorder: dark ? "rgba(148,163,184,0.22)" : "rgba(15,23,42,0.12)",
      overlay: dark ? "rgba(2, 6, 23, 0.82)" : "rgba(255,255,255,0.98)",
      code: dark ? "rgba(2, 6, 23, 0.6)" : "rgba(15, 23, 42, 0.06)",
    },
    nav: {
      itemBg: dark ? "transparent" : "transparent",
      itemHover: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.72)",
      itemActiveBg: dark ? "rgba(15, 23, 42, 0.92)" : "rgba(255,255,255,0.94)",
      itemActiveBorder: dark ? "rgba(248,113,113,0.18)" : "rgba(239,68,68,0.12)",
      itemActiveShadow: dark ? "0 10px 24px rgba(0,0,0,0.22)" : "0 10px 24px rgba(239, 68, 68, 0.08)",
    },
    status: {
      warningBg: dark ? "rgba(250, 204, 21, 0.16)" : "rgba(255,215,0,0.12)",
      warningBorder: dark ? "rgba(250, 204, 21, 0.3)" : "rgba(255,215,0,0.25)",
      errorText: dark ? "#fca5a5" : "#dc2626",
    },
  };
}

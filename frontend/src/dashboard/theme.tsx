import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline } from "@mui/material";
import { THEME_ID, ThemeProvider, createTheme } from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";
import { getDashboardUi } from "./uiTokens";

type DashboardThemeContextValue = {
  mode: "light" | "dark";
  toggleMode: () => void;
  setMode: (next: "light" | "dark") => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

function getDesignTokens(mode: "light" | "dark") {
  const dark = mode === "dark";
  const ui = getDashboardUi(mode);
  return {
    palette: {
      mode,
      primary: {
        main: dark ? "#582CFF" : "#542de1",
      },
      secondary: {
        main: dark ? "#05CD99" : "#0ea5e9",
      },
      success: {
        main: "#05CD99",
      },
      warning: {
        main: "#FFB547",
      },
      error: {
        main: "#FF6A6A",
      },
      background: {
        default: dark ? "#0f172a" : "#eef2f7",
        paper: dark ? "rgba(17, 24, 52, 0.88)" : "rgba(255,255,255,0.92)",
      },
      text: {
        primary: dark ? "#FFFFFF" : "#1b2559",
        secondary: dark ? "#A3AED0" : "#707EAE",
      },
      divider: dark ? "rgba(255,255,255,0.08)" : "rgba(112,126,174,0.18)",
      action: {
        selected: dark ? "rgba(88,44,255,0.18)" : "rgba(88,44,255,0.08)",
      },
    },
    shape: {
      borderRadius: 20,
    },
    typography: {
      fontFamily: ["Plus Jakarta Sans", "Raleway", "Open Sans", "Roboto", "sans-serif"].join(","),
      h4: { fontWeight: 800, fontSize: "2rem", "@media (max-width:600px)": { fontSize: "1.45rem" } },
      h5: { fontWeight: 800, fontSize: "1.45rem", "@media (max-width:600px)": { fontSize: "1.15rem" } },
      h6: { fontWeight: 800, fontSize: "1.1rem", "@media (max-width:600px)": { fontSize: "0.96rem" } },
      body2: { fontSize: "0.88rem", "@media (max-width:600px)": { fontSize: "0.8rem" } },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            colorScheme: mode,
          },
          body: {
            backgroundAttachment: "fixed",
            backgroundColor: ui.shell.appBg,
            backgroundImage: dark
              ? "radial-gradient(circle at top, rgba(220, 38, 38, 0.1), transparent 28%), linear-gradient(180deg, #111827 0%, #0f172a 100%)"
              : "radial-gradient(circle at top, rgba(220, 38, 38, 0.08), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
            color: dark ? "#f8fafc" : "#101828",
            overflowX: "hidden",
          },
          "#root": {
            minHeight: "100vh",
            backgroundColor: ui.shell.appBg,
            overflowX: "hidden",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: "blur(18px)",
            backgroundColor: ui.surface.card,
            border: `1px solid ${ui.surface.border}`,
            boxShadow: dark ? "0 18px 42px rgba(2, 6, 23, 0.42)" : "0 18px 40px rgba(15, 23, 42, 0.08)",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            backdropFilter: "blur(18px)",
            backgroundColor: ui.surface.card,
            border: `1px solid ${ui.surface.border}`,
            boxShadow: dark ? "0 20px 45px rgba(2, 6, 23, 0.46)" : "0 18px 40px rgba(15, 23, 42, 0.08)",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            textTransform: "none" as const,
            fontWeight: 700,
            "@media (max-width:600px)": {
              fontSize: "0.75rem",
              minHeight: 34,
              paddingLeft: 10,
              paddingRight: 10,
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: ui.surface.border,
            color: ui.text.primary,
            verticalAlign: "top",
            whiteSpace: "normal",
            wordBreak: "break-word",
            "@media (max-width:600px)": {
              fontSize: "0.74rem",
              paddingTop: 6,
              paddingBottom: 6,
            },
          },
          head: {
            color: ui.text.secondary,
            fontWeight: 700,
            "@media (max-width:600px)": {
              fontSize: "0.7rem",
            },
          },
        },
      },
      MuiTable: {
        styleOverrides: {
          root: {
            width: "100%",
            tableLayout: "fixed",
            "@media (min-width:900px)": {
              tableLayout: "auto",
            },
          },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: `1px solid ${ui.surface.borderStrong}`,
            borderRadius: 16,
            backgroundColor: ui.surface.card,
            "--DataGrid-overlayHeight": "130px",
          },
          columnHeaders: {
            backgroundColor: ui.surface.hover,
            borderBottom: `1px solid ${ui.surface.borderStrong}`,
          },
          cell: {
            whiteSpace: "normal",
            wordBreak: "break-word",
            lineHeight: 1.35,
            alignItems: "center",
          },
          footerContainer: {
            borderTop: `1px solid ${ui.surface.borderStrong}`,
          },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: {
            color: ui.text.secondary,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: ui.surface.input,
            color: ui.text.primary,
          },
        },
      },
    },
  };
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<"light" | "dark">(() => {
    let stored: string | null = null;
    if (typeof window !== "undefined") {
      try {
        stored = window.localStorage.getItem("dashboardMode");
      } catch {
        stored = null;
      }
    }
    return stored === "light" ? "light" : "dark";
  });
  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);
  function setMode(next: "light" | "dark") {
    setModeState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("dashboardMode", next);
      } catch {
        // ignore storage write failures
      }
      window.dispatchEvent(new CustomEvent("dashboard-theme-change", { detail: next }));
    }
  }

  useEffect(() => {
    function syncMode(next: string | null) {
      if (next === "light" || next === "dark") {
        setModeState(next);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === "dashboardMode") {
        syncMode(event.newValue);
      }
    }

    function handleThemeChange(event: Event) {
      const next = (event as CustomEvent<"light" | "dark">).detail;
      syncMode(next);
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("dashboard-theme-change", handleThemeChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("dashboard-theme-change", handleThemeChange as EventListener);
    };
  }, []);
  const value = useMemo(
    () => ({
      mode,
      toggleMode: () => setMode(mode === "light" ? "dark" : "light"),
      setMode,
    }),
    [mode]
  );

  return (
    <DashboardThemeContext.Provider value={value}>
      <ThemeProvider theme={{ [THEME_ID]: theme }}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) throw new Error("useDashboardTheme must be used inside DashboardThemeProvider");
  return ctx;
}

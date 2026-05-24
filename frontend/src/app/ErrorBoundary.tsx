import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

const BOOTSTRAP_STORAGE_KEYS = [
  "accessToken",
  "refreshToken",
  "role",
  "dashboardMode",
  "elookup_sidebar",
  "elookup_services_expanded",
];

function clearBootstrapStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const key of BOOTSTRAP_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.sessionStorage.removeItem("__elookup_chunk_reload_once__");
  } catch {
    // ignore storage cleanup failures
  }
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as any).message ?? "")
        : String(error ?? "");
    return { hasError: true, errorMessage: message.slice(0, 260) };
  }

  componentDidCatch(error: unknown) {
    console.error("frontend.error_boundary", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            px: 3,
            background: "linear-gradient(135deg, #071120 0%, #0f172a 46%, #134e4a 100%)",
            color: "#e2e8f0",
          }}
        >
          <Box textAlign="center" maxWidth={520}>
            <Typography variant="h4" fontWeight={900} mb={1.5}>
              UI crashed during startup
            </Typography>
            <Typography sx={{ opacity: 0.8, mb: 3 }}>
              Frontend bootstrap failed. Refresh once. If the problem stays, reset local app data and retry login.
            </Typography>
            {this.state.errorMessage ? (
              <Typography sx={{ opacity: 0.72, fontSize: "0.8rem", mb: 2, wordBreak: "break-word" }}>
                {this.state.errorMessage}
              </Typography>
            ) : null}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} justifyContent="center">
              <Button variant="outlined" color="inherit" onClick={() => window.location.reload()}>
                Refresh app
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  clearBootstrapStorage();
                  window.location.assign("/login");
                }}
              >
                Reset data and login
              </Button>
            </Stack>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

import React from "react";
import { Box, Button, Typography } from "@mui/material";

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
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
              Frontend bootstrap failed. Refresh once. If the problem stays, clear stale local storage and retry login.
            </Typography>
            <Button variant="contained" onClick={() => window.location.assign("/login")}>
              Go to login
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

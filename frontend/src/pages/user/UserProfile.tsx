import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";
import { useDashboardTheme } from "../../dashboard/theme";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function UserProfile() {
  const { user, refreshMe } = useAuth();
  const { mode, setMode } = useDashboardTheme();
  const [error, setError] = useState("");
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);

  async function persistTheme(next: "light" | "dark") {
    try {
      setError("");
      await api.post("/me/theme", { theme: next });
      await refreshMe();
    } catch {
      setError("Failed to save theme preference.");
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ color: ui.text.primary }}>Profile</Typography>
        <Typography sx={{ color: ui.text.secondary }}>Account details and dashboard appearance.</Typography>
      </Stack>

      {error ? <Alert severity="warning" onClose={() => setError("")}>{error}</Alert> : null}

      <Card sx={{ maxWidth: 760, mx: "auto", background: ui.surface.cardStrong, border: `1px solid ${ui.surface.borderStrong}` }}>
        <CardContent>
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Avatar
              sx={{
                width: { xs: 120, md: 144 },
                height: { xs: 120, md: 144 },
                fontSize: { xs: 44, md: 54 },
                background: theme.palette.mode === "dark"
                  ? "linear-gradient(135deg, #dc2626 0%, #f97316 100%)"
                  : "linear-gradient(135deg, #ef4444 0%, #fb7185 100%)",
                color: "#fff",
                border: "none",
                boxShadow: theme.palette.mode === "dark"
                  ? "0 24px 60px rgba(2, 6, 23, 0.48)"
                  : "0 24px 50px rgba(239, 68, 68, 0.18)",
              }}
            >
              {user?.name?.[0] ?? user?.email?.[0] ?? "U"}
            </Avatar>

            <Stack spacing={0.75} sx={{ width: "100%" }}>
              <Typography variant="h5" sx={{ color: ui.text.primary }}>{user?.name ?? "User"}</Typography>
              <Typography sx={{ color: ui.text.secondary }}>{user?.email}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} justifyContent="center" alignItems="center" useFlexGap flexWrap="wrap">
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 999,
                    backgroundColor: ui.surface.hover,
                    border: `1px solid ${ui.surface.border}`,
                    color: ui.text.primary,
                    fontSize: "0.875rem",
                    fontWeight: 700,
                  }}
                >
                  Credits: {user?.credits ?? 0}
                </Box>
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 999,
                    backgroundColor: ui.surface.hover,
                    border: `1px solid ${ui.surface.border}`,
                    color: ui.text.primary,
                    fontSize: "0.875rem",
                    fontWeight: 700,
                  }}
                >
                  Expiry: {user?.expireAt ? new Date(user.expireAt).toLocaleDateString() : "No expiry"}
                </Box>
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 999,
                    backgroundColor: ui.surface.hover,
                    border: `1px solid ${ui.surface.border}`,
                    color: ui.text.primary,
                    fontSize: "0.875rem",
                    fontWeight: 700,
                  }}
                >
                  Status: {user?.status ?? "ACTIVE"}
                </Box>
              </Stack>
            </Stack>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2}>
            <Stack spacing={0.5}>
              <Typography fontWeight={800} sx={{ color: ui.text.primary }}>Dashboard Theme</Typography>
              <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                Toggle the same theme used by the new dashboard shell.
              </Typography>
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={mode === "dark"}
                  onChange={async () => {
                    const next = mode === "dark" ? "light" : "dark";
                    setMode(next);
                    await persistTheme(next);
                  }}
                />
              }
              label={mode === "dark" ? "Dark mode" : "Light mode"}
              sx={{ color: ui.text.primary }}
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }} justifyContent="center">
            <Button variant="contained">Profile Synced</Button>
            <Button
              component={RouterLink}
              to={`/${user?.role === "RESELLER" ? "reseller" : "user"}/settings/change-password`}
              variant="outlined"
            >
              Change Password
            </Button>
            <Button variant="outlined" disabled={!user?.expireAt}>
              {user?.expireAt ? `Expires ${new Date(user.expireAt).toLocaleDateString()}` : "No expiry set"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

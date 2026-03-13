import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Box, CircularProgress, Typography } from "@mui/material";

function roleHome(role: "ADMIN" | "USER" | "RESELLER") {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "RESELLER") return "/reseller/dashboard";
  return "/user/dashboard";
}

export default function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box
        minHeight="100vh"
        display="grid"
        sx={{
          placeItems: "center",
          background: "linear-gradient(135deg, #071120 0%, #0f172a 46%, #134e4a 100%)",
          color: "#e2e8f0",
        }}
      >
        <Box textAlign="center">
          <CircularProgress color="inherit" />
          <Typography mt={2} fontWeight={700}>
            Loading workspace...
          </Typography>
        </Box>
      </Box>
    );
  }
  return <Navigate to={user ? roleHome(user.role) : "/login"} replace />;
}

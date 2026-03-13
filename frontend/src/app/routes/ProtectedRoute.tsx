import { Box, CircularProgress } from "@mui/material";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

type Role = "ADMIN" | "USER" | "RESELLER";

type ProtectedRouteProps = {
  roles?: Role[];
};

function roleHome(role: Role) {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "RESELLER") return "/reseller/dashboard";
  return "/user/dashboard";
}

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box minHeight="100vh" display="grid" sx={{ placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <Outlet />;
}

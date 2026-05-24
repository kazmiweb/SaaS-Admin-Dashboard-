import React from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getRole } from "../auth";

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
  const { user, loading, refreshMe } = useAuth();
  const roleHint = getRole();
  const hasSessionHint = Boolean(roleHint);
  const effectiveRole = user?.role ?? roleHint ?? null;
  const triedHydrationRef = React.useRef(false);
  const [hydrating, setHydrating] = React.useState(false);

  React.useEffect(() => {
    if (loading || user || !hasSessionHint || triedHydrationRef.current) return;
    triedHydrationRef.current = true;
    setHydrating(true);
    refreshMe()
      .catch(() => void 0)
      .finally(() => setHydrating(false));
  }, [hasSessionHint, loading, refreshMe, user]);

  if (loading || hydrating || (!effectiveRole && hasSessionHint && !triedHydrationRef.current)) {
    return (
      <Box minHeight="100vh" display="grid" sx={{ placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!effectiveRole) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(effectiveRole)) {
    return <Navigate to={roleHome(effectiveRole)} replace />;
  }

  return <Outlet />;
}

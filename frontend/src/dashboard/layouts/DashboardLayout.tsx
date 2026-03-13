import { Box, useMediaQuery, useTheme } from "@mui/material";
import React, { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import SidebarNav from "../components/SidebarNav";
import Topbar from "../components/Topbar";
import { getDashboardUi } from "../uiTokens";

export default function DashboardLayout() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const [collapsed, setCollapsed] = useState(isMdDown);

  React.useEffect(() => {
    setCollapsed(isMdDown);
  }, [isMdDown]);

  const title = useMemo(() => "Dashboard", []);

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: ui.shell.appBg,
        overflowX: "clip",
      }}
    >
      {isMdDown && !collapsed ? (
        <Box
          onClick={() => setCollapsed(true)}
          sx={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.54)",
            zIndex: theme.zIndex.drawer,
          }}
        />
      ) : null}
      <SidebarNav collapsed={collapsed} mobile={isMdDown} onClose={() => setCollapsed(true)} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          width: "100%",
        }}
      >
        <Topbar title={title} onToggleSidebar={() => setCollapsed((prev) => !prev)} />
        <Box
          sx={{
            px: { xs: 1.5, sm: 2, md: 3 },
            py: { xs: 1.5, sm: 2, md: 3 },
            maxWidth: "100%",
            overflowX: "hidden",
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

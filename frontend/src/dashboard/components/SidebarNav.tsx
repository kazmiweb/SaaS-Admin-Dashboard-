import ContactsOutlinedIcon from "@mui/icons-material/ContactsOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import { Avatar, Box, Collapse, Stack, Typography, useTheme } from "@mui/material";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../app/auth/useAuth";
import darkSidebarProfile from "../../assets/dark-spy.png";
import sidebarProfile from "../../assets/spy.png";
import { getDashboardUi } from "../uiTokens";

type SidebarNavProps = {
  collapsed: boolean;
  mobile?: boolean;
  onClose?: () => void;
};

type NavItem = {
  label: string;
  icon: JSX.Element;
  to?: string;
  children?: NavItem[];
};

type DashboardUi = ReturnType<typeof getDashboardUi>;

const ROLE_TITLES: Record<"ADMIN" | "USER" | "RESELLER", string> = {
  ADMIN: "System Admin",
  USER: "Premium User",
  RESELLER: "Reseller",
};

function getUserSubtitle(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return "Premium User";
  if (user.role === "ADMIN") return "System Admin";
  if (user.role === "RESELLER") return "Reseller";
  return user.expireAt || user.credits > 0 ? "Premium User" : "Free User";
}

function buildItems(role: "ADMIN" | "USER" | "RESELLER"): NavItem[] {
  const base = role === "ADMIN" ? "/admin" : role === "RESELLER" ? "/reseller" : "/user";

  if (role === "ADMIN") {
    return [
      { to: "/admin/dashboard", label: "Dashboard", icon: <DashboardOutlinedIcon /> },
      { to: "/admin/api-management", label: "API Management", icon: <StorageOutlinedIcon /> },
      { to: "/admin/user-management", label: "User Management", icon: <PeopleAltOutlinedIcon /> },
      { to: "/admin/transactions", label: "Transactions", icon: <ReceiptOutlinedIcon /> },
      { to: "/admin/security", label: "Security", icon: <SecurityOutlinedIcon /> },
      { to: "/admin/profile", label: "Profile", icon: <PersonOutlinedIcon /> },
      { to: "/admin/emails", label: "Emails", icon: <EmailOutlinedIcon /> },
    ];
  }

  return [
    { to: `${base}/dashboard`, label: "Dashboard", icon: <DashboardOutlinedIcon /> },
    { to: `${base}/cnic-intelligence`, label: "CNIC Lookup", icon: <ContactsOutlinedIcon /> },
    { to: `${base}/mobile-intelligence`, label: "Mobile Lookup", icon: <SearchOutlinedIcon /> },
    { to: `${base}/family-tree`, label: "Mix Family Tree", icon: <HubOutlinedIcon /> },
    {
      label: "Vehicle Records",
      icon: <DirectionsCarFilledOutlinedIcon />,
      children: [
        { to: `${base}/vehicle/punjab`, label: "Punjab Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/islamabad`, label: "Islamabad Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/sindh`, label: "Sindh Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/balochistan`, label: "Balochistan Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/kpk`, label: "KPK Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/kashmir`, label: "Kashmir Excise", icon: <DirectionsCarFilledOutlinedIcon /> },
        { to: `${base}/vehicle/stolen`, label: "Stolen Vehicle Record", icon: <DirectionsCarFilledOutlinedIcon /> },
      ],
    },
    {
      label: "Settings",
      icon: <StorageOutlinedIcon />,
      children: [
        { to: `${base}/profile`, label: "Profile", icon: <PersonOutlinedIcon /> },
        { to: `${base}/emails`, label: "Contact Admin", icon: <EmailOutlinedIcon /> },
        { to: `${base}/settings/searches`, label: "My Searches", icon: <SearchOutlinedIcon /> },
        { to: `${base}/settings/transactions`, label: "Transactions", icon: <ReceiptOutlinedIcon /> },
        { to: `${base}/settings/change-password`, label: "Reset Password", icon: <VpnKeyOutlinedIcon /> },
      ],
    },
    ...(role === "RESELLER"
      ? [{ to: "/reseller/users", label: "Manage Team", icon: <PeopleAltOutlinedIcon /> }]
      : []),
  ];
}

function isActive(pathname: string, to?: string) {
  if (!to) return false;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function hasActiveChild(pathname: string, item: NavItem) {
  return Boolean(item.children?.some((child) => isActive(pathname, child.to)));
}

function NavLinkItem({
  item,
  collapsed,
  active,
  ui,
  nested = false,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  ui: DashboardUi;
  nested?: boolean;
}) {
  if (!item.to) return null;

  return (
    <Box
      component={Link}
      to={item.to}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        minHeight: nested ? 40 : 46,
        justifyContent: collapsed ? "center" : "flex-start",
        pl: collapsed ? 0 : nested ? 4.25 : 1.5,
        pr: collapsed ? 0 : 1.5,
        py: 1,
        width: collapsed ? 56 : "100%",
        mx: collapsed ? "auto" : 0,
        borderRadius: collapsed ? "18px" : "14px",
        textDecoration: "none",
        color: active ? ui.text.primary : ui.text.muted,
        backgroundColor: active ? ui.nav.itemActiveBg : ui.nav.itemBg,
        border: active ? `1px solid ${ui.nav.itemActiveBorder}` : "1px solid transparent",
        boxShadow: active ? ui.nav.itemActiveShadow : "none",
        transition: "all 180ms ease",
        "&:hover": {
          color: ui.text.primary,
          backgroundColor: active ? ui.nav.itemActiveBg : ui.nav.itemHover,
        },
      }}
    >
      <Box
        sx={{
          width: 20,
          height: 20,
          display: "grid",
          placeItems: "center",
          color: active ? ui.text.accent : ui.text.muted,
          flexShrink: 0,
        }}
      >
        {item.icon}
      </Box>
      {!collapsed ? (
        <Typography sx={{ fontSize: nested ? "0.89rem" : "0.95rem", fontWeight: active ? 700 : 500, lineHeight: 1.1 }}>
          {item.label}
        </Typography>
      ) : null}
    </Box>
  );
}

function NavExpandableItem({
  item,
  collapsed,
  pathname,
  ui,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  ui: DashboardUi;
}) {
  const active = hasActiveChild(pathname, item);
  const [open, setOpen] = useState(active);

  return (
    <Box>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minHeight: 46,
          justifyContent: collapsed ? "center" : "flex-start",
          px: collapsed ? 0 : 1.5,
          py: 1,
          width: collapsed ? 56 : "100%",
          mx: collapsed ? "auto" : 0,
          borderRadius: collapsed ? "18px" : "14px",
          cursor: "pointer",
          color: active ? ui.text.primary : ui.text.muted,
          backgroundColor: active ? ui.nav.itemActiveBg : ui.nav.itemBg,
          border: active ? `1px solid ${ui.nav.itemActiveBorder}` : "1px solid transparent",
          boxShadow: active ? ui.nav.itemActiveShadow : "none",
          "&:hover": {
            color: ui.text.primary,
            backgroundColor: active ? ui.nav.itemActiveBg : ui.nav.itemHover,
          },
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 20,
            display: "grid",
            placeItems: "center",
            color: active ? ui.text.accent : ui.text.muted,
            flexShrink: 0,
          }}
        >
          {item.icon}
        </Box>
        {!collapsed ? (
          <>
            <Typography sx={{ flex: 1, fontSize: "0.95rem", fontWeight: active ? 700 : 500, lineHeight: 1.1 }}>
              {item.label}
            </Typography>
            {open ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
          </>
        ) : null}
      </Box>

      {!collapsed ? (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <Box sx={{ mt: 0.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
            {item.children?.map((child) => (
              <NavLinkItem
                key={(child.to ?? child.label) + child.label}
                item={child}
                collapsed={collapsed}
                active={isActive(pathname, child.to)}
                ui={ui}
                nested
              />
            ))}
          </Box>
        </Collapse>
      ) : null}
    </Box>
  );
}

export default function SidebarNav({ collapsed, mobile = false, onClose }: SidebarNavProps) {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const location = useLocation();
  const { user } = useAuth();
  const role = user?.role ?? "USER";
  const items = buildItems(role);
  const railWidth = mobile ? 0 : 84;
  const expandedWidth = mobile ? 224 : 248;
  const sidebarWidth = collapsed ? railWidth : expandedWidth;
  const showProfileBlock = !collapsed;
  const profileImage = theme.palette.mode === "dark" ? darkSidebarProfile : sidebarProfile;

  return (
    <Box
      sx={{
        width: sidebarWidth,
        flexShrink: 0,
        minHeight: "100vh",
        borderRight: `1px solid ${ui.shell.sidebarBorder}`,
        background: ui.shell.sidebarBg,
        color: ui.text.primary,
        transition: "width 220ms ease",
        overflow: "hidden",
        boxShadow: ui.shell.sidebarShadow,
        ...(mobile
          ? {
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              zIndex: theme.zIndex.drawer + 1,
              width: collapsed ? 0 : expandedWidth,
            }
          : null),
      }}
    >
      <Box sx={{ height: "100%", px: collapsed ? 1 : 1.5, py: mobile ? 1.25 : 2 }}>
        <Stack
          direction={mobile && !collapsed ? "row" : "column"}
          alignItems="center"
          justifyContent={mobile && !collapsed ? "space-between" : "center"}
          sx={{ px: mobile && !collapsed ? 0.5 : 0, pb: showProfileBlock ? (mobile ? 0.5 : 1.25) : 0.5, minHeight: mobile ? 28 : 36 }}
        >
          {mobile && !collapsed ? (
            <Box
              component="button"
              onClick={onClose}
              sx={{
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                borderRadius: "12px",
                border: `1px solid ${ui.surface.borderStrong}`,
                background: ui.surface.card,
                color: ui.text.primary,
                cursor: "pointer",
              }}
            >
              <CloseRoundedIcon fontSize="small" />
            </Box>
          ) : <Box />}
        </Stack>

        {showProfileBlock ? (
          <Stack
            alignItems="center"
            spacing={0.85}
            sx={{
              px: mobile ? 1 : 1.5,
              pt: mobile ? 0.25 : 2,
              pb: mobile ? 1.25 : 2.5,
              mb: mobile ? 0.75 : 1.25,
              textAlign: "center",
            }}
          >
            <Avatar
              src={profileImage}
              sx={{
                width: mobile ? 78 : role === "USER" ? 116 : 132,
                height: mobile ? 78 : role === "USER" ? 116 : 132,
                bgcolor: "transparent",
                color: "#f8fafc",
                border: "none",
                boxShadow: theme.palette.mode === "dark" ? "0 26px 60px rgba(2, 6, 23, 0.5)" : "0 24px 50px rgba(15, 23, 42, 0.12)",
                "& .MuiAvatar-img": {
                  objectFit: "contain",
                  objectPosition: "center",
                  imageRendering: "auto",
                },
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: mobile ? "1.15rem" : role === "USER" ? "1.4rem" : "1.95rem",
                  fontWeight: 800,
                  color: ui.text.primary,
                  lineHeight: 1.08,
                  wordBreak: "break-word",
                }}
              >
                {user?.name ?? "User"}
              </Typography>
              <Typography
                sx={{
                  fontSize: mobile ? "0.78rem" : "0.84rem",
                  fontWeight: 600,
                  color: ui.text.accentSoft,
                  textTransform: "capitalize",
                }}
              >
                {getUserSubtitle(user) ?? ROLE_TITLES[role]}
              </Typography>
            </Box>
          </Stack>
        ) : null}

        <Box sx={{ display: "flex", flexDirection: "column", gap: mobile ? 0.35 : 0.6 }}>
          {items.map((item) =>
            item.children ? (
              <NavExpandableItem key={item.label} item={item} collapsed={collapsed} pathname={location.pathname} ui={ui} />
            ) : (
              <NavLinkItem
                key={(item.to ?? item.label) + item.label}
                item={item}
                collapsed={collapsed}
                active={isActive(location.pathname, item.to)}
                ui={ui}
              />
            ),
          )}
        </Box>
      </Box>
    </Box>
  );
}

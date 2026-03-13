import TelegramIcon from "@mui/icons-material/Telegram";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Divider,
  InputAdornment,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import React from "react";
import { api } from "../../app/api";
import { useAuth } from "../../app/auth/useAuth";
import { useNavigate } from "react-router-dom";
import { useDashboardTheme } from "../theme";
import { getDashboardUi } from "../uiTokens";

type TopbarProps = {
  title: string;
  onToggleSidebar: () => void;
};

export default function Topbar({ title, onToggleSidebar }: TopbarProps) {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const { mode, toggleMode } = useDashboardTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const telegramUrl = import.meta.env.VITE_TELEGRAM_URL || "https://t.me/elookup_support";
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [searchAnchorEl, setSearchAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchItems, setSearchItems] = React.useState<any[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const iconButtonSx = {
    width: { xs: 30, sm: 38 },
    height: { xs: 30, sm: 38 },
    border: `1px solid ${ui.surface.borderStrong}`,
    backgroundColor: theme.palette.mode === "dark" ? ui.surface.card : "#ffffff",
    color: ui.text.primary,
    boxShadow: theme.palette.mode === "dark" ? "0 12px 28px rgba(2, 6, 23, 0.32)" : "0 10px 20px rgba(15, 23, 42, 0.08)",
    "&:hover": {
      backgroundColor: theme.palette.mode === "dark" ? ui.surface.hover : "#f8fafc",
    },
  };
  const sidebarButtonSx = {
    width: { xs: 36, sm: 42 },
    height: { xs: 36, sm: 42 },
    minWidth: 0,
    borderRadius: "14px",
    border: `1px solid ${ui.surface.borderStrong}`,
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "#ffffff",
    color: ui.text.primary,
    boxShadow: theme.palette.mode === "dark" ? "0 10px 26px rgba(2, 6, 23, 0.28)" : "0 10px 20px rgba(15, 23, 42, 0.08)",
    "&:hover": {
      backgroundColor: theme.palette.mode === "dark" ? ui.surface.hover : "#f8fafc",
    },
  };

  async function loadNotifications() {
    try {
      const res = await api.get("/me/notifications?limit=8");
      setNotifications(res.data?.items ?? []);
      setUnreadCount(res.data?.unreadCount ?? 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }

  React.useEffect(() => {
    loadNotifications().catch(() => void 0);
    const interval = window.setInterval(() => {
      loadNotifications().catch(() => void 0);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  async function openNotifications(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
    try {
      const res = await api.get("/me/notifications?limit=8");
      const items = res.data?.items ?? [];
      const nextUnread = res.data?.unreadCount ?? 0;
      setNotifications(items);
      setUnreadCount(nextUnread);
      if (nextUnread > 0) {
        api.post("/me/notifications/read-all", {}).catch(() => void 0);
      }
      if (nextUnread > 0) {
        setNotifications(items.map((item: any) => ({ ...item, isRead: true })));
      }
      setUnreadCount(0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }

  async function loadDashboardSearch(query: string) {
    try {
      setSearchLoading(true);
      const res = await api.get("/me/dashboard-search", { params: { q: query, limit: 8 } });
      setSearchItems(res.data?.items ?? []);
    } catch {
      setSearchItems([]);
    } finally {
      setSearchLoading(false);
    }
  }

  React.useEffect(() => {
    if (!searchAnchorEl) return;
    const timer = window.setTimeout(() => {
      loadDashboardSearch(searchQuery).catch(() => void 0);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchAnchorEl]);

  function openSearch(event: React.MouseEvent<HTMLElement>) {
    setSearchAnchorEl(event.currentTarget);
    setSearchQuery("");
    loadDashboardSearch("").catch(() => void 0);
  }

  function handleSearchNavigate(path: string) {
    setSearchAnchorEl(null);
    setSearchQuery("");
    navigate(path);
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backdropFilter: "blur(18px)",
        backgroundColor: ui.shell.topbarBg,
        borderBottom: `1px solid ${theme.palette.divider}`,
        color: ui.text.primary,
      }}
    >
      <Toolbar sx={{ gap: { xs: 0.55, sm: 1.25 }, px: { xs: 0.9, sm: 2 }, minHeight: { xs: 64, sm: 78 } }}>
        <IconButton
          onClick={onToggleSidebar}
          color="inherit"
          aria-label="Toggle sidebar"
          sx={sidebarButtonSx}
        >
          <MenuRoundedIcon fontSize="small" />
        </IconButton>

        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h5"
            title={title}
            sx={{
              fontFamily: '"Raleway", "Plus Jakarta Sans", sans-serif',
              fontSize: { xs: "1.95rem", sm: "2.4rem" },
              fontWeight: 800,
              letterSpacing: "-0.05em",
              color: ui.text.primary,
              whiteSpace: "nowrap",
            }}
          >
            Elookup
          </Typography>
        </Box>

        <Chip
          icon={<SearchOutlinedIcon />}
          label="Search"
          onClick={openSearch}
          sx={{
            display: { xs: "none", md: "inline-flex" },
            borderRadius: 999,
            cursor: "pointer",
            backgroundColor: theme.palette.mode === "dark" ? ui.surface.cardStrong : "#ffffff",
            color: ui.text.primary,
            border: `1px solid ${ui.surface.borderStrong}`,
            "& .MuiChip-icon": {
              color: ui.text.secondary,
            },
          }}
        />

        <IconButton color="inherit" onClick={openSearch} sx={{ ...iconButtonSx, display: { xs: "inline-flex", md: "none" } }}>
          <SearchOutlinedIcon />
        </IconButton>

        <IconButton color="inherit" onClick={toggleMode} sx={iconButtonSx}>
          {mode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
        </IconButton>

        <IconButton
          component="a"
          href={telegramUrl}
          target="_blank"
          rel="noreferrer"
          color="inherit"
          sx={iconButtonSx}
        >
          <TelegramIcon />
        </IconButton>

        <IconButton color="inherit" onClick={openNotifications} sx={iconButtonSx}>
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsOutlinedIcon />
          </Badge>
        </IconButton>

        <Menu
          anchorEl={searchAnchorEl}
          open={Boolean(searchAnchorEl)}
          onClose={() => setSearchAnchorEl(null)}
          PaperProps={{
            sx: {
              width: 380,
              maxWidth: "calc(100vw - 24px)",
              mt: 1,
              borderRadius: 3,
              color: ui.text.primary,
              backgroundColor: ui.surface.overlay,
              border: `1px solid ${ui.surface.borderStrong}`,
              boxShadow: theme.palette.mode === "dark" ? "0 20px 60px rgba(2, 6, 23, 0.5)" : "0 20px 40px rgba(15, 23, 42, 0.12)",
            },
          }}
        >
          <Box sx={{ p: 2 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search dashboard items"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Divider />
          {searchItems.length ? (
            searchItems.map((item) => (
              <MenuItem key={item.to} onClick={() => handleSearchNavigate(item.to)} sx={{ py: 1.5, whiteSpace: "normal" }}>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={800}>{item.label}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary">{item.description}</Typography>}
                />
              </MenuItem>
            ))
          ) : (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {searchLoading ? "Searching..." : "No dashboard items found."}
              </Typography>
            </Box>
          )}
        </Menu>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            sx: {
              width: 360,
              maxWidth: "calc(100vw - 24px)",
              mt: 1,
              borderRadius: 3,
              color: ui.text.primary,
              backgroundColor: ui.surface.overlay,
              border: `1px solid ${ui.surface.borderStrong}`,
              boxShadow: theme.palette.mode === "dark" ? "0 20px 60px rgba(2, 6, 23, 0.5)" : "0 20px 40px rgba(15, 23, 42, 0.12)",
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={800}>
              Notifications
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Latest alerts and admin messages
            </Typography>
          </Box>
          <Divider />
          {notifications.length ? (
            notifications.map((item) => (
              <MenuItem
                key={item.id}
                sx={{
                  alignItems: "flex-start",
                  py: 1.5,
                  whiteSpace: "normal",
                  backgroundColor: item.isRead ? "transparent" : ui.surface.hover,
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={800} color={ui.text.primary}>
                      {item.title}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {item.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(item.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                  }
                />
              </MenuItem>
            ))
          ) : (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No notifications yet.
              </Typography>
            </Box>
          )}
        </Menu>

        <IconButton color="inherit" onClick={logout} sx={iconButtonSx}>
          <LogoutOutlinedIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}

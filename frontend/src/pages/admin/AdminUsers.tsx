import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";
import { type AppRole, getRoleLabel } from "../../utils/roleLabels";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED" | "INACTIVE";
  credits: number;
  expireAt: string | null;
  resellerId?: string | null;
  billingType?: string;
  revenueExcluded?: boolean;
  monthlyPackageCoins?: number;
};

type RenewPackageCode = "MONTHLY_30" | "DAYS_15" | "WEEKLY_7" | "DEMO_1";

const RENEW_PACKAGE_OPTIONS: Array<{ code: RenewPackageCode; label: string; days: number; coins: number }> = [
  { code: "MONTHLY_30", label: "30 Days Package (1 Month)", days: 30, coins: 300 },
  { code: "DAYS_15", label: "15 Days Package", days: 15, coins: 150 },
  { code: "WEEKLY_7", label: "7 Days Package (1 Week)", days: 7, coins: 80 },
  { code: "DEMO_1", label: "Demo 1 Day Package (24 Hours)", days: 1, coins: 10 },
];

const CREATE_PACKAGE_OPTIONS: Array<{ code: RenewPackageCode; label: string; days: number; coins: number; billingType: "PAID" | "DEMO" }> = [
  { code: "MONTHLY_30", label: "Monthly", days: 30, coins: 300, billingType: "PAID" },
  { code: "DAYS_15", label: "15 Days", days: 15, coins: 150, billingType: "PAID" },
  { code: "WEEKLY_7", label: "Weekly", days: 7, coins: 80, billingType: "PAID" },
  { code: "DEMO_1", label: "Demo", days: 1, coins: 10, billingType: "DEMO" },
];

function statusColor(status: string): "success" | "warning" | "error" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "warning";
  if (status === "BLACKLISTED") return "error";
  return "default";
}

export default function AdminUsers() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const ui = getDashboardUi(theme.palette.mode);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [serviceAccessUser, setServiceAccessUser] = useState<UserRow | null>(null);
  const [serviceAccess, setServiceAccess] = useState<Array<{ id: string; name: string; status: boolean; allowed: boolean }>>([]);
  const [renewPackageCode, setRenewPackageCode] = useState<RenewPackageCode>("MONTHLY_30");

  const [createForm, setCreateForm] = useState<{
    email: string;
    name: string;
    username: string;
    password: string;
    packageCode: RenewPackageCode;
  }>({
    email: "",
    name: "",
    username: "",
    password: "0786#0786",
    packageCode: "MONTHLY_30",
  });
  const [messageForm, setMessageForm] = useState<{
    targetType: "ALL_USERS" | "ROLE" | "USER";
    role: AppRole;
    category: "UPDATE" | "BONUS" | "MESSAGE";
    title: string;
    message: string;
    userId: string;
  }>({
    targetType: "ALL_USERS",
    role: "USER",
    category: "UPDATE",
    title: "",
    message: "",
    userId: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/users-full");
      setRows(res.data?.items ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const roleOptions: AppRole[] = ["USER", "RESELLER", "ADMIN"];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((user) =>
      [user.email, user.name, user.role, getRoleLabel(user.role), user.status, user.billingType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, query]);
  const headerActionButtonSx = { minWidth: { xs: "100%", sm: 148 }, whiteSpace: "nowrap" } as const;
  const userActionStackSx = {
    width: "100%",
    justifyContent: { xs: "flex-start", md: "flex-end" },
  } as const;
  const userActionButtonSx = {
    flex: { xs: "1 1 calc(50% - 6px)", sm: "0 1 auto" },
    minWidth: { xs: "calc(50% - 6px)", sm: 118 },
    borderRadius: "999px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  } as const;

  async function createUser() {
    const selectedPackage = CREATE_PACKAGE_OPTIONS.find((item) => item.code === createForm.packageCode);
    if (!selectedPackage) throw new Error("Please select a package.");

    const expireAt = new Date(Date.now() + selectedPackage.days * 24 * 60 * 60 * 1000).toISOString();

    await api.post("/admin/users-full", {
      email: createForm.email.trim(),
      name: createForm.name.trim() || createForm.username.trim(),
      username: createForm.username.trim(),
      password: createForm.password,
      role: "USER",
      billingType: selectedPackage.billingType,
      credits: selectedPackage.coins,
      monthlyPackageCoins: selectedPackage.coins,
      expireAt,
    });
  }

  async function handleCreateUser() {
    try {
      if (!createForm.email.trim() || !createForm.name.trim() || !createForm.username.trim() || !createForm.password.trim()) {
        setError("Email, Name, Username and Password are required.");
        return;
      }
      await createUser();
      setCreateOpen(false);
      setCreateForm({
        email: "",
        name: "",
        username: "",
        password: "0786#0786",
        packageCode: "MONTHLY_30",
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to create user.");
    }
  }

  async function resetDevice(user: UserRow) {
    if (!window.confirm(`Reset bound device for ${user.email}?`)) return;
    try {
      await api.post(`/admin/users/${user.id}/reset-device`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to reset device.");
    }
  }

  async function renewPackage() {
    if (!selected) return;
    const selectedPackage = RENEW_PACKAGE_OPTIONS.find((item) => item.code === renewPackageCode);
    if (!selectedPackage) return;
    if (!window.confirm(`Renew package for ${selected.email} with ${selectedPackage.label}?`)) return;
    try {
      await api.post(`/admin/users-full/${selected.id}/renew-package`, { packageCode: renewPackageCode });
      setRenewOpen(false);
      setRenewPackageCode("MONTHLY_30");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to renew package.");
    }
  }

  async function deleteUser(user: UserRow) {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    try {
      await api.delete(`/admin/users-full/${user.id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to delete user.");
    }
  }

  async function sendMessage() {
    if (!window.confirm("Send this message now?")) return;
    try {
      await api.post("/admin/notifications/send", {
        targetType: messageForm.targetType,
        role: messageForm.targetType === "ROLE" ? messageForm.role : undefined,
        userId: messageForm.targetType === "USER" ? messageForm.userId : undefined,
        category: messageForm.category,
        title: messageForm.title,
        message: messageForm.message,
      });
      setMessageOpen(false);
      setMessageForm({
        targetType: "ALL_USERS",
        role: "USER",
        category: "UPDATE",
        title: "",
        message: "",
        userId: "",
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to send message.");
    }
  }

  function openUserMessage(user: UserRow) {
    setSelected(user);
    setMessageForm({
      targetType: "USER",
      role: "USER",
      category: "MESSAGE",
      title: "",
      message: "",
      userId: user.id,
    });
    setMessageOpen(true);
  }

  async function openServiceAccess(user: UserRow) {
    try {
      setSelected(user);
      setServiceAccessUser(user);
      const res = await api.get(`/admin/users/${user.id}/services`);
      setServiceAccess(res.data?.items ?? []);
      setServicesOpen(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load service access.");
    }
  }

  async function saveServiceAccess() {
    if (!serviceAccessUser) return;
    try {
      const deniedServiceIds = serviceAccess.filter((item) => !item.allowed).map((item) => item.id);
      await api.put(`/admin/users/${serviceAccessUser.id}/services`, { deniedServiceIds });
      setServicesOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to save service access.");
    }
  }

  async function toggleBlacklist(user: UserRow) {
    const isBlacklisted = user.status === "BLACKLISTED";
    const actionLabel = isBlacklisted ? "whitelist" : "blacklist";
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${user.email}?`)) return;
    try {
      if (isBlacklisted) {
        await api.post(`/admin/security/users/${user.id}/whitelist`, {});
      } else {
        await api.post(`/admin/security/users/${user.id}/blacklist`, {});
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || `Failed to ${actionLabel} user.`);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary }}>
            User Management
          </Typography>
          <Typography variant="body2" sx={{ color: ui.text.secondary }}>
            Manage users, package renewals, security controls, and direct dashboard messages.
          </Typography>
        </Box>
        <Stack spacing={1.25} sx={{ width: { xs: "100%", lg: "auto" }, alignItems: { xs: "stretch", lg: "flex-end" } }}>
          <TextField
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: "100%", minWidth: { sm: 280 }, maxWidth: { lg: 360 } }}
          />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            sx={{ width: "100%", justifyContent: { xs: "stretch", lg: "flex-end" } }}
          >
            <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading} sx={headerActionButtonSx}>
              Refresh
            </Button>
            <Button
              startIcon={<CampaignRoundedIcon />}
              variant="outlined"
              sx={headerActionButtonSx}
              onClick={() => {
                setSelected(null);
                setMessageForm({
                  targetType: "ALL_USERS",
                  role: "USER",
                  category: "UPDATE",
                  title: "",
                  message: "",
                  userId: "",
                });
                setMessageOpen(true);
              }}
            >
              Send Message
            </Button>
            <Button startIcon={<AddRoundedIcon />} variant="contained" onClick={() => setCreateOpen(true)} sx={headerActionButtonSx}>
              Create User
            </Button>
          </Stack>
        </Stack>
      </Stack>

      {error ? <Alert severity="warning" onClose={() => setError("")}>{error}</Alert> : null}

      <Card>
        <CardContent>
          {isMobile ? (
            <Stack spacing={1.5}>
              {filtered.map((user) => (
                <Card key={user.id} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack spacing={1.1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                        <Typography fontWeight={800} sx={{ wordBreak: "break-word" }}>{user.email}</Typography>
                        <Chip size="small" label={user.status} color={statusColor(user.status)} variant="outlined" />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{user.name}</Typography>
                      <Typography variant="body2" color="text.secondary">Role: {getRoleLabel(user.role)}</Typography>
                      <Typography variant="body2" color="text.secondary">Billing: {user.billingType ?? "PAID"} • Monthly: {user.monthlyPackageCoins ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">Coins: {user.credits ?? 0}</Typography>
                      <Typography variant="body2" color="text.secondary">Expiry: {user.expireAt ? new Date(user.expireAt).toLocaleDateString() : "-"}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={userActionStackSx}>
                        <Button size="small" variant="outlined" color="secondary" onClick={() => {
                          setSelected(user);
                          setRenewPackageCode("MONTHLY_30");
                          setRenewOpen(true);
                        }} sx={userActionButtonSx}>
                          Renew Package
                        </Button>
                        <Button size="small" variant="outlined" color="info" onClick={() => resetDevice(user)} sx={userActionButtonSx}>
                          Reset Device
                        </Button>
                        <Button size="small" variant="outlined" color="success" onClick={() => openUserMessage(user)} sx={userActionButtonSx}>
                          Send Message
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => openServiceAccess(user)} sx={userActionButtonSx}>
                          Services
                        </Button>
                        <Button
                          size="small"
                          color={user.status === "BLACKLISTED" ? "success" : "warning"}
                          variant="outlined"
                          onClick={() => toggleBlacklist(user)}
                          sx={userActionButtonSx}
                        >
                          {user.status === "BLACKLISTED" ? "Whitelist" : "Blacklist"}
                        </Button>
                        <Button size="small" color="error" variant="outlined" onClick={() => deleteUser(user)} sx={userActionButtonSx}>
                          Delete User
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!filtered.length ? <Typography color="text.secondary">No users found.</Typography> : null}
            </Stack>
          ) : (
            <Box sx={{ overflowX: "auto", color: ui.text.primary }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Billing</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Coins</TableCell>
                    <TableCell>Expiry</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography fontWeight={800}>{user.email}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {user.name} • {user.revenueExcluded ? "Revenue excluded" : "Revenue counted"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={getRoleLabel(user.role)} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700}>{user.billingType ?? "PAID"}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Monthly: {user.monthlyPackageCoins ?? 0}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={user.status} color={statusColor(user.status)} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{user.credits ?? 0}</TableCell>
                      <TableCell>{user.expireAt ? new Date(user.expireAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={userActionStackSx}>
                          <Button size="small" variant="outlined" color="secondary" onClick={() => {
                            setSelected(user);
                            setRenewPackageCode("MONTHLY_30");
                            setRenewOpen(true);
                          }} sx={userActionButtonSx}>
                            Renew Package
                          </Button>
                          <Button size="small" variant="outlined" color="info" onClick={() => resetDevice(user)} sx={userActionButtonSx}>
                            Reset Device
                          </Button>
                          <Button size="small" variant="outlined" color="success" onClick={() => openUserMessage(user)} sx={userActionButtonSx}>
                            Send Message
                          </Button>
                          <Button size="small" variant="outlined" onClick={() => openServiceAccess(user)} sx={userActionButtonSx}>
                            Services
                          </Button>
                          <Button
                            size="small"
                            color={user.status === "BLACKLISTED" ? "success" : "warning"}
                            variant="outlined"
                            onClick={() => toggleBlacklist(user)}
                            sx={userActionButtonSx}
                          >
                            {user.status === "BLACKLISTED" ? "Whitelist" : "Blacklist"}
                          </Button>
                          <Button size="small" color="error" variant="outlined" onClick={() => deleteUser(user)} sx={userActionButtonSx}>
                            Delete
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary">No users found.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Billing, security status, notifications, and service-level access are managed from this screen.
          </Typography>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth fullScreen={isMobile} maxWidth="md">
        <DialogTitle>Create User</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Email" fullWidth value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
              <TextField label="Name" fullWidth value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Username"
                fullWidth
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              />
              <TextField
                label="Password"
                type="password"
                fullWidth
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </Stack>
            <TextField
              select
              label="Select Package"
              fullWidth
              value={createForm.packageCode}
              onChange={(e) => setCreateForm({ ...createForm, packageCode: e.target.value as RenewPackageCode })}
            >
              {CREATE_PACKAGE_OPTIONS.map((item) => (
                <MenuItem key={`create-package-${item.code}`} value={item.code}>
                  {item.label} ({item.coins} coins)
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Default password is prefilled as 0786#0786. Selected package automatically sets validity and coins.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateUser}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renewOpen} onClose={() => setRenewOpen(false)} fullWidth fullScreen={isMobile} maxWidth="sm">
        <DialogTitle>Renew Package</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Select Package"
              value={renewPackageCode}
              onChange={(e) => setRenewPackageCode(e.target.value as RenewPackageCode)}
            >
              {RENEW_PACKAGE_OPTIONS.map((item) => (
                <MenuItem key={item.code} value={item.code}>
                  {item.label} - {item.coins} Coins
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              If renewed before expiry, remaining coins are carried forward and days are added.
              If renewed after expiry, old coins expire and only new package coins are applied.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenewOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={renewPackage}>
            Renew Package
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={messageOpen} onClose={() => setMessageOpen(false)} fullWidth fullScreen={isMobile} maxWidth="sm">
        <DialogTitle>Send Dashboard Message</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Target"
              value={messageForm.targetType}
              onChange={(e) =>
                setMessageForm({
                  ...messageForm,
                  targetType: e.target.value as "ALL_USERS" | "ROLE" | "USER",
                  userId: e.target.value === "USER" ? selected?.id ?? messageForm.userId : "",
                })
              }
            >
              <MenuItem value="ALL_USERS">All users + admins</MenuItem>
              <MenuItem value="ROLE">Specific role</MenuItem>
              <MenuItem value="USER">Single user</MenuItem>
            </TextField>
            {messageForm.targetType === "ROLE" ? (
              <TextField
                select
                label="Role"
                value={messageForm.role}
                onChange={(e) => setMessageForm({ ...messageForm, role: e.target.value as AppRole })}
              >
                {roleOptions.map((role) => (
                  <MenuItem key={`message-role-${role}`} value={role}>
                    {getRoleLabel(role)}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            {messageForm.targetType === "USER" ? (
              <TextField
                select
                label="User"
                value={messageForm.userId}
                onChange={(e) => setMessageForm({ ...messageForm, userId: e.target.value })}
              >
                {rows.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.email}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <TextField
              select
              label="Category"
              value={messageForm.category}
              onChange={(e) => setMessageForm({ ...messageForm, category: e.target.value as "UPDATE" | "BONUS" | "MESSAGE" })}
            >
              <MenuItem value="UPDATE">Update</MenuItem>
              <MenuItem value="BONUS">Bonus</MenuItem>
              <MenuItem value="MESSAGE">General message</MenuItem>
            </TextField>
            <TextField
              label="Title"
              value={messageForm.title}
              onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })}
            />
            <TextField
              label="Message"
              multiline
              minRows={4}
              value={messageForm.message}
              onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={sendMessage}
            disabled={!messageForm.title.trim() || !messageForm.message.trim() || (messageForm.targetType === "USER" && !messageForm.userId)}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={servicesOpen} onClose={() => setServicesOpen(false)} fullWidth fullScreen={isMobile} maxWidth="sm">
        <DialogTitle>Service Access {serviceAccessUser ? `• ${serviceAccessUser.email}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.25} sx={{ pt: 1 }}>
            {serviceAccess.map((item) => (
              <FormControlLabel
                key={item.id}
                control={
                  <Checkbox
                    checked={item.allowed}
                    onChange={(e) =>
                      setServiceAccess((prev) =>
                        prev.map((entry) => (entry.id === item.id ? { ...entry, allowed: e.target.checked } : entry))
                      )
                    }
                  />
                }
                label={`${item.name}${item.status ? "" : " (disabled service)"}`}
              />
            ))}
            {!serviceAccess.length ? (
              <Typography color="text.secondary">No services available.</Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setServicesOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveServiceAccess}>
            Save Access
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

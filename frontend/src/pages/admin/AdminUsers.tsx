import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import PhoneAndroidRoundedIcon from "@mui/icons-material/PhoneAndroidRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
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
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "RESELLER" | "USER";
  status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED" | "INACTIVE";
  credits: number;
  expireAt: string | null;
  resellerId?: string | null;
  billingType?: string;
  revenueExcluded?: boolean;
  monthlyPackageCoins?: number;
};

function statusColor(status: string): "success" | "warning" | "error" | "default" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "warning";
  if (status === "BLACKLISTED") return "error";
  return "default";
}

export default function AdminUsers() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [serviceAccessUser, setServiceAccessUser] = useState<UserRow | null>(null);
  const [serviceAccess, setServiceAccess] = useState<Array<{ id: string; name: string; status: boolean; allowed: boolean }>>([]);

  const [createForm, setCreateForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "USER",
    billingType: "PAID",
    initialCoins: 0,
    monthlyPackageCoins: 0,
    daysValid: 30,
  });
  const [coinsForm, setCoinsForm] = useState({ coins: 0, mode: "FREE" });
  const [expiryDays, setExpiryDays] = useState(30);
  const [messageForm, setMessageForm] = useState({
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((user) =>
      [user.email, user.name, user.role, user.status, user.billingType].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [rows, query]);

  async function createUser() {
    const expireAt =
      Number.isFinite(createForm.daysValid) && createForm.daysValid > 0
        ? new Date(Date.now() + createForm.daysValid * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

    await api.post("/admin/users-full", {
      email: createForm.email,
      name: createForm.name,
      password: createForm.password,
      role: createForm.role,
      billingType: createForm.billingType,
      credits: createForm.initialCoins,
      monthlyPackageCoins: createForm.monthlyPackageCoins,
      expireAt,
    });
  }

  async function handleCreateUser() {
    try {
      await createUser();
      setCreateOpen(false);
      setCreateForm({
        email: "",
        name: "",
        password: "",
        role: "USER",
        billingType: "PAID",
        initialCoins: 0,
        monthlyPackageCoins: 0,
        daysValid: 30,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to create user.");
    }
  }

  async function toggleStatus(user: UserRow) {
    try {
      await api.post(`/admin/users-full/${user.id}/status`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update user status.");
    }
  }

  async function resetDevice(user: UserRow) {
    try {
      await api.post(`/admin/users/${user.id}/reset-device`, {});
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to reset device.");
    }
  }

  async function addCoins() {
    if (!selected) return;
    try {
      await api.post(`/admin/users-full/${selected.id}/add-coins`, coinsForm);
      setCoinsOpen(false);
      setCoinsForm({ coins: 0, mode: "FREE" });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to add coins.");
    }
  }

  async function extendExpiry() {
    if (!selected) return;
    try {
      await api.post(`/admin/users-full/${selected.id}/extend-expiry`, { days: expiryDays });
      setExpiryOpen(false);
      setExpiryDays(30);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to extend expiry.");
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

  async function blacklistUser(user: UserRow) {
    if (!window.confirm(`Blacklist ${user.email}?`)) return;
    try {
      await api.post(`/admin/security/users/${user.id}/blacklist`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to blacklist user.");
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
            Manage accounts, balances, expiry, and direct dashboard messages.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
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
          />
          <Button startIcon={<RefreshRoundedIcon />} variant="outlined" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button
            startIcon={<CampaignRoundedIcon />}
            variant="outlined"
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
          <Button startIcon={<AddRoundedIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
            Create User
          </Button>
        </Stack>
      </Stack>

      {error ? <Alert severity="warning" onClose={() => setError("")}>{error}</Alert> : null}

      <Card>
        <CardContent>
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
                      <Chip size="small" label={user.role} variant="outlined" />
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
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                        <Tooltip title={user.status === "ACTIVE" ? "Suspend" : "Activate"}>
                          <IconButton color="warning" onClick={() => toggleStatus(user)}>
                            <AutorenewRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Add coins">
                          <IconButton
                            color="primary"
                            onClick={() => {
                              setSelected(user);
                              setCoinsOpen(true);
                            }}
                          >
                            <SavingsRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Extend expiry">
                          <IconButton
                            color="secondary"
                            onClick={() => {
                              setSelected(user);
                              setExpiryOpen(true);
                            }}
                          >
                            <AddRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset device">
                          <IconButton color="info" onClick={() => resetDevice(user)}>
                            <PhoneAndroidRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send message">
                          <IconButton color="success" onClick={() => openUserMessage(user)}>
                            <CampaignRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Button size="small" variant="outlined" onClick={() => openServiceAccess(user)}>
                          Services
                        </Button>
                        <Button size="small" color="warning" variant="outlined" onClick={() => blacklistUser(user)}>
                          Blacklist
                        </Button>
                        <Tooltip title="Delete user">
                          <IconButton color="error" onClick={() => deleteUser(user)}>
                            <DeleteRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Billing, security status, notifications, and service-level access are managed from this screen.
          </Typography>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Create User</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Email" fullWidth value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
              <TextField label="Name" fullWidth value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Password"
                type="password"
                fullWidth
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <TextField select label="Role" fullWidth value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                <MenuItem value="USER">USER</MenuItem>
                <MenuItem value="RESELLER">RESELLER</MenuItem>
                <MenuItem value="ADMIN">ADMIN</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                select
                label="Billing Type"
                fullWidth
                value={createForm.billingType}
                onChange={(e) => setCreateForm({ ...createForm, billingType: e.target.value })}
              >
                <MenuItem value="PAID">PAID</MenuItem>
                <MenuItem value="FREE">FREE</MenuItem>
                <MenuItem value="DEMO">DEMO</MenuItem>
              </TextField>
              <TextField
                label="Initial Coins"
                type="number"
                fullWidth
                value={createForm.initialCoins}
                onChange={(e) => setCreateForm({ ...createForm, initialCoins: Number(e.target.value) })}
              />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Monthly Package Coins"
                type="number"
                fullWidth
                value={createForm.monthlyPackageCoins}
                onChange={(e) => setCreateForm({ ...createForm, monthlyPackageCoins: Number(e.target.value) })}
              />
              <TextField
                label="Days Valid"
                type="number"
                fullWidth
                value={createForm.daysValid}
                onChange={(e) => setCreateForm({ ...createForm, daysValid: Number(e.target.value) })}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Demo users automatically receive 10 coins. Free and demo traffic is excluded from revenue.
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

      <Dialog open={coinsOpen} onClose={() => setCoinsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Coins</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Mode"
              value={coinsForm.mode}
              onChange={(e) => setCoinsForm({ ...coinsForm, mode: e.target.value })}
            >
              <MenuItem value="FREE">FREE (no revenue)</MenuItem>
              <MenuItem value="PAID">PAID (1 coin = 10 PKR)</MenuItem>
            </TextField>
            <TextField
              label="Coins"
              type="number"
              value={coinsForm.coins}
              onChange={(e) => setCoinsForm({ ...coinsForm, coins: Number(e.target.value) })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCoinsOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={addCoins}>
            Add Coins
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={expiryOpen} onClose={() => setExpiryOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Extend Expiry</DialogTitle>
        <DialogContent>
          <TextField
            sx={{ mt: 1 }}
            label="Days"
            type="number"
            fullWidth
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpiryOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={extendExpiry}>
            Extend
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={messageOpen} onClose={() => setMessageOpen(false)} fullWidth maxWidth="sm">
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
                  targetType: e.target.value,
                  userId: e.target.value === "USER" ? selected?.id ?? messageForm.userId : "",
                })
              }
            >
              <MenuItem value="ALL_USERS">All users + resellers</MenuItem>
              <MenuItem value="ROLE">Specific role</MenuItem>
              <MenuItem value="USER">Single user</MenuItem>
            </TextField>
            {messageForm.targetType === "ROLE" ? (
              <TextField
                select
                label="Role"
                value={messageForm.role}
                onChange={(e) => setMessageForm({ ...messageForm, role: e.target.value })}
              >
                <MenuItem value="USER">USER</MenuItem>
                <MenuItem value="RESELLER">RESELLER</MenuItem>
                <MenuItem value="ADMIN">ADMIN</MenuItem>
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
              onChange={(e) => setMessageForm({ ...messageForm, category: e.target.value })}
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

      <Dialog open={servicesOpen} onClose={() => setServicesOpen(false)} fullWidth maxWidth="sm">
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

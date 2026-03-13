import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../app/api";

type TabKey = "activity" | "adminActions" | "securityEvents" | "apiErrors";

export default function AdminActivity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("activity");
  const [activity, setActivity] = useState<any[]>([]);
  const [adminActions, setAdminActions] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [apiErrors, setApiErrors] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [activityRes, adminActionsRes, securityEventsRes, apiErrorsRes] = await Promise.all([
        api.get("/admin/activity-logs", { params: { limit: 50 } }),
        api.get("/admin/audit/admin-actions", { params: { limit: 50 } }),
        api.get("/admin/audit/security-events", { params: { limit: 50 } }),
        api.get("/admin/api-error-logs"),
      ]);
      setActivity(activityRes.data?.items ?? []);
      setAdminActions(adminActionsRes.data?.items ?? []);
      setSecurityEvents(securityEventsRes.data?.items ?? []);
      setApiErrors(apiErrorsRes.data?.items ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeRows = useMemo(() => {
    if (tab === "activity") return activity;
    if (tab === "adminActions") return adminActions;
    if (tab === "securityEvents") return securityEvents;
    return apiErrors;
  }, [activity, adminActions, apiErrors, securityEvents, tab]);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" mb={0.5}>
            Activity Logs
          </Typography>
          <Typography color="text.secondary">
            Unified activity, admin audit trail, security events, and API execution failures.
          </Typography>
        </Box>
        <Button startIcon={<RefreshRoundedIcon />} variant="contained" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <Button variant={tab === "activity" ? "contained" : "outlined"} onClick={() => setTab("activity")}>Unified Feed</Button>
        <Button variant={tab === "adminActions" ? "contained" : "outlined"} onClick={() => setTab("adminActions")}>Admin Actions</Button>
        <Button variant={tab === "securityEvents" ? "contained" : "outlined"} onClick={() => setTab("securityEvents")}>Security Events</Button>
        <Button variant={tab === "apiErrors" ? "contained" : "outlined"} onClick={() => setTab("apiErrors")}>API Errors</Button>
      </Stack>

      <Card>
        <CardContent>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Action / Code</TableCell>
                  <TableCell>Actor / Service</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeRows.map((item) => (
                  <TableRow key={`${tab}-${item.id ?? item.createdAt}`} hover>
                    <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={item.category ?? item.type ?? item.scope ?? "EVENT"}
                        color={item.suspicious ? "warning" : "primary"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{item.action ?? item.reason ?? item.code ?? "-"}</TableCell>
                    <TableCell>{item.actor?.email ?? item.user?.email ?? item.service ?? item.ip ?? "-"}</TableCell>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {JSON.stringify(item.meta ?? item.message ?? item.error ?? { ip: item.ip ?? null, success: item.success ?? null })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {!activeRows.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">No records found for this feed.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

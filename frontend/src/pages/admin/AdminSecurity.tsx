import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary" mb={1}>
          {label}
        </Typography>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default function AdminSecurity() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [authFailures, setAuthFailures] = useState<any[]>([]);
  const [ipAbuse, setIpAbuse] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, authFailuresRes, ipAbuseRes] = await Promise.all([
        api.get("/admin/security/summary"),
        api.get("/admin/security/auth-failures", { params: { limit: 50 } }),
        api.get("/admin/security/ip-abuse", { params: { limit: 50 } }),
      ]);
      setSummary(summaryRes.data ?? {});
      setAuthFailures(authFailuresRes.data?.items ?? []);
      setIpAbuse(ipAbuseRes.data?.items ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load security summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary }}>
            Security Center
          </Typography>
          <Typography variant="body2" sx={{ color: ui.text.secondary }}>
            Authentication failures, suspicious IPs, and account safety signals.
          </Typography>
        </Box>
        <Button startIcon={<RefreshRoundedIcon />} variant="contained" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <Grid container spacing={2.5} sx={{ width: "100%", m: 0 }}>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Active Users" value={summary?.activeUsers ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Suspended Users" value={summary?.suspendedUsers ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Blacklisted Users" value={summary?.blacklistedUsers ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Blocked IPs" value={summary?.blockedIps ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Auth Failures 24h" value={summary?.authFailures24h ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Device Resets 24h" value={summary?.deviceResets24h ?? 0} />
        </Grid>
        <Grid item xs={12} sm={6} xl={3}>
          <SummaryCard label="Suspicious Recent" value={summary?.suspiciousRecent ?? 0} />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ width: "100%", m: 0 }}>
        <Grid item xs={12} xl={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>Recent Auth Failures</Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Time</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Reason</TableCell>
                      <TableCell>IP</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {authFailures.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</TableCell>
                        <TableCell>{item.email ?? item.user?.email ?? "-"}</TableCell>
                        <TableCell>{item.reason ?? "-"}</TableCell>
                        <TableCell>{item.ip ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                    {!authFailures.length ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography color="text.secondary">No auth failures logged.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} xl={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>IP Abuse Watch</Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                        <TableCell>IP</TableCell>
                        <TableCell align="right">Failures</TableCell>
                        <TableCell align="right">Requests</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ipAbuse.map((item) => (
                        <TableRow key={item.ip} hover>
                          <TableCell>{item.ip}</TableCell>
                        <TableCell align="right">{item.failed ?? 0}</TableCell>
                        <TableCell align="right">{item.total ?? 0}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={item.blacklisted ? "BLACKLISTED" : item.tempBlocked ? "TEMP BLOCKED" : "OBSERVED"}
                            color={item.blacklisted ? "error" : item.tempBlocked ? "warning" : "default"}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!ipAbuse.length ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography color="text.secondary">No IP abuse signals detected.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Recent Login Events</Typography>
          <Box sx={{ overflowX: "auto", color: ui.text.primary }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(summary?.recentLogins ?? []).map((item: any) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</TableCell>
                    <TableCell>{item.user?.email ?? item.email ?? item.userId ?? "Unknown user"}</TableCell>
                    <TableCell>{item.reason ?? "AUTH_EVENT"}</TableCell>
                    <TableCell>{item.ip ?? "Unknown IP"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={item.success ? "SUCCESS" : "FAILED"}
                        color={item.success ? "success" : "error"}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!(summary?.recentLogins ?? []).length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">No recent login events available.</Typography>
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

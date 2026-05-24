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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

const PAGE_SIZE = 5;

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
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const ui = getDashboardUi(theme.palette.mode);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [authFailures, setAuthFailures] = useState<any[]>([]);
  const [authTotal, setAuthTotal] = useState(0);
  const [authPage, setAuthPage] = useState(1);
  const [ipAbuse, setIpAbuse] = useState<any[]>([]);
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [blockedPage, setBlockedPage] = useState(1);
  const [tempBlocked, setTempBlocked] = useState<Array<{ ip: string; ttlSeconds: number }>>([]);
  const [error, setError] = useState("");

  async function fetchBlockedIps() {
    try {
      const blockedRes = await api.get("/admin/security/blocked-ips", { params: { limit: PAGE_SIZE, page: blockedPage } });
      return {
        items: blockedRes.data?.items ?? [],
        total: Number(blockedRes.data?.total ?? 0),
        tempBlocked: blockedRes.data?.tempBlocked ?? [],
      };
    } catch (blockedError: any) {
      if (blockedError?.response?.status !== 404) throw blockedError;

      // Backward-compatible fallback for older backend builds.
      const fallbackRes = await api.get("/admin/security/ip-abuse", { params: { limit: 200 } });
      const fallbackItems = (fallbackRes.data?.items ?? [])
        .filter((item: any) => Boolean(item?.blacklisted))
        .map((item: any, index: number) => ({
          id: item.id ?? `abuse-${item.ip}-${index}`,
          ip: item.ip,
          reason: "Auto blocked (fallback record)",
        }));

      const start = (blockedPage - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      return {
        items: fallbackItems.slice(start, end),
        total: fallbackItems.length,
        tempBlocked: [],
      };
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, authFailuresRes, ipAbuseRes, blockedRes] = await Promise.all([
        api.get("/admin/security/summary"),
        api.get("/admin/security/auth-failures", { params: { limit: PAGE_SIZE, page: authPage } }),
        api.get("/admin/security/ip-abuse", { params: { limit: 50 } }),
        fetchBlockedIps(),
      ]);
      setSummary(summaryRes.data ?? {});
      setAuthFailures(authFailuresRes.data?.items ?? []);
      setAuthTotal(Number(authFailuresRes.data?.total ?? 0));
      setIpAbuse(ipAbuseRes.data?.items ?? []);
      setBlockedIps(blockedRes.items ?? []);
      setBlockedTotal(Number(blockedRes.total ?? 0));
      setTempBlocked(blockedRes.tempBlocked ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load security summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [authPage, blockedPage]);

  async function runIpAction(ip: string, action: "unblock" | "whitelist" | "clear-temp") {
    const title = action === "unblock" ? "unblock" : action === "whitelist" ? "whitelist" : "clear temporary block for";
    if (!window.confirm(`Are you sure you want to ${title} ${ip}?`)) return;

    try {
      if (action === "unblock") {
        await api.post(`/admin/security/ip/${encodeURIComponent(ip)}/unblock`, {});
      } else if (action === "whitelist") {
        await api.post(`/admin/security/ip/${encodeURIComponent(ip)}/whitelist`, { reason: "Whitelisted from Security Center" });
      } else {
        await api.post(`/admin/security/ip/${encodeURIComponent(ip)}/clear-temp`, {});
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to update IP status.");
    }
  }

  const authTotalPages = Math.max(1, Math.ceil(authTotal / PAGE_SIZE));
  const blockedTotalPages = Math.max(1, Math.ceil(blockedTotal / PAGE_SIZE));

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
              {isMobile ? (
                <Stack spacing={1.25}>
                  {authFailures.map((item) => (
                    <Card key={item.id} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</Typography>
                        <Typography fontWeight={800}>{item.email ?? item.user?.email ?? "-"}</Typography>
                        <Typography variant="body2" color="text.secondary">Reason: {item.reason ?? "-"}</Typography>
                        <Typography variant="body2" color="text.secondary">IP: {item.ip ?? "-"}</Typography>
                      </CardContent>
                    </Card>
                  ))}
                  {!authFailures.length ? <Typography color="text.secondary">No auth failures logged.</Typography> : null}
                </Stack>
              ) : (
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
              )}
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
                <Button size="small" variant="outlined" disabled={authPage <= 1 || loading} onClick={() => setAuthPage((prev) => Math.max(1, prev - 1))}>
                  Previous
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Page {authPage} of {authTotalPages}
                </Typography>
                <Button size="small" variant="outlined" disabled={authPage >= authTotalPages || loading} onClick={() => setAuthPage((prev) => prev + 1)}>
                  Next
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>IP Abuse Watch</Typography>
              {isMobile ? (
                <Stack spacing={1.25}>
                  {ipAbuse.map((item) => (
                    <Card key={item.ip} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Typography fontWeight={800}>{item.ip}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Failures: {item.failed ?? 0} • Requests: {item.total ?? 0}
                        </Typography>
                        <Chip
                          size="small"
                          label={item.blacklisted ? "BLACKLISTED" : item.tempBlocked ? "TEMP BLOCKED" : "OBSERVED"}
                          color={item.blacklisted ? "error" : item.tempBlocked ? "warning" : "default"}
                          variant="outlined"
                          sx={{ mt: 1 }}
                        />
                      </CardContent>
                    </Card>
                  ))}
                  {!ipAbuse.length ? <Typography color="text.secondary">No IP abuse signals detected.</Typography> : null}
                </Stack>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Automatically Blocked IP Records</Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>IP</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Reason / TTL</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {blockedIps.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.ip}</TableCell>
                    <TableCell>
                      <Chip size="small" color="error" variant="outlined" label="BLACKLISTED" />
                    </TableCell>
                    <TableCell>{item.reason || "Auto blocked"}</TableCell>
                    <TableCell align="right">
                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="flex-end" spacing={0.5}>
                        <Button size="small" variant="outlined" onClick={() => runIpAction(item.ip, "unblock")}>Unblock</Button>
                        <Button size="small" variant="outlined" color="success" onClick={() => runIpAction(item.ip, "whitelist")}>Whitelist</Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {tempBlocked.map((item) => (
                  <TableRow key={`temp-${item.ip}`} hover>
                    <TableCell>{item.ip}</TableCell>
                    <TableCell>
                      <Chip size="small" color="warning" variant="outlined" label="TEMP BLOCKED" />
                    </TableCell>
                    <TableCell>{`Auto expires in ${item.ttlSeconds}s`}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => runIpAction(item.ip, "clear-temp")}>Clear Temp</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!blockedIps.length && !tempBlocked.length ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography color="text.secondary">No blocked IP records found.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
            <Button size="small" variant="outlined" disabled={blockedPage <= 1 || loading} onClick={() => setBlockedPage((prev) => Math.max(1, prev - 1))}>
              Previous
            </Button>
            <Typography variant="caption" color="text.secondary">
              Page {blockedPage} of {blockedTotalPages}
            </Typography>
            <Button size="small" variant="outlined" disabled={blockedPage >= blockedTotalPages || loading} onClick={() => setBlockedPage((prev) => prev + 1)}>
              Next
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Recent Login Events</Typography>
          {isMobile ? (
            <Stack spacing={1.25}>
              {(summary?.recentLogins ?? []).map((item: any) => (
                <Card key={item.id} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Typography fontWeight={800}>{item.user?.email ?? item.email ?? item.userId ?? "Unknown user"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Date: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Reason: {item.reason ?? "AUTH_EVENT"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      IP: {item.ip ?? "Unknown IP"}
                    </Typography>
                    <Chip
                      size="small"
                      label={item.success ? "SUCCESS" : "FAILED"}
                      color={item.success ? "success" : "error"}
                      variant="outlined"
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
              ))}
              {!(summary?.recentLogins ?? []).length ? <Typography color="text.secondary">No recent login events available.</Typography> : null}
            </Stack>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

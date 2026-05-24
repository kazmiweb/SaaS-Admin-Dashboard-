import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { api } from "../../app/ApiService";
import { useAuth } from "../../app/auth/useAuth";
import { useNavigate } from "react-router-dom";
import ResultCards, { type ResultCardItem } from "../components/ResultCards";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { getDashboardUi } from "../uiTokens";

export default function AdminOverview() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const ui = getDashboardUi(theme.palette.mode);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [realtimeHealth, setRealtimeHealth] = useState<any>(null);
  const [throughput, setThroughput] = useState<any>(null);
  const [error, setError] = useState("");
  const displayName = user?.name ?? "Admin";

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");
        const [statsRes, securityRes, realtimeHealthRes, throughputRes] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/security/summary"),
          api.get("/admin/realtime/health"),
          api.get("/admin/realtime/search-throughput"),
        ]);
        setStats(statsRes.data?.stats ?? null);
        setSecurity(securityRes.data ?? null);
        setRealtimeHealth(realtimeHealthRes.data ?? null);
        setThroughput(throughputRes.data ?? null);
      } catch (loadError: any) {
        setError(loadError?.response?.data?.message || loadError?.message || "Failed to load admin overview.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        setError("");

        const params = { page: page + 1, limit: pageSize };
        const attemptUrls = [
          "/admin/user-logs",
          `${window.location.origin}/admin/user-logs`,
          `${window.location.origin}/api/admin/user-logs`,
        ];

        let logsRes: any | null = null;
        let lastError: any = null;

        for (const url of attemptUrls) {
          try {
            logsRes = await api.get(url, { params });
            break;
          } catch (error: any) {
            lastError = error;
            if (error?.response?.status === 404) {
              continue;
            }
            throw error;
          }
        }

        if (!logsRes) {
          throw lastError ?? new Error("Failed to load user logs.");
        }

        setLogs(logsRes.data?.items ?? []);
        setRowCount(logsRes.data?.total ?? 0);
      } catch (loadError: any) {
        setError(loadError?.response?.data?.message || loadError?.message || "Failed to load user logs.");
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, [page, pageSize]);

  const cards = useMemo<ResultCardItem[]>(
    () => [
      { label: "Revenue Today", value: stats?.revenueToday ?? 0, helper: "PKR from paid traffic" },
      { label: "Searches Today", value: stats?.searchesToday ?? 0, helper: "Live backend count" },
      { label: "Active APIs", value: stats?.activeApis ?? 0, helper: "Configured active sources" },
      { label: "Auth Failures 24h", value: security?.authFailures24h ?? 0, helper: "Security control center" },
      { label: "In-Flight Searches", value: throughput?.inflight?.total ?? 0, helper: "Realtime search load" },
    ],
    [security, stats, throughput]
  );

  const monthlyRevenue = Array.isArray(stats?.monthlyRevenue) ? stats.monthlyRevenue : [];
  const totalEarnings = monthlyRevenue.reduce((sum: number, item: any) => sum + Number(item?.value ?? 0), 0);

  const chartSeries = [
    {
      name: "Sales",
      data: monthlyRevenue.map((item: any) => Number(item?.value ?? 0)),
    },
  ];

  const chartOptions = {
    chart: {
      toolbar: { show: false },
      background: "transparent",
      zoom: { enabled: false },
    },
    theme: { mode: theme.palette.mode === "dark" ? "dark" : "light" },
    colors: ["#4f73c9"],
    xaxis: {
      categories: monthlyRevenue.map((item: any) => item?.label ?? ""),
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { show: false },
    },
    grid: {
      borderColor: theme.palette.mode === "dark" ? "rgba(148,163,184,0.24)" : "rgba(148,163,184,0.3)",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    markers: { size: 3, strokeWidth: 0, hover: { size: 5 } },
    stroke: { curve: "smooth" as const, width: 3 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: (value: number) => `Rs${Math.round(value).toLocaleString("en-US")}`,
      },
    },
  };

  const columns: GridColDef[] = [
    {
      field: "userName",
      headerName: "User Name",
      minWidth: 170,
      flex: 1.1,
      valueGetter: (params) => params.row.userName ?? params.row.user?.name ?? params.row.user?.email ?? "-",
    },
    {
      field: "createdAt",
      headerName: "Time & Date",
      minWidth: 180,
      flex: 1.25,
      valueGetter: (params) => (params.row.createdAt ? new Date(params.row.createdAt).toLocaleString() : "-"),
    },
    {
      field: "query",
      headerName: "Query",
      minWidth: 210,
      flex: 1.65,
      valueGetter: (params) => params.row.query ?? "-",
    },
    {
      field: "searchedService",
      headerName: "Service",
      minWidth: 160,
      flex: 1.1,
      valueGetter: (params) => params.row.searchedService ?? params.row.service ?? "-",
    },
    {
      field: "detectedType",
      headerName: "Detected",
      minWidth: 120,
      flex: 0.9,
      valueGetter: (params) => params.row.detectedType ?? "-",
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 110,
      flex: 0.8,
      valueGetter: (params) => params.row.status ?? "-",
    },
    {
      field: "ip",
      headerName: "IP",
      minWidth: 140,
      flex: 1,
      valueGetter: (params) => params.row.ip ?? "-",
    },
    {
      field: "cost",
      headerName: "Cost",
      minWidth: 90,
      flex: 0.8,
      valueGetter: (params) => params.row.cost ?? "-",
    },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        {isMobile ? (
          <Stack spacing={0.25}>
            <Typography variant="h4" sx={{ color: ui.text.primary, fontSize: "2.05rem", lineHeight: 1.05 }}>
              Welcome Back
            </Typography>
            <Typography variant="h4" sx={{ color: ui.text.primary, fontSize: "2.15rem", lineHeight: 1.05, fontWeight: 800, wordBreak: "break-word" }}>
              {displayName}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary, fontSize: "3rem", lineHeight: 1.05, wordBreak: "break-word" }}>
            Welcome Back! {displayName}
          </Typography>
        )}
      </Box>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <ResultCards items={cards} />

      <Grid container spacing={3} sx={{ width: "100%", m: 0 }}>
        <Grid item xs={12} xl={8}>
            <Card>
            <CardContent>
              <Typography variant="h6" mb={2} textAlign="center">
                Total Earnings: Rs{Math.round(totalEarnings).toLocaleString("en-US")}
              </Typography>
              <Chart options={chartOptions} series={chartSeries} type="line" height={320} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} xl={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>Operational Snapshot</Typography>
              <Stack spacing={1.5}>
                <Chip label={`Active users: ${stats?.activeUsers ?? 0}`} color="primary" variant="outlined" />
                <Chip label={`Searches today: ${stats?.searchesToday ?? 0}`} color="secondary" variant="outlined" />
                <Chip label={`Auth failures 24h: ${security?.authFailures24h ?? 0}`} color="warning" variant="outlined" />
                <Chip
                  label={`Blocked IPs: ${security?.blockedIps ?? 0}`}
                  color="error"
                  variant="outlined"
                  clickable
                  onClick={() => navigate("/admin/security?focus=blocked-ips")}
                />
                <Chip label={`Device resets 24h: ${security?.deviceResets24h ?? 0}`} color="success" variant="outlined" />
                <Chip
                  label={`Healthy APIs: ${realtimeHealth?.totals?.healthy ?? 0}`}
                  color="success"
                  variant="outlined"
                  clickable
                  onClick={() => navigate("/admin/api-management?health=HEALTHY")}
                />
                <Chip
                  label={`Unhealthy APIs: ${realtimeHealth?.totals?.unhealthy ?? 0}`}
                  color="warning"
                  variant="outlined"
                  clickable
                  onClick={() => navigate("/admin/api-management?health=UNHEALTHY")}
                />
                <Chip label={`Searches / 5m: ${throughput?.totals?.fiveMinutes ?? 0}`} color="primary" variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ backgroundColor: ui.surface.card, borderRadius: 2 }}>
          <Typography variant="h6" mb={2}>All Users Logs</Typography>
          {isMobile ? (
            <Stack spacing={1.5}>
              {logs.map((item) => (
                <Card key={item.id} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                        <Typography fontWeight={800}>{item.userName ?? item.user?.name ?? item.user?.email ?? "Unknown user"}</Typography>
                        <Chip
                          label={item.status ?? "-"}
                          size="small"
                          color={item.status === "success" ? "success" : item.status === "error" ? "error" : "default"}
                          variant="outlined"
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Service: {item.searchedService ?? item.service ?? "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        IP: {item.ip ?? "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Date & Time: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                      </Typography>
                      <Divider sx={{ borderColor: ui.surface.border }} />
                      <Typography variant="body2" color="text.secondary">
                        Query: {item.query ?? "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cost: {item.cost ?? 0}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!logs.length && !loading ? <Typography color="text.secondary">No user logs found.</Typography> : null}
              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                <Button size="small" variant="outlined" disabled={page === 0 || loading} onClick={() => setPage((prev) => Math.max(0, prev - 1))}>
                  Previous
                </Button>
                <Typography variant="caption" sx={{ color: ui.text.secondary }}>
                  Page {page + 1} of {Math.max(1, Math.ceil(rowCount / pageSize))}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={loading || (page + 1) * pageSize >= rowCount}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Box sx={{ height: 460, backgroundColor: ui.surface.card, borderRadius: 2 }}>
              <DataGrid
                rows={logs.map((item) => ({ ...item, id: item.id }))}
                columns={columns}
                loading={loading}
                disableRowSelectionOnClick
                paginationMode="server"
                rowCount={rowCount}
                paginationModel={{ page, pageSize }}
                rowHeight={44}
                onPaginationModelChange={(model) => {
                  setPage(model.page);
                  setPageSize(model.pageSize);
                }}
                pageSizeOptions={[5, 10, 20]}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

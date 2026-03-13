import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { api } from "../../app/ApiService";
import { useAuth } from "../../app/auth/useAuth";
import ResultCards, { type ResultCardItem } from "../components/ResultCards";
import { Alert, Box, Card, CardContent, Chip, Grid, Stack, Typography, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { getDashboardUi } from "../uiTokens";

export default function AdminOverview() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [realtimeHealth, setRealtimeHealth] = useState<any>(null);
  const [throughput, setThroughput] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        const [statsRes, securityRes, activityRes, realtimeHealthRes, throughputRes] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/security/summary"),
          api.get("/admin/activity-logs?limit=8"),
          api.get("/admin/realtime/health"),
          api.get("/admin/realtime/search-throughput"),
        ]);
        setStats(statsRes.data?.stats ?? null);
        setSecurity(securityRes.data ?? null);
        setActivity(activityRes.data?.items ?? []);
        setRealtimeHealth(realtimeHealthRes.data ?? null);
        setThroughput(throughputRes.data ?? null);
      } catch (loadError: any) {
        setError(loadError?.response?.data?.message || loadError?.message || "Failed to load admin overview.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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

  const chartSeries = [
    {
      name: "Monthly Revenue",
      data: (stats?.monthlyRevenue ?? []).map((item: any) => Number(item.value ?? 0)),
    },
  ];

  const chartOptions = {
    chart: { toolbar: { show: false }, background: "transparent" },
    theme: { mode: theme.palette.mode },
    xaxis: {
      categories: (stats?.monthlyRevenue ?? []).map((item: any) => item.label),
    },
    stroke: { curve: "smooth" as const, width: 3 },
    dataLabels: { enabled: false },
  };

  const columns: GridColDef[] = [
    { field: "createdAt", headerName: "Time", flex: 1.2, valueGetter: (value) => (value ? new Date(value).toLocaleString() : "-") },
    { field: "type", headerName: "Type", flex: 1 },
    { field: "action", headerName: "Action", flex: 1.4 },
    { field: "category", headerName: "Category", flex: 1 },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary, fontSize: { xs: "2.3rem", md: "3rem" }, lineHeight: 1.05, wordBreak: "break-word" }}>
          Welcome Back! {user?.name ?? "Admin"}
        </Typography>
        <Typography variant="body2" sx={{ color: ui.text.secondary }}>
          Live system overview and operational health
        </Typography>
      </Box>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <ResultCards items={cards} />

      <Grid container spacing={3} sx={{ width: "100%", m: 0 }}>
        <Grid item xs={12} xl={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>Revenue Trend</Typography>
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
                <Chip label={`Blocked IPs: ${security?.blockedIps ?? 0}`} color="error" variant="outlined" />
                <Chip label={`Device resets 24h: ${security?.deviceResets24h ?? 0}`} color="success" variant="outlined" />
                <Chip label={`Healthy APIs: ${realtimeHealth?.totals?.healthy ?? 0}`} color="success" variant="outlined" />
                <Chip label={`Unhealthy APIs: ${realtimeHealth?.totals?.unhealthy ?? 0}`} color="warning" variant="outlined" />
                <Chip label={`Searches / 5m: ${throughput?.totals?.fiveMinutes ?? 0}`} color="primary" variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Recent Activity</Typography>
          <Box sx={{ height: 420 }}>
            <DataGrid
              rows={activity.map((item) => ({ ...item, id: item.id }))}
              columns={columns}
              loading={loading}
              disableRowSelectionOnClick
              pageSizeOptions={[8]}
              initialState={{ pagination: { paginationModel: { pageSize: 8, page: 0 } } }}
            />
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

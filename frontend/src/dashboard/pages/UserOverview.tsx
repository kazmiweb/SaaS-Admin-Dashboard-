import { useEffect, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { api } from "../../app/ApiService";
import { useAuth } from "../../app/auth/useAuth";
import ResultCards, { type ResultCardItem } from "../components/ResultCards";
import { Box, Card, CardContent, Grid, Stack, Typography, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { getDashboardUi } from "../uiTokens";

export default function UserOverview() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const { user } = useAuth();
  const [searches, setSearches] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const [searchRes, txRes] = await Promise.all([
        api.get("/me/search-history"),
        api.get("/me/transactions"),
      ]);
      setSearches(searchRes.data?.items ?? searchRes.data ?? []);
      setTransactions(txRes.data?.items ?? txRes.data ?? []);
    }
    load().catch(() => {
      setSearches([]);
      setTransactions([]);
    });
  }, []);

  const cards = useMemo<ResultCardItem[]>(
    () => [
      { label: "Credits", value: user?.credits ?? 0 },
      { label: "Account Status", value: user?.status ?? "-" },
      { label: "Recent Searches", value: searches.length },
      { label: "Transactions", value: transactions.length },
    ],
    [searches.length, transactions.length, user]
  );

  const chartSeries = [
    {
      name: "Coins",
      data: transactions.slice(0, 8).reverse().map((item) => Number(item.coins ?? 0)),
    },
  ];

  const chartOptions = {
    chart: { toolbar: { show: false } },
    theme: { mode: theme.palette.mode },
    xaxis: {
      categories: transactions.slice(0, 8).reverse().map((item) => new Date(item.createdAt).toLocaleDateString()),
    },
    dataLabels: { enabled: false },
  };

  const columns: GridColDef[] = [
    { field: "createdAt", headerName: "Time", flex: 1.2, valueGetter: (value) => (value ? new Date(value).toLocaleString() : "-") },
    { field: "query", headerName: "Query", flex: 1.3 },
    { field: "detectedType", headerName: "Detected", flex: 1 },
    { field: "status", headerName: "Status", flex: 1 },
    { field: "cost", headerName: "Cost", flex: 0.8 },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary, fontSize: { xs: "2.15rem", md: "3rem" }, lineHeight: 1.05, wordBreak: "break-word" }}>
          Welcome Back! {user?.name ?? "User"}
        </Typography>
      </Box>

      <ResultCards items={cards} />

      <Grid container spacing={3}>
        <Grid item xs={12} xl={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>Recent Coin History</Typography>
              <Chart options={chartOptions} series={chartSeries} type="bar" height={280} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} xl={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>Recent Searches</Typography>
              <Box sx={{ height: 360 }}>
                <DataGrid
                  rows={searches.map((item) => ({ ...item, id: item.id }))}
                  columns={columns}
                  disableRowSelectionOnClick
                  pageSizeOptions={[6]}
                  initialState={{ pagination: { paginationModel: { pageSize: 6, page: 0 } } }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

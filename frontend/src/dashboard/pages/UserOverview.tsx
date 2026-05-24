import { useEffect, useMemo, useState } from "react";
import { api } from "../../app/ApiService";
import { useAuth } from "../../app/auth/useAuth";
import ResultCards, { type ResultCardItem } from "../components/ResultCards";
import { Box, Card, CardContent, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { getDashboardUi } from "../uiTokens";

export default function UserOverview() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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

  function formatDateTime(value: unknown) {
    if (!value) return "-";
    let parsed: Date;
    if (typeof value === "number" && Number.isFinite(value)) {
      parsed = new Date(value < 10_000_000_000 ? value * 1000 : value);
    } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const asNumber = Number(value);
      parsed = new Date(asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber);
    } else {
      parsed = new Date(String(value));
    }
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
  }

  function getRowDateValue(row: any) {
    return row?.createdAt ?? row?.created_at ?? row?.dateTime ?? row?.timestamp ?? row?.date ?? row?.time ?? null;
  }

  const columns: GridColDef[] = [
    {
      field: "createdAt",
      headerName: "Date & Time",
      flex: 1.2,
      valueGetter: (value, row) => formatDateTime(getRowDateValue(row) ?? value),
    },
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

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Latest Search Activity</Typography>
          <Box sx={{ height: isMobile ? "auto" : 420 }}>
            <DataGrid
              rows={searches.map((item) => ({ ...item, id: item.id }))}
              columns={columns}
              disableRowSelectionOnClick
              autoHeight={isMobile}
              columnVisibilityModel={{
                detectedType: !isMobile,
                cost: !isMobile,
              }}
              pageSizeOptions={[6, 10, 20]}
              initialState={{ pagination: { paginationModel: { pageSize: 6, page: 0 } } }}
            />
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

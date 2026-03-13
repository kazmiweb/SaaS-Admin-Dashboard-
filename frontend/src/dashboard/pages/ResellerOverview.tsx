import { useEffect, useMemo, useState } from "react";
import { api } from "../../app/ApiService";
import { useAuth } from "../../app/auth/useAuth";
import { useServices } from "../../app/services/useServices";
import ResultCards, { type ResultCardItem } from "../components/ResultCards";
import { Box, Card, CardContent, Stack, Typography, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { getDashboardUi } from "../uiTokens";

export default function ResellerOverview() {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);
  const { user } = useAuth();
  const { services } = useServices(true);
  const [searches, setSearches] = useState<any[]>([]);

  useEffect(() => {
    api.get("/me/search-history").then((res) => setSearches(res.data?.items ?? res.data ?? [])).catch(() => setSearches([]));
  }, []);

  const cards = useMemo<ResultCardItem[]>(
    () => [
      { label: "Credits", value: user?.credits ?? 0, helper: "Reseller account balance" },
      { label: "Active Services", value: services.length, helper: "Mapped from backend service layer" },
      { label: "Recent Searches", value: searches.length, helper: "Shared search backend" },
      { label: "Status", value: user?.status ?? "-", helper: "JWT/session driven access" },
    ],
    [searches.length, services.length, user]
  );

  const columns: GridColDef[] = [
    { field: "createdAt", headerName: "Time", flex: 1.2, valueGetter: (value) => (value ? new Date(value).toLocaleString() : "-") },
    { field: "query", headerName: "Query", flex: 1.2 },
    { field: "detectedType", headerName: "Detected", flex: 1 },
    { field: "status", headerName: "Status", flex: 1 },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary, fontSize: { xs: "2.15rem", md: "3rem" }, lineHeight: 1.05, wordBreak: "break-word" }}>
          Welcome Back! {user?.name ?? "User"}
        </Typography>
        <Typography variant="body2" sx={{ color: ui.text.secondary }}>
          Credits, services, and latest search activity
        </Typography>
      </Box>

      <ResultCards items={cards} />

      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>Latest Search Activity</Typography>
          <Box sx={{ height: 380 }}>
            <DataGrid
              rows={searches.map((item) => ({ ...item, id: item.id }))}
              columns={columns}
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

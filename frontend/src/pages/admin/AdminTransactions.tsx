import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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

export default function AdminTransactions() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const ui = getDashboardUi(theme.palette.mode);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [billingType, setBillingType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/transactions", {
        params: { billingType: billingType || undefined, from: from || undefined, to: to || undefined, limit: 100 },
      });
      setItems(res.data?.items ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [billingType, from, to]);

  function buildExportHref(path: string) {
    const params = new URLSearchParams();
    if (billingType) params.set("billingType", billingType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const queryString = params.toString();
    return `/api/admin/${path}${queryString ? `?${queryString}` : ""}`;
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.user?.email, item.user?.name, item.note, item.user?.billingType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, query]);
  const actionButtonSx = { minWidth: { xs: "100%", sm: 132 }, whiteSpace: "nowrap" } as const;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary }}>
            Transactions
          </Typography>
          <Typography sx={{ color: ui.text.secondary }}>Revenue-linked transactions and billing records.</Typography>
        </Box>
        <Stack spacing={1.25} sx={{ width: { xs: "100%", lg: "auto" }, alignItems: { xs: "stretch", lg: "flex-end" } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            useFlexGap
            flexWrap="wrap"
            sx={{ width: "100%", justifyContent: { xs: "stretch", lg: "flex-end" } }}
          >
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transactions"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              size="small"
              sx={{ minWidth: { sm: 220 }, flex: { sm: "1 1 240px" } }}
            />
            <TextField
              select
              size="small"
              value={billingType}
              onChange={(e) => setBillingType(e.target.value)}
              sx={{ minWidth: { sm: 170 }, flex: { sm: "0 1 180px" } }}
            >
              <MenuItem value="">All Billing</MenuItem>
              <MenuItem value="PAID">PAID</MenuItem>
              <MenuItem value="FREE">FREE</MenuItem>
              <MenuItem value="DEMO">DEMO</MenuItem>
            </TextField>
            <TextField
              size="small"
              type="date"
              label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { sm: 150 }, flex: { sm: "0 1 160px" } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { sm: 150 }, flex: { sm: "0 1 160px" } }}
            />
          </Stack>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            sx={{ width: "100%", justifyContent: { xs: "stretch", lg: "flex-end" } }}
          >
            <Button startIcon={<RefreshRoundedIcon />} variant="contained" onClick={load} disabled={loading} sx={actionButtonSx}>
              Refresh
            </Button>
            <Button
              startIcon={<DownloadRoundedIcon />}
              variant="outlined"
              component="a"
              href={buildExportHref("exports/transactions.csv")}
              target="_blank"
              sx={actionButtonSx}
            >
              Tx CSV
            </Button>
            <Button
              startIcon={<DownloadRoundedIcon />}
              variant="outlined"
              component="a"
              href={buildExportHref("exports/revenue.csv")}
              target="_blank"
              sx={actionButtonSx}
            >
              Revenue CSV
            </Button>
            <Button
              startIcon={<DownloadRoundedIcon />}
              variant="outlined"
              component="a"
              href={buildExportHref("exports/activity.csv")}
              target="_blank"
              sx={actionButtonSx}
            >
              Activity CSV
            </Button>
          </Stack>
        </Stack>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <Card>
        <CardContent>
          {isMobile ? (
            <Stack spacing={1.5}>
              {filtered.map((item) => (
                <Card key={item.id} variant="outlined" sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack spacing={0.8}>
                      <Typography fontWeight={800}>{item.user?.email ?? "-"}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Date: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Billing: {item.user?.billingType ?? "-"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Coins: {item.coins ?? 0} • PKR: {item.amountPkr ?? 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Note: {item.note ?? "-"}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!filtered.length ? <Typography color="text.secondary">No transactions found.</Typography> : null}
            </Stack>
          ) : (
            <Box sx={{ overflowX: "auto", color: ui.text.primary }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Billing</TableCell>
                    <TableCell align="right">Coins</TableCell>
                    <TableCell align="right">PKR</TableCell>
                    <TableCell>Note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</TableCell>
                      <TableCell>{item.user?.email ?? "-"}</TableCell>
                      <TableCell>{item.user?.billingType ?? "-"}</TableCell>
                      <TableCell align="right">{item.coins ?? 0}</TableCell>
                      <TableCell align="right">{item.amountPkr ?? 0}</TableCell>
                      <TableCell>{item.note ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography color="text.secondary">No transactions found.</Typography>
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

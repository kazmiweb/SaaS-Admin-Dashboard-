import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function AdminSearchHistory() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const ui = getDashboardUi(theme.palette.mode);
    const [logs, setLogs] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [rowCount, setRowCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadLogs() {
            setLoading(true);
            setError("");

            try {
                const params = { page: page + 1, limit: pageSize };
                const response = await api.get("/admin/user-logs", { params });
                setLogs(response.data?.items ?? []);
                setRowCount(response.data?.total ?? 0);
            } catch (e: any) {
                setError(e?.response?.data?.message || e?.message || "Failed to load search history.");
            } finally {
                setLoading(false);
            }
        }

        loadLogs();
    }, [page, pageSize]);

    const columns: GridColDef[] = [
        {
            field: "createdAt",
            headerName: "Date & Time",
            minWidth: 190,
            flex: 1.25,
            valueGetter: (params) => (params.row.createdAt ? new Date(params.row.createdAt).toLocaleString() : "-"),
        },
        {
            field: "userName",
            headerName: "User Name",
            minWidth: 180,
            flex: 1.2,
            valueGetter: (params) => params.row.userName ?? params.row.user?.name ?? params.row.user?.email ?? "-",
        },
        {
            field: "searchedService",
            headerName: "Searched Service",
            minWidth: 180,
            flex: 1.2,
            valueGetter: (params) => params.row.searchedService ?? params.row.service ?? "-",
        },
        {
            field: "ip",
            headerName: "IP Address",
            minWidth: 150,
            flex: 1,
            valueGetter: (params) => params.row.ip ?? "-",
        },
        {
            field: "query",
            headerName: "Search Query",
            minWidth: 220,
            flex: 1.6,
            renderCell: (params) => (
                <Typography noWrap sx={{ fontWeight: 600 }}>
                    {params.value ?? "-"}
                </Typography>
            ),
            valueGetter: (params) => params.row.query ?? "-",
        },
        {
            field: "status",
            headerName: "Status",
            minWidth: 120,
            flex: 0.8,
            renderCell: (params) => (
                <Chip
                    label={params.value ?? "-"}
                    size="small"
                    color={params.value === "success" ? "success" : params.value === "error" ? "error" : "default"}
                    variant="outlined"
                />
            ),
            valueGetter: (params) => params.row.status ?? "-",
        },
        {
            field: "cost",
            headerName: "Cost",
            minWidth: 90,
            flex: 0.8,
            valueGetter: (params) => params.row.cost ?? "-",
        },
    ];

    const rows = logs.map((item) => ({ ...item, id: item.id }));

    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant="h4" mb={0.5} sx={{ color: ui.text.primary }}>
                    All User Search History
                </Typography>
                <Typography color="text.secondary">
                    Complete search history for all users across the system.
                </Typography>
            </Box>

            {error ? <Alert severity="warning">{error}</Alert> : null}

            <Card>
                <CardContent sx={{ backgroundColor: ui.surface.card, borderRadius: 2 }}>
                    {isMobile ? (
                        <Stack spacing={1.5}>
                            {rows.map((item) => (
                                <Card
                                    key={item.id}
                                    variant="outlined"
                                    sx={{ borderColor: ui.surface.borderStrong, backgroundColor: ui.surface.card, borderRadius: 2.5 }}
                                >
                                    <CardContent sx={{ p: 1.5 }}>
                                        <Stack spacing={1.1}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                                                <Typography fontWeight={800} sx={{ color: ui.text.primary }}>
                                                    {item.userName ?? item.user?.name ?? item.user?.email ?? "Unknown user"}
                                                </Typography>
                                                <Chip
                                                    label={item.status ?? "-"}
                                                    size="small"
                                                    color={item.status === "success" ? "success" : item.status === "error" ? "error" : "default"}
                                                    variant="outlined"
                                                />
                                            </Stack>
                                            <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                                                Service: {item.searchedService ?? item.service ?? "-"}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                                                IP: {item.ip ?? "-"}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                                                Date & Time: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                                            </Typography>
                                            <Divider sx={{ borderColor: ui.surface.border }} />
                                            <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                                                Query: {item.query ?? "-"}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: ui.text.secondary }}>
                                                Cost: {item.cost ?? 0}
                                            </Typography>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            ))}
                            {!rows.length && !loading ? (
                                <Typography color="text.secondary">No search logs found.</Typography>
                            ) : null}
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
                        <Box sx={{ height: 620, backgroundColor: ui.surface.card, borderRadius: 2 }}>
                            <DataGrid
                                rows={rows}
                                columns={columns}
                                loading={loading}
                                disableRowSelectionOnClick
                                paginationMode="server"
                                rowCount={rowCount}
                                paginationModel={{ page, pageSize }}
                                onPaginationModelChange={(model) => {
                                    setPage(model.page);
                                    setPageSize(model.pageSize);
                                }}
                                pageSizeOptions={[20, 40, 80]}
                            />
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Stack>
    );
}

import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import { Card, CardContent, Grid, Stack, Typography, useTheme } from "@mui/material";
import { getDashboardUi } from "../uiTokens";

export type ResultCardItem = {
  label: string;
  value: string | number;
  helper?: string;
};

export default function ResultCards({ items }: { items: ResultCardItem[] }) {
  const theme = useTheme();
  const ui = getDashboardUi(theme.palette.mode);

  return (
    <Grid container spacing={2.5} sx={{ width: "100%", m: 0 }}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} xl={3} key={item.label}>
          <Card
            sx={{
              height: "100%",
              background: theme.palette.mode === "dark"
                ? "linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(2, 6, 23, 0.94) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
              border: `1px solid ${ui.surface.borderStrong}`,
              boxShadow: theme.palette.mode === "dark"
                ? "0 22px 50px rgba(2, 6, 23, 0.45)"
                : "0 18px 40px rgba(15, 23, 42, 0.08)",
            }}
          >
            <CardContent sx={{ minWidth: 0 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                <Typography variant="body2" color="text.secondary">
                  {item.label}
                </Typography>
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: "14px",
                    background: theme.palette.mode === "dark"
                      ? "linear-gradient(135deg, rgba(239,68,68,0.24) 0%, rgba(249,115,22,0.18) 100%)"
                      : "linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(249,115,22,0.1) 100%)",
                    color: ui.text.accent,
                    border: `1px solid ${ui.surface.border}`,
                  }}
                >
                  <TrendingUpOutlinedIcon fontSize="small" />
                </Stack>
              </Stack>
              <Typography variant="h4" mb={0.5} sx={{ fontSize: { xs: "2.2rem", md: "2.6rem" }, wordBreak: "break-word" }}>
                {item.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", wordBreak: "break-word" }}>
                {item.helper ?? "Live backend data"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

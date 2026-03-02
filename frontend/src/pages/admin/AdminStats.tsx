import React, { useEffect, useState } from "react";
import { Box, Grid, Heading, HStack, Text } from "@chakra-ui/react";
import { api } from "../../app/api";
import Chart from "react-apexcharts";

export default function AdminStats() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get("/admin/stats").then(r => setStats(r.data.stats)).catch(() => setStats(null));
  }, []);

  const months = stats?.monthlyRevenue ?? [];
  const chartOptions: any = {
    chart: { toolbar: { show: false }, foreColor: "rgba(255,255,255,0.75)" },
    xaxis: { categories: months.map((m: any) => m.label) },
    dataLabels: { enabled: false },
    grid: { borderColor: "rgba(255,255,255,0.08)" },
    stroke: { curve: "smooth", width: 3 },
    theme: { mode: "dark" }
  };

  const series = [{ name: "Revenue (PKR)", data: months.map((m: any) => m.value) }];

  return (
    <Box>
      <HStack justify="space-between" flexWrap="wrap" gap={3} mb={6}>
        <Box>
          <Heading size="lg">Admin Dashboard</Heading>
          <Text opacity={0.8} mt={1}>System overview and health.</Text>
        </Box>
      </HStack>

      <Grid templateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }} gap={5}>
        <Stat title="Total Users" value={stats?.totalUsers ?? "-"} />
        <Stat title="Active Users" value={stats?.activeUsers ?? "-"} />
        <Stat title="API Services" value={stats?.activeApis ?? "-"} />
        <Stat title="Revenue Today (PKR)" value={stats?.revenueToday ?? 0} />
      </Grid>

      <Box mt={6} bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={{ base: 4, md: 6 }}>
        <Heading size="md" mb={3}>12-Month Revenue</Heading>
        <Box>
          <Chart options={chartOptions} series={series} type="area" height={320} />
        </Box>
      </Box>
    </Box>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return (
    <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={5}>
      <Text opacity={0.75} fontSize="sm" fontWeight="700">{title}</Text>
      <Text fontSize="3xl" fontWeight="900" mt={1}>{String(value)}</Text>
    </Box>
  );
}

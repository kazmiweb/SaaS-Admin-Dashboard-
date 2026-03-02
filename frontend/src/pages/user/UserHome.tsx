import React, { useEffect, useState } from "react";
import { Box, Button, Grid, Heading, HStack, Progress, Text, VStack, Tag, TagLabel } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/auth/useAuth";
import { api } from "../../app/api";

export default function UserHome() {
  const nav = useNavigate();
  const { user, refreshMe } = useAuth();
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    refreshMe();
    api.get("/me/search-history?limit=10").then(r => setRecent(r.data.rows ?? [])).catch(() => setRecent([]));
  }, []);

  const credits = user?.credits ?? 0;
  const expireAt = user?.expireAt ? new Date(user.expireAt) : null;
  const daysRemaining = expireAt ? Math.max(0, Math.ceil((expireAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <Box>
      <HStack justify="space-between" flexWrap="wrap" gap={3} mb={6}>
        <Box>
          <Heading size="lg">Dashboard</Heading>
          <Text opacity={0.8} mt={1}>Welcome back. Run a search to retrieve official records.</Text>
        </Box>
        <Button colorScheme="blue" borderRadius="999px" onClick={() => nav("/user/cnic-intelligence")}>
          Start Searching
        </Button>
      </HStack>

      <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={5}>
        <StatCard title="Remaining Coins" value={String(credits)} accent="green" />
        <StatCard title="Days Remaining" value={daysRemaining == null ? "-" : String(daysRemaining)} accent="yellow" />
        <StatCard title="Account Since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"} accent="blue" />
      </Grid>

      <Box mt={6} bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={{ base: 4, md: 6 }}>
        <HStack justify="space-between" mb={4} flexWrap="wrap" gap={2}>
          <Heading size="md">Recent Search Logs</Heading>
          <Button variant="outline" borderRadius="999px" onClick={() => nav("/user/settings/searches")}>
            View All
          </Button>
        </HStack>

        <VStack align="stretch" spacing={3}>
          {recent.map((r) => (
            <Box key={r.id} p={4} borderRadius="16px" bg="rgba(0,0,0,0.25)" border="1px solid rgba(255,255,255,0.08)">
              <HStack justify="space-between" flexWrap="wrap" gap={2}>
                <Box>
                  <Text fontWeight="800">{r.query}</Text>
                  <Text fontSize="sm" opacity={0.75}>{new Date(r.createdAt).toLocaleString()} • {r.detectedType}</Text>
                </Box>
                <Tag colorScheme={r.status === "success" ? "green" : r.status === "blocked" ? "yellow" : "red"} borderRadius="999px">
                  <TagLabel>{r.status}</TagLabel>
                </Tag>
              </HStack>
            </Box>
          ))}
          {!recent.length ? <Text opacity={0.7}>No recent searches</Text> : null}
        </VStack>

        <Box mt={5}>
          <Text fontSize="sm" opacity={0.75} mb={2}>Coins usage indicator</Text>
          <Progress value={Math.min(100, credits)} borderRadius="999px" />
        </Box>
      </Box>

      {/* Mobile quick actions */}
      <HStack spacing={3} mt={6} display={{ base: "flex", md: "none" }}>
        <Button w="full" borderRadius="999px" onClick={() => nav("/user/cnic-intelligence")}>CNIC</Button>
        <Button w="full" borderRadius="999px" onClick={() => nav("/user/mobile-intelligence")}>Mobile</Button>
      </HStack>
    </Box>
  );
}

function StatCard({ title, value, accent }: { title: string; value: string; accent: "green" | "yellow" | "blue" }) {
  return (
    <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={5}>
      <Text opacity={0.75} fontSize="sm" fontWeight="700">{title}</Text>
      <Text fontSize="3xl" fontWeight="900" mt={1}>{value}</Text>
      <Box mt={3} h="3px" borderRadius="999px" bg={`${accent}.400`} opacity={0.7} />
    </Box>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from "@chakra-ui/react";
import { Layout } from "../../components/Layout";
import { api } from "../../app/api";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "RESELLER" | "USER";
  status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED" | "INACTIVE";
  credits: number;
  expireAt: string | null;
  resellerId?: string | null;
};

export default function AdminUsers() {
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/users");
      setRows(res.data.users ?? []);
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to load users", position: "top" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((u) => {
      if (role && u.role !== role) return false;
      if (status && u.status !== status) return false;
      if (!qq) return true;
      return u.email.toLowerCase().includes(qq) || u.name.toLowerCase().includes(qq) || u.id.includes(qq);
    });
  }, [rows, q, role, status]);

  async function resetDevice(id: string) {
    if (!confirm("Reset device for this user? They will need email OTP verification to log in again.")) return;
    try {
      await api.post(`/admin/users/${id}/reset-device`);
      toast({ status: "success", title: "Device reset", position: "top" });
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to reset device", position: "top" });
    }
  }

  return (
    <Layout>
      <Box>
        <HStack justify="space-between" flexWrap="wrap" gap={3} mb={5}>
          <Box>
            <Heading size="lg">User Management</Heading>
            <Text fontSize="sm" opacity={0.8} mt={1}>
              Manage users, roles, credits, and device locks.
            </Text>
          </Box>
          <Button onClick={load} variant="outline" borderRadius="999px" isLoading={loading}>
            Refresh
          </Button>
        </HStack>

        <HStack gap={3} flexWrap="wrap" mb={4}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name/email/id" maxW="360px" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} maxW="220px">
            <option value="">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="RESELLER">RESELLER</option>
            <option value="USER">USER</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} maxW="220px">
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="BLACKLISTED">BLACKLISTED</option>
          </Select>
        </HStack>

        <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" overflow="hidden">
          {loading ? (
            <HStack p={10} justify="center">
              <Spinner />
            </HStack>
          ) : (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color="whiteAlpha.700">Name</Th>
                  <Th color="whiteAlpha.700">Email</Th>
                  <Th color="whiteAlpha.700">Role</Th>
                  <Th color="whiteAlpha.700">Coins</Th>
                  <Th color="whiteAlpha.700">Expiry</Th>
                  <Th color="whiteAlpha.700">Status</Th>
                  <Th color="whiteAlpha.700" textAlign="right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filtered.map((u) => (
                  <Tr key={u.id} _hover={{ bg: "rgba(255,255,255,0.04)" }}>
                    <Td>
                      <Text fontWeight={900}>{u.name}</Text>
                      <Text fontSize="xs" opacity={0.75} noOfLines={1}>
                        {u.id}
                      </Text>
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <Badge borderRadius="999px" px={3} py={1} colorScheme={u.role === "ADMIN" ? "purple" : u.role === "RESELLER" ? "blue" : "gray"}>
                        {u.role}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge borderRadius="999px" px={3} py={1} colorScheme="yellow">
                        {u.credits}
                      </Badge>
                    </Td>
                    <Td>{u.expireAt ? new Date(u.expireAt).toLocaleDateString() : "—"}</Td>
                    <Td>
                      <Badge borderRadius="999px" px={3} py={1} colorScheme={u.status === "ACTIVE" ? "green" : "red"}>
                        {u.status}
                      </Badge>
                    </Td>
                    <Td textAlign="right">
                      <HStack justify="flex-end">
                        <Button size="sm" borderRadius="999px" variant="outline" onClick={() => resetDevice(u.id)}>
                          Reset Device
                        </Button>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          {!loading && !filtered.length ? <Box p={6} opacity={0.8}>No users found.</Box> : null}
        </Box>
      </Box>
    </Layout>
  );
}

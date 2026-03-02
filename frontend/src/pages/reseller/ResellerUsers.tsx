import React from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { api } from "../../app/api";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "USER";
  status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED" | "INACTIVE";
  credits: number;
  expireAt: string | null;
  createdAt: string;
};

export default function ResellerUsers() {
  const toast = useToast();
  const [rows, setRows] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [coins, setCoins] = React.useState("0");
  const [expireAt, setExpireAt] = React.useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/reseller/users");
      setRows(res.data.users ?? []);
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to load users", position: "top" });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser() {
    const c = Number(coins || 0);
    if (!email || !name || !password) {
      toast({ status: "error", title: "Email, name, password are required", position: "top" });
      return;
    }
    try {
      await api.post("/reseller/users", {
        email,
        name,
        password,
        coins: Number.isFinite(c) ? c : 0,
        expireAt: expireAt ? new Date(expireAt).toISOString() : undefined,
      });
      toast({ status: "success", title: "User created", position: "top" });
      onClose();
      setEmail("");
      setName("");
      setPassword("");
      setCoins("0");
      setExpireAt("");
      await load();
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to create user", position: "top" });
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Delete this user?")) return;
    try {
      await api.delete(`/reseller/users/${id}`);
      toast({ status: "success", title: "User deleted", position: "top" });
      await load();
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to delete user", position: "top" });
    }
  }

  async function addCoins(id: string) {
    const amount = prompt("Coins to add:", "10");
    if (!amount) return;
    const coinsToAdd = Number(amount);
    if (!Number.isFinite(coinsToAdd) || coinsToAdd <= 0) {
      toast({ status: "error", title: "Invalid amount", position: "top" });
      return;
    }
    const exp = prompt("Optional new expiry (YYYY-MM-DD) leave blank to keep current:", "");
    try {
      await api.post(`/reseller/users/${id}/add-coins`, {
        coins: coinsToAdd,
        expireAt: exp ? new Date(`${exp}T00:00:00`).toISOString() : undefined,
      });
      toast({ status: "success", title: "Coins added", position: "top" });
      await load();
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to add coins", position: "top" });
    }
  }

  async function resetDevice(id: string) {
    if (!confirm("Reset this user's bound device? They will need email OTP verification to log in again.")) return;
    try {
      await api.post(`/reseller/users/${id}/reset-device`);
      toast({ status: "success", title: "Device reset", position: "top" });
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message ?? "Failed to reset device", position: "top" });
    }
  }

  return (
    <Box>
      <HStack justify="space-between" flexWrap="wrap" gap={3} mb={5}>
        <Box>
          <Heading size="lg">User Management</Heading>
          <Box opacity={0.8} fontSize="sm">Create and manage your users. Coins are deducted immediately and are non-refundable.</Box>
        </Box>
        <HStack>
          <Button onClick={load} variant="outline" borderRadius="999px" isLoading={loading}>
            Refresh
          </Button>
          <Button colorScheme="blue" borderRadius="999px" onClick={onOpen}>
            + Create User
          </Button>
        </HStack>
      </HStack>

      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" overflow="hidden">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th color="whiteAlpha.700">Name</Th>
              <Th color="whiteAlpha.700">Email</Th>
              <Th color="whiteAlpha.700">Coins</Th>
              <Th color="whiteAlpha.700">Expiry</Th>
              <Th color="whiteAlpha.700">Status</Th>
              <Th color="whiteAlpha.700" textAlign="right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((u) => (
              <Tr key={u.id} _hover={{ bg: "rgba(255,255,255,0.04)" }}>
                <Td>{u.name}</Td>
                <Td>{u.email}</Td>
                <Td>
                  <Badge colorScheme="yellow" borderRadius="999px" px={3} py={1}>
                    {u.credits}
                  </Badge>
                </Td>
                <Td>{u.expireAt ? new Date(u.expireAt).toLocaleDateString() : "—"}</Td>
                <Td>
                  <Badge colorScheme={u.status === "ACTIVE" ? "green" : "red"} borderRadius="999px" px={3} py={1}>
                    {u.status}
                  </Badge>
                </Td>
                <Td textAlign="right">
                  <HStack justify="flex-end">
                    <Button size="sm" borderRadius="999px" onClick={() => addCoins(u.id)}>
                      Add Coins
                    </Button>
                    <Button size="sm" borderRadius="999px" variant="outline" onClick={() => resetDevice(u.id)}>
                      Reset Device
                    </Button>
                    <Button size="sm" colorScheme="red" variant="outline" borderRadius="999px" onClick={() => deleteUser(u.id)}>
                      Delete
                    </Button>
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!rows.length ? <Box p={6} opacity={0.8}>No users created yet.</Box> : null}
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent bg="navy.900" border="1px solid rgba(255,255,255,0.12)" borderRadius="18px">
          <ModalHeader>Create User</ModalHeader>
          <ModalBody>
            <Stack spacing={4}>
              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
              </FormControl>
              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </FormControl>
              <FormControl>
                <FormLabel>Password</FormLabel>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Min 8 chars" />
              </FormControl>
              <Divider borderColor="whiteAlpha.200" />
              <FormControl>
                <FormLabel>Initial Coins</FormLabel>
                <Input value={coins} onChange={(e) => setCoins(e.target.value)} type="number" min={0} />
              </FormControl>
              <FormControl>
                <FormLabel>Expiry Date (optional)</FormLabel>
                <Input value={expireAt} onChange={(e) => setExpireAt(e.target.value)} type="date" />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <HStack w="full">
              <Button w="full" variant="outline" onClick={onClose} borderRadius="14px">
                Cancel
              </Button>
              <Button w="full" colorScheme="blue" onClick={createUser} borderRadius="14px">
                Create
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

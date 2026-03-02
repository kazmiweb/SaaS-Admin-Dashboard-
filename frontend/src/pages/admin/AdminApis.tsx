import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { Layout } from "../../components/Layout";
import { api } from "../../app/api";

type ApiItem = {
  id: string;
  name: string;
  baseUrl: string;
  endpoint: string;
  method: string;
  authType: string;
  status?: boolean;
  isActive?: boolean;
  creditsPerSearch: number;
};

type ServiceApiLink = { apiId: string; enabled: boolean; priority: number };
type ServiceItem = {
  id: string;
  name: string;
  status: boolean;
  type?: string;
  serviceApis: ServiceApiLink[];
};

function isApiActive(x: ApiItem) {
  if (typeof x.status === "boolean") return x.status;
  if (typeof x.isActive === "boolean") return x.isActive;
  return true;
}

export default function AdminApis({ onLogout }: { onLogout: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apis, setApis] = useState<ApiItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [q, setQ] = useState("");

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activeApi, setActiveApi] = useState<ApiItem | null>(null);

  async function load() {
    try {
      setLoading(true);
      const [a, s] = await Promise.all([api.get("/admin/apis"), api.get("/admin/services")]);
      const apiItems = a.data?.apis ?? a.data?.items ?? a.data ?? [];
      const svcItems = s.data?.services ?? s.data?.items ?? s.data ?? [];
      setApis(Array.isArray(apiItems) ? apiItems : []);
      setServices(Array.isArray(svcItems) ? svcItems : []);
    } catch (e: any) {
      toast({
        title: "Failed to load API/Services",
        description: e?.response?.data?.message || e?.message || "Unknown error",
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredApis = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return apis;
    return apis.filter((x) =>
      [x.name, x.baseUrl, x.endpoint, x.method, x.authType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [apis, q]);

  const serviceIdsByApi = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const svc of services) {
      for (const link of svc.serviceApis || []) {
        if (!map.has(link.apiId)) map.set(link.apiId, new Set());
        map.get(link.apiId)!.add(svc.id);
      }
    }
    return map;
  }, [services]);

  async function updateServiceApis(serviceId: string, apiIds: string[]) {
    setSaving(true);
    try {
      await api.put(`/admin/services/${serviceId}`, { apiIds });
      await load();
      toast({ title: "Updated", status: "success" });
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.response?.data?.message || e?.message || "Unknown error",
        status: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleMatrix(service: ServiceItem, apiId: string) {
    const current = new Set((service.serviceApis || []).map((x) => x.apiId));
    if (current.has(apiId)) current.delete(apiId);
    else current.add(apiId);
    await updateServiceApis(service.id, Array.from(current));
  }

  function openApiDrawer(item: ApiItem) {
    setActiveApi(item);
    onOpen();
  }

  async function saveApiAssignments(apiId: string, selectedServiceIds: string[]) {
    // Update each service assignment. Small N, safe.
    setSaving(true);
    try {
      const svcWithApi = services.filter((s) => (s.serviceApis || []).some((l) => l.apiId === apiId)).map((s) => s.id);
      const toAdd = selectedServiceIds.filter((id) => !svcWithApi.includes(id));
      const toRemove = svcWithApi.filter((id) => !selectedServiceIds.includes(id));

      for (const id of toAdd) {
        const svc = services.find((x) => x.id === id);
        const next = new Set((svc?.serviceApis || []).map((x) => x.apiId));
        next.add(apiId);
        await api.put(`/admin/services/${id}`, { apiIds: Array.from(next) });
      }
      for (const id of toRemove) {
        const svc = services.find((x) => x.id === id);
        const next = new Set((svc?.serviceApis || []).map((x) => x.apiId));
        next.delete(apiId);
        await api.put(`/admin/services/${id}`, { apiIds: Array.from(next) });
      }

      toast({ title: "Assignments saved", status: "success" });
      await load();
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.response?.data?.message || e?.message || "Unknown error",
        status: "error",
      });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <Layout role="ADMIN" onLogout={onLogout}>
      <Box px={{ base: 4, md: 8 }} py={{ base: 6, md: 8 }}>
        <Flex direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} gap={4} mb={6}>
          <Box>
            <Heading size="lg">API Management</Heading>
            <Text color="whiteAlpha.700" mt={1}>
              Assign APIs to services visually (matrix) and manage per-service routing.
            </Text>
          </Box>

          <HStack gap={3} align="center">
            <Input
              placeholder="Search APIs..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxW={{ base: "100%", md: "280px" }}
              bg="whiteAlpha.50"
              borderColor="whiteAlpha.200"
            />
            <Button onClick={load} colorScheme="blue" isLoading={loading}>
              Refresh
            </Button>
          </HStack>
        </Flex>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6} alignItems="start">
          {/* Left: APIs */}
          <Box
            borderRadius="2xl"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            bg="whiteAlpha.50"
            overflow="hidden"
          >
            <Box px={5} py={4} borderBottom="1px solid rgba(255,255,255,0.08)">
              <Heading size="sm">Configured APIs</Heading>
              <Text fontSize="sm" opacity={0.75} mt={1}>
                Click an API to multi-assign services.
              </Text>
            </Box>

            {loading ? (
              <Flex p={10} justify="center">
                <Spinner size="lg" />
              </Flex>
            ) : filteredApis.length === 0 ? (
              <Box p={10} textAlign="center">
                <Text color="whiteAlpha.700">No APIs found.</Text>
              </Box>
            ) : (
              <Table variant="simple" size="sm">
                <Thead bg="whiteAlpha.100">
                  <Tr>
                    <Th>Name</Th>
                    <Th>Method</Th>
                    <Th isNumeric>Credits</Th>
                    <Th>Assigned</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredApis.map((x) => {
                    const assignedCount = serviceIdsByApi.get(x.id)?.size ?? 0;
                    return (
                      <Tr key={x.id} _hover={{ bg: "whiteAlpha.50" }} cursor="pointer" onClick={() => openApiDrawer(x)}>
                        <Td>
                          <Text fontWeight="800">{x.name}</Text>
                          <Text fontSize="xs" opacity={0.75} noOfLines={1}>
                            {x.baseUrl}{x.endpoint}
                          </Text>
                        </Td>
                        <Td>
                          <Badge borderRadius="999px" px={2} py={1}>
                            {x.method}
                          </Badge>
                        </Td>
                        <Td isNumeric>{x.creditsPerSearch ?? 1}</Td>
                        <Td>
                          <Badge colorScheme={assignedCount ? "purple" : "gray"} borderRadius="999px" px={3} py={1}>
                            {assignedCount} services
                          </Badge>
                        </Td>
                        <Td>
                          {isApiActive(x) ? <Badge colorScheme="green">Active</Badge> : <Badge colorScheme="red">Inactive</Badge>}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Box>

          {/* Right: Service Matrix */}
          <Box
            borderRadius="2xl"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            bg="whiteAlpha.50"
            overflow="hidden"
          >
            <Box px={5} py={4} borderBottom="1px solid rgba(255,255,255,0.08)">
              <Heading size="sm">Service Matrix</Heading>
              <Text fontSize="sm" opacity={0.75} mt={1}>
                Toggle API availability per service. (Horizontal scroll enabled.)
              </Text>
            </Box>

            {loading ? (
              <Flex p={10} justify="center">
                <Spinner size="lg" />
              </Flex>
            ) : services.length === 0 || apis.length === 0 ? (
              <Box p={10} textAlign="center">
                <Text color="whiteAlpha.700">No services or APIs configured yet.</Text>
              </Box>
            ) : (
              <Box p={4}>
                <VirtualServiceMatrix
                  services={services}
                  apis={filteredApis}
                  saving={saving}
                  onToggle={(svc, apiId) => toggleMatrix(svc, apiId)}
                />
                <Box pt={3} opacity={0.75} fontSize="xs">
                  Virtualized matrix: supports many APIs smoothly (horizontal + vertical windowing).
                </Box>
              </Box>
            )}
          </Box>
        </SimpleGrid>
      </Box>

      <ApiAssignDrawer
        isOpen={isOpen}
        onClose={onClose}
        apiItem={activeApi}
        services={services}
        assignedServiceIds={activeApi ? Array.from(serviceIdsByApi.get(activeApi.id) ?? new Set()) : []}
        saving={saving}
        onSave={saveApiAssignments}
      />
    </Layout>
  );
}

function VirtualServiceMatrix(props: {
  services: ServiceItem[];
  apis: ApiItem[];
  saving: boolean;
  onToggle: (svc: ServiceItem, apiId: string) => void;
}) {
  const { services, apis, saving, onToggle } = props;
  const COL_W = 160;
  const ROW_H = 56;
  const HEADER_H = 46;
  const LEFT_W = 300;
  const OVERSCAN_COLS = 2;
  const OVERSCAN_ROWS = 6;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.max(360, r.width), h: Math.max(360, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bodyH = Math.max(240, viewport.h - HEADER_H);
  const rightW = Math.max(240, viewport.w - LEFT_W);

  const totalRightW = apis.length * COL_W;
  const totalBodyH = services.length * ROW_H;

  const visibleCols = Math.max(1, Math.ceil(rightW / COL_W));
  const startCol = Math.max(0, Math.floor(scroll.left / COL_W) - OVERSCAN_COLS);
  const endCol = Math.min(apis.length - 1, startCol + visibleCols + OVERSCAN_COLS * 2);
  const colSlice = apis.slice(startCol, endCol + 1);

  const visibleRows = Math.max(1, Math.ceil(bodyH / ROW_H));
  const startRow = Math.max(0, Math.floor(scroll.top / ROW_H) - OVERSCAN_ROWS);
  const endRow = Math.min(services.length - 1, startRow + visibleRows + OVERSCAN_ROWS * 2);
  const rowSlice = services.slice(startRow, endRow + 1);

  return (
    <Box ref={wrapRef} height="560px" overflow="hidden">
      <HStack align="stretch" spacing={0} height="100%">
        {/* Left (services) */}
        <Box width={`${LEFT_W}px`} borderRight="1px solid rgba(255,255,255,0.08)">
          <Box
            height={`${HEADER_H}px`}
            bg="rgba(18,18,24,0.92)"
            borderBottom="1px solid rgba(255,255,255,0.08)"
            display="flex"
            alignItems="center"
            px={4}
            fontWeight={900}
          >
            Service
          </Box>
          <Box position="relative" height={`${bodyH}px`} overflow="hidden">
            <Box position="relative" height={`${totalBodyH}px`}>
              {rowSlice.map((svc, i) => {
                const rowIndex = startRow + i;
                const top = rowIndex * ROW_H - scroll.top;
                const set = new Set((svc.serviceApis || []).map((x) => x.apiId));
                return (
                  <Box
                    key={svc.id}
                    position="absolute"
                    top={`${top}px`}
                    left={0}
                    right={0}
                    height={`${ROW_H}px`}
                    borderBottom="1px solid rgba(255,255,255,0.06)"
                    bg="rgba(18,18,24,0.86)"
                    px={4}
                    display="flex"
                    alignItems="center"
                  >
                    <HStack justify="space-between" w="full">
                      <Box>
                        <Text fontWeight="800" noOfLines={1}>{svc.name}</Text>
                        <HStack spacing={2} mt={1}>
                          <Badge colorScheme={svc.status ? "green" : "red"} borderRadius="999px">
                            {svc.status ? "Online" : "Offline"}
                          </Badge>
                          {svc.type ? <Badge borderRadius="999px">{svc.type}</Badge> : null}
                        </HStack>
                      </Box>
                      <Badge colorScheme="purple" borderRadius="999px" px={3} py={1}>
                        {set.size}
                      </Badge>
                    </HStack>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Right (APIs) */}
        <Box flex="1" minW="240px">
          <Box
            height={`${HEADER_H}px`}
            bg="rgba(18,18,24,0.92)"
            borderBottom="1px solid rgba(255,255,255,0.08)"
            position="relative"
            overflow="hidden"
          >
            <Box position="absolute" left={`${-scroll.left}px`} top={0} height="100%" width={`${totalRightW}px`}>
              {colSlice.map((a, idx) => {
                const colIndex = startCol + idx;
                const left = colIndex * COL_W;
                return (
                  <Box
                    key={a.id}
                    position="absolute"
                    left={`${left}px`}
                    top={0}
                    width={`${COL_W}px`}
                    height="100%"
                    px={3}
                    display="flex"
                    alignItems="center"
                  >
                    <Text fontSize="xs" fontWeight={800} noOfLines={1} maxW={`${COL_W - 16}px`}>
                      {a.name}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box
            ref={rightRef}
            height={`${bodyH}px`}
            overflow="auto"
            onScroll={(e) => {
              const t = e.currentTarget;
              setScroll({ left: t.scrollLeft, top: t.scrollTop });
            }}
          >
            <Box position="relative" width={`${totalRightW}px`} height={`${totalBodyH}px`}>
              {rowSlice.map((svc, r) => {
                const rowIndex = startRow + r;
                const top = rowIndex * ROW_H;
                const set = new Set((svc.serviceApis || []).map((x) => x.apiId));
                return (
                  <Box key={svc.id}>
                    {colSlice.map((a, c) => {
                      const colIndex = startCol + c;
                      const left = colIndex * COL_W;
                      return (
                        <Box
                          key={`${svc.id}-${a.id}`}
                          position="absolute"
                          left={`${left}px`}
                          top={`${top}px`}
                          width={`${COL_W}px`}
                          height={`${ROW_H}px`}
                          borderBottom="1px solid rgba(255,255,255,0.06)"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Checkbox
                            isChecked={set.has(a.id)}
                            onChange={() => onToggle(svc, a.id)}
                            isDisabled={saving}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </HStack>
    </Box>
  );
}

function ApiAssignDrawer(props: {
  isOpen: boolean;
  onClose: () => void;
  apiItem: ApiItem | null;
  services: ServiceItem[];
  assignedServiceIds: string[];
  saving: boolean;
  onSave: (apiId: string, serviceIds: string[]) => Promise<void>;
}) {
  const { isOpen, onClose, apiItem, services, assignedServiceIds, saving, onSave } = props;
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(assignedServiceIds);
  }, [assignedServiceIds, apiItem?.id]);

  if (!apiItem) return null;

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
      <DrawerOverlay />
      <DrawerContent bg="rgba(12,12,18,0.92)" borderLeft="1px solid rgba(255,255,255,0.10)">
        <DrawerCloseButton />
        <DrawerHeader>
          <VStack align="start" spacing={1}>
            <Text fontWeight="900">Assign API to Services</Text>
            <Text fontSize="sm" opacity={0.75}>
              {apiItem.name}
            </Text>
          </VStack>
        </DrawerHeader>
        <DrawerBody>
          <Box borderRadius="2xl" borderWidth="1px" borderColor="whiteAlpha.200" bg="whiteAlpha.50" p={4}>
            <Text fontSize="sm" opacity={0.8} mb={3}>
              Select services where this API should be enabled.
            </Text>
            <VStack align="stretch" spacing={2} maxH="60vh" overflow="auto" pr={1}>
              {services
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((svc) => {
                  const checked = selected.includes(svc.id);
                  return (
                    <HStack key={svc.id} justify="space-between" p={2} borderRadius="xl" _hover={{ bg: "whiteAlpha.50" }}>
                      <Box>
                        <Text fontWeight="800">{svc.name}</Text>
                        <HStack spacing={2} mt={0.5}>
                          <Badge colorScheme={svc.status ? "green" : "red"} borderRadius="999px">
                            {svc.status ? "Online" : "Offline"}
                          </Badge>
                          {svc.type ? <Badge borderRadius="999px">{svc.type}</Badge> : null}
                        </HStack>
                      </Box>
                      <Checkbox
                        isChecked={checked}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(svc.id);
                          else next.delete(svc.id);
                          setSelected(Array.from(next));
                        }}
                      />
                    </HStack>
                  );
                })}
            </VStack>
          </Box>

          <HStack mt={5} justify="space-between">
            <Button variant="outline" borderRadius="999px" onClick={onClose} isDisabled={saving}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              borderRadius="999px"
              isLoading={saving}
              onClick={() => onSave(apiItem.id, selected)}
            >
              Save Assignments
            </Button>
          </HStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

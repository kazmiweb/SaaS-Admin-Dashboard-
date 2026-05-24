import React, { useEffect, useState } from "react";
import { Box, Button, Heading, Stack, Table, Tbody, Td, Th, Thead, Tr, Tag, Text, useBreakpointValue } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function UserSearches() {
  const muiTheme = useMuiTheme();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;
  const ui = getDashboardUi(muiTheme.palette.mode);
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    api.get("/me/search-history", { params: { limit, page } })
      .then((r) => {
        setRows(r.data.items ?? []);
        setTotal(Number(r.data.total ?? 0));
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>My Searches</Heading>
      {isMobile ? (
        <Stack spacing={3}>
          {rows.map((r) => (
            <Box key={r.id} bg={ui.surface.card} border={`1px solid ${ui.surface.borderStrong}`} borderRadius="14px" p={3}>
              <Stack spacing={1.5}>
                <Text fontWeight="700">{r.query || "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>Service: {r.searchedService ?? r.service ?? "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>IP: {r.ip ?? "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>Date: {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</Text>
                <Stack direction="row" justify="space-between" align="center">
                  <Tag size="sm" colorScheme={r.status === "success" ? "green" : r.status === "blocked" ? "yellow" : "red"} borderRadius="999px">
                    {r.status}
                  </Tag>
                  <Text fontSize="sm" color={ui.text.secondary}>Cost: {r.cost ?? 0}</Text>
                </Stack>
              </Stack>
            </Box>
          ))}
          {!rows.length ? <Text opacity={0.7} py={2}>No searches found</Text> : null}
          <Stack direction="row" justify="space-between" align="center">
            <Button size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} isDisabled={page <= 1}>
              Previous
            </Button>
            <Text fontSize="xs" color={ui.text.secondary}>
              Page {page} of {totalPages}
            </Text>
            <Button size="sm" onClick={() => setPage((prev) => prev + 1)} isDisabled={page >= totalPages}>
              Next
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Box bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="18px" overflow="hidden">
          <Table variant="simple" size="sm">
            <Thead bg={ui.surface.hover}>
              <Tr>
                <Th color={ui.text.secondary}>Date</Th>
                <Th color={ui.text.secondary}>Query</Th>
                <Th color={ui.text.secondary}>Service</Th>
                <Th color={ui.text.secondary}>Status</Th>
                <Th color={ui.text.secondary}>Cost</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map(r => (
                <Tr key={r.id}>
                  <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                  <Td>{r.query}</Td>
                  <Td>{r.searchedService ?? r.service ?? "-"}</Td>
                  <Td>
                    <Tag size="sm" colorScheme={r.status === "success" ? "green" : r.status === "blocked" ? "yellow" : "red"} borderRadius="999px">
                      {r.status}
                    </Tag>
                  </Td>
                  <Td>{r.cost}</Td>
                </Tr>
              ))}
              {!rows.length ? (
                <Tr><Td colSpan={5}><Text opacity={0.7} py={4}>No searches found</Text></Td></Tr>
              ) : null}
            </Tbody>
          </Table>
          <Stack direction="row" justify="space-between" align="center" px={4} py={3} borderTop={`1px solid ${ui.surface.border}`}>
            <Button size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} isDisabled={page <= 1}>
              Previous
            </Button>
            <Text fontSize="xs" color={ui.text.secondary}>
              Page {page} of {totalPages}
            </Text>
            <Button size="sm" onClick={() => setPage((prev) => prev + 1)} isDisabled={page >= totalPages}>
              Next
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

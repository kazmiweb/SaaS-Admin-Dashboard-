import React, { useEffect, useState } from "react";
import { Box, Heading, Table, Tbody, Td, Th, Thead, Tr, Tag, Text } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function UserSearches() {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/me/search-history?limit=30").then(r => setRows(r.data.items ?? [])).catch(() => setRows([]));
  }, []);

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>My Searches</Heading>
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
                <Td>{r.service ?? "-"}</Td>
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
      </Box>
    </Box>
  );
}

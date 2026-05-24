import React, { useEffect, useState } from "react";
import { Box, Heading, Stack, Table, Tbody, Td, Th, Thead, Tr, Text, useBreakpointValue } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function UserTransactions() {
  const muiTheme = useMuiTheme();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;
  const ui = getDashboardUi(muiTheme.palette.mode);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/me/transactions?limit=50").then(r => setRows(r.data.items ?? [])).catch(() => setRows([]));
  }, []);

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>Transaction History</Heading>
      {isMobile ? (
        <Stack spacing={3}>
          {rows.map((r) => (
            <Box key={r.id} bg={ui.surface.card} border={`1px solid ${ui.surface.borderStrong}`} borderRadius="14px" p={3}>
              <Stack spacing={1.2}>
                <Text fontSize="sm" color={ui.text.secondary}>Date: {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>Amount: {r.amountPkr ?? "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>Coins: {r.coins ?? "-"}</Text>
                <Text fontSize="sm" color={ui.text.secondary}>Note: {r.note ?? "-"}</Text>
              </Stack>
            </Box>
          ))}
          {!rows.length ? <Text opacity={0.7} py={2}>No transactions found</Text> : null}
        </Stack>
      ) : (
        <Box bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="18px" overflow="hidden">
          <Table variant="simple" size="sm">
            <Thead bg={ui.surface.hover}>
              <Tr>
                <Th color={ui.text.secondary}>Date</Th>
                <Th color={ui.text.secondary}>Amount</Th>
                <Th color={ui.text.secondary}>Coins</Th>
                <Th color={ui.text.secondary}>Notes</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map(r => (
                <Tr key={r.id}>
                  <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                  <Td>{r.amountPkr ?? "-"}</Td>
                  <Td>{r.coins ?? "-"}</Td>
                  <Td>{r.note ?? "-"}</Td>
                </Tr>
              ))}
              {!rows.length ? (
                <Tr><Td colSpan={4}><Text opacity={0.7} py={4}>No transactions found</Text></Td></Tr>
              ) : null}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

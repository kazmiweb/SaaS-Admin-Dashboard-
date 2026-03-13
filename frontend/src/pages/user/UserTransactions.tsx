import React, { useEffect, useState } from "react";
import { Box, Heading, Table, Tbody, Td, Th, Thead, Tr, Text } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { getDashboardUi } from "../../dashboard/uiTokens";

export default function UserTransactions() {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/me/transactions?limit=50").then(r => setRows(r.data.items ?? [])).catch(() => setRows([]));
  }, []);

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>Transaction History</Heading>
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
    </Box>
  );
}

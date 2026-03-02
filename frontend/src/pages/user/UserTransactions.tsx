import React, { useEffect, useState } from "react";
import { Box, Heading, Table, Tbody, Td, Th, Thead, Tr, Text } from "@chakra-ui/react";
import { api } from "../../app/api";

export default function UserTransactions() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/me/transactions?limit=50").then(r => setRows(r.data.rows ?? [])).catch(() => setRows([]));
  }, []);

  return (
    <Box>
      <Heading size="lg" mb={4}>Transaction History</Heading>
      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" overflow="hidden">
        <Table variant="simple" size="sm">
          <Thead bg="rgba(255,255,255,0.05)">
            <Tr>
              <Th color="whiteAlpha.800">Date</Th>
              <Th color="whiteAlpha.800">Amount</Th>
              <Th color="whiteAlpha.800">Coins</Th>
              <Th color="whiteAlpha.800">Notes</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(r => (
              <Tr key={r.id}>
                <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                <Td>{r.amount ?? "-"}</Td>
                <Td>{r.coins ?? "-"}</Td>
                <Td>{r.notes ?? "-"}</Td>
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

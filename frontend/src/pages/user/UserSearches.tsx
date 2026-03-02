import React, { useEffect, useState } from "react";
import { Box, Heading, Table, Tbody, Td, Th, Thead, Tr, Tag, Text } from "@chakra-ui/react";
import { api } from "../../app/api";

export default function UserSearches() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api.get("/me/search-history?limit=30").then(r => setRows(r.data.rows ?? [])).catch(() => setRows([]));
  }, []);

  return (
    <Box>
      <Heading size="lg" mb={4}>My Searches</Heading>
      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="18px" overflow="hidden">
        <Table variant="simple" size="sm">
          <Thead bg="rgba(255,255,255,0.05)">
            <Tr>
              <Th color="whiteAlpha.800">Date</Th>
              <Th color="whiteAlpha.800">Query</Th>
              <Th color="whiteAlpha.800">Service</Th>
              <Th color="whiteAlpha.800">Status</Th>
              <Th color="whiteAlpha.800">Cost</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(r => (
              <Tr key={r.id}>
                <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                <Td>{r.query}</Td>
                <Td>{r.service?.name ?? "-"}</Td>
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

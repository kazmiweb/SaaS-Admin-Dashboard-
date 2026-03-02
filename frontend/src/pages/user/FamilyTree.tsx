import React from "react";
import { Box, Button, Heading, HStack, Input, Stack, Text, useToast } from "@chakra-ui/react";
import { api } from "../../app/api";
import FamilyTreeGraph from "./components/FamilyTreeGraph";

export default function FamilyTree() {
  const toast = useToast();
  const [cnic, setCnic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [payload, setPayload] = React.useState<any>(null);

  async function run() {
    const d = cnic.trim().replace(/[^0-9]/g, "");
    if (d.length !== 13) {
      toast({ status: "error", title: "CNIC must be 13 digits", position: "top" });
      return;
    }
    setLoading(true);
    setPayload(null);
    try {
      const res = await api.get("/search/family-tree", { params: { cnic: d } });
      setPayload(res.data);
      toast({ status: "success", title: "Family tree loaded", position: "top" });
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message || "Search failed", position: "top" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box>
      <Heading size="lg" mb={4}>
        Mix Family Tree
      </Heading>
      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <HStack flexWrap="wrap" gap={3}>
            <Input
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              placeholder="Enter CNIC (13 digits)"
              size="lg"
              borderRadius="16px"
              bg="rgba(0,0,0,0.25)"
              border="1px solid rgba(255,255,255,0.12)"
              _placeholder={{ color: "whiteAlpha.600" }}
              maxW={{ base: "100%", md: "420px" }}
            />
            <Button colorScheme="blue" borderRadius="999px" size="lg" onClick={run} isLoading={loading}>
              Search
            </Button>
            <Button variant="outline" borderRadius="999px" size="lg" onClick={() => setCnic("")}
              isDisabled={loading}
            >
              Clear
            </Button>
          </HStack>

          {!payload ? (
            <Box pt={8} pb={6} textAlign="center">
              <Text opacity={0.8}>Enter a CNIC to render the family tree graph.</Text>
            </Box>
          ) : (
            <FamilyTreeGraph payload={payload} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

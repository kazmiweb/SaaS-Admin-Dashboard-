import React from "react";
import { Box, Button, Heading, Input, Stack, Text, useToast } from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { issueSearchToken } from "../../app/searchToken";
import { getDashboardUi } from "../../dashboard/uiTokens";
import FamilyTreeGraph from "./components/FamilyTreeGraph";

export default function FamilyTree() {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
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
      const searchToken = await issueSearchToken();
      const res = await api.get("/search/family-tree", { params: { cnic: d }, headers: { "x-search-token": searchToken } });
      setPayload(res.data);
      toast({ status: "success", title: "Family tree loaded", position: "top" });
    } catch (e: any) {
      toast({ status: "error", title: e?.response?.data?.message || "Search failed", position: "top" });
    } finally {
      setLoading(false);
    }
  }

  async function copyGraph() {
    if (!payload) return;
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast({ status: "success", title: "Family tree data copied", position: "top" });
  }

  return (
    <Box color={ui.text.primary}>
      <Heading size="lg" mb={4}>
        Mix Family Tree
      </Heading>
      <Text opacity={0.85} mb={4}>
        Enter your CNIC to view family records with details and pictures.
      </Text>
      <Box bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="22px" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Input
            value={cnic}
            onChange={(e) => setCnic(e.target.value)}
            placeholder="Enter CNIC (13 digits)"
            size="lg"
            borderRadius="16px"
            bg={ui.surface.input}
            border={`1px solid ${ui.surface.inputBorder}`}
            color={ui.text.primary}
            _placeholder={{ color: ui.text.muted }}
            maxW={{ base: "100%", md: "420px" }}
          />
          <Stack direction={{ base: "column", md: "row" }} spacing={3}>
            <Button colorScheme="blue" borderRadius="999px" size="lg" onClick={run} isLoading={loading}>
              Search
            </Button>
            <Button variant="outline" borderRadius="999px" size="lg" onClick={() => setCnic("")} isDisabled={loading}>
              Clear
            </Button>
            {payload ? (
              <Button colorScheme="green" borderRadius="999px" size="lg" onClick={copyGraph}>
                Copy Raw Data
              </Button>
            ) : null}
          </Stack>

          {!payload ? (
            <Box pt={8} pb={6} textAlign="center">
              <Text opacity={0.8}>Enter your CNIC to load family records.</Text>
            </Box>
          ) : (
            <FamilyTreeGraph payload={payload} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

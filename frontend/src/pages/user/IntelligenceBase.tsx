import React from "react";
import {
  Box,
  Button,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
  HStack,
  Tag,
  TagLabel,
  Skeleton,
} from "@chakra-ui/react";
import { api } from "../../app/api";
import ResultsView from "./components/ResultsView";

type UnifiedResult = { apiId: string; apiName: string; ok: boolean; data?: any; error?: string };

export default function IntelligenceBase({
  title,
  placeholder,
  validate,
  normalizeForBackend,
}: {
  title: string;
  placeholder: string;
  validate: (raw: string) => string | null; // return error msg or null
  normalizeForBackend?: (raw: string) => string;
}) {
  const toast = useToast();
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [detectedType, setDetectedType] = React.useState<string>("");
  const [querySent, setQuerySent] = React.useState<string>("");
  const [results, setResults] = React.useState<UnifiedResult[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);

  async function run() {
    const err = validate(value);
    if (err) {
      toast({ status: "error", title: err, position: "top" });
      return;
    }
    const q = normalizeForBackend ? normalizeForBackend(value) : value.trim();
    setLoading(true);
    setBlocked(null);
    setResults([]);
    try {
      const res = await api.get("/search/unified", { params: { query: q } });
      setDetectedType(res.data.detectedType ?? "");
      setQuerySent(res.data.querySent ?? q);
      setResults(res.data.results ?? []);
      toast({ status: "success", title: "Search complete", position: "top" });
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Search failed";
      if (e?.response?.data?.code === "NO_CREDITS") {
        setBlocked(msg);
      } else {
        toast({ status: "error", title: msg, position: "top" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf() {
    const q = querySent || (normalizeForBackend ? normalizeForBackend(value) : value.trim());
    const res = await api.post("/export/pdf", { title: "Elookup Report", query: q, detectedType: detectedType || "CUSTOM", results }, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${q || "report"}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <Box>
      <HStack justify="space-between" flexWrap="wrap" gap={3} mb={6}>
        <Box>
          <Heading size="lg">{title}</Heading>
          <Text opacity={0.8} mt={1}>
            Enter exact details to retrieve official records.
          </Text>
        </Box>
        <Tag colorScheme="blue" borderRadius="999px" px={4} py={2}>
          <TagLabel>Secure Intelligence Search</TagLabel>
        </Tag>
      </HStack>

      <Box bg="rgba(255,255,255,0.06)" border="1px solid rgba(255,255,255,0.08)" borderRadius="22px" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            size="lg"
            borderRadius="16px"
            bg="rgba(0,0,0,0.25)"
            border="1px solid rgba(255,255,255,0.12)"
            _placeholder={{ color: "whiteAlpha.600" }}
          />

          <HStack flexWrap="wrap" gap={3}>
            <Button colorScheme="blue" borderRadius="999px" size="lg" onClick={run} isLoading={loading}>
              🔍 Search Record
            </Button>
            <Button variant="outline" borderRadius="999px" size="lg" onClick={() => setValue("")}>
              Clear
            </Button>
          </HStack>

          {blocked ? (
            <Box bg="rgba(255,215,0,0.12)" border="1px solid rgba(255,215,0,0.25)" borderRadius="16px" p={4}>
              <Text fontWeight="700">⚠️ You have zero credit. Please contact admin</Text>
              <Text mt={1} opacity={0.9}>{blocked}</Text>
            </Box>
          ) : null}

          {loading ? (
            <Stack spacing={3} mt={4}>
              <Skeleton height="24px" borderRadius="10px" />
              <Skeleton height="140px" borderRadius="16px" />
              <Skeleton height="140px" borderRadius="16px" />
            </Stack>
          ) : null}

          {!loading && results.length ? <ResultsView query={querySent || value} results={results} onExportPdf={exportPdf} /> : null}
        </Stack>
      </Box>
    </Box>
  );
}

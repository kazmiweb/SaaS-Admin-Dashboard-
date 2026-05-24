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
import { useTheme as useMuiTheme } from "@mui/material";
import { api } from "../../app/api";
import { issueSearchToken } from "../../app/searchToken";
import { getDashboardUi } from "../../dashboard/uiTokens";
import ResultsView from "./components/ResultsView";
import { downloadClientPdf } from "../../utils/export";
import { isRenderableResult, normalizeResultData } from "./components/merge";

type UnifiedResult = { apiId: string; apiName: string; ok: boolean; data?: any; error?: string };

const MAX_EXPORT_DEPTH = 4;
const MAX_EXPORT_ARRAY = 40;
const MAX_EXPORT_OBJECT_KEYS = 80;
const MAX_EXPORT_TEXT = 600;

function sanitizeForPdfExport(input: unknown, depth = 0): unknown {
  if (depth > MAX_EXPORT_DEPTH) return undefined;
  if (input == null) return input;

  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return "";
    if (/^data:image\//i.test(text)) return undefined;
    if (text.length > MAX_EXPORT_TEXT && /^[A-Za-z0-9+/=\s]+$/.test(text)) return undefined;
    return text.length > MAX_EXPORT_TEXT ? `${text.slice(0, MAX_EXPORT_TEXT)}...` : text;
  }

  if (typeof input === "number" || typeof input === "boolean") return input;

  if (Array.isArray(input)) {
    return input
      .slice(0, MAX_EXPORT_ARRAY)
      .map((item) => sanitizeForPdfExport(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    let used = 0;
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (/image|photo|picture|avatar|pic|img/i.test(key)) continue;
      const next = sanitizeForPdfExport(value, depth + 1);
      if (next === undefined) continue;
      out[key] = next;
      used += 1;
      if (used >= MAX_EXPORT_OBJECT_KEYS) break;
    }
    return out;
  }

  return undefined;
}

export default function IntelligenceBase({
  title,
  placeholder,
  validate,
  normalizeForBackend,
  description = "Enter exact details to retrieve official records.",
  badgeLabel = "Secure Intelligence Search",
  searchLabel = "Search Record",
  clearLabel = "Clear Record",
  resultsActions = "none",
  extraFields,
  buildRequestParams,
  showHeader = true,
  serviceName,
}: {
  title: string;
  placeholder: string;
  validate: (raw: string) => string | null; // return error msg or null
  normalizeForBackend?: (raw: string) => string;
  description?: string;
  badgeLabel?: string | null;
  searchLabel?: string;
  clearLabel?: string;
  resultsActions?: "default" | "single-pdf" | "none";
  extraFields?: React.ReactNode;
  buildRequestParams?: (normalizedQuery: string) => Record<string, unknown>;
  showHeader?: boolean;
  serviceName?: string;
}) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const toast = useToast();
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);
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
      const searchToken = await issueSearchToken();
      const res = await api.get("/search/unified", {
        params: {
          query: q,
          ...(serviceName ? { serviceName } : {}),
          ...(buildRequestParams ? buildRequestParams(q) : {}),
        },
        headers: { "x-search-token": searchToken },
      });
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
    const printableResults = results
      .filter(isRenderableResult)
      .map((item) => ({
        apiId: item.apiId,
        apiName: item.apiName,
        ok: item.ok,
        data: sanitizeForPdfExport(normalizeResultData(item.data)),
      }));
    downloadClientPdf({
      filename: `${q || "report"}.pdf`,
      title: "Trace Verisys Intelligence Report",
      subtitle: `Query: ${q}`,
      sections: printableResults.map((item) => ({
        heading: item.apiName,
        rows: Array.isArray(item.data) ? item.data : [item.data],
      })),
    });
  }

  function clearSearch() {
    setValue("");
    setQuerySent("");
    setResults([]);
    setBlocked(null);
  }

  return (
    <Box color={ui.text.primary}>
      {showHeader ? (
        <HStack justify="space-between" flexWrap="wrap" gap={3} mb={6}>
          <Box>
            <Heading size="lg">{title}</Heading>
            {description ? (
              <Text opacity={0.8} mt={1}>
                {description}
              </Text>
            ) : null}
          </Box>
          {badgeLabel ? (
            <Tag colorScheme="blue" borderRadius="999px" px={4} py={2}>
              <TagLabel>{badgeLabel}</TagLabel>
            </Tag>
          ) : null}
        </HStack>
      ) : null}

      <Box bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="22px" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            size="lg"
            borderRadius="16px"
            bg={ui.surface.input}
            border={`1px solid ${ui.surface.inputBorder}`}
            color={ui.text.primary}
            _placeholder={{ color: ui.text.muted }}
          />

          {extraFields}

          <HStack flexWrap="wrap" gap={3}>
            <Button colorScheme="blue" borderRadius="999px" size="lg" onClick={run} isLoading={loading}>
              {searchLabel}
            </Button>
            <Button variant="outline" colorScheme="red" borderRadius="999px" size="lg" onClick={clearSearch} isDisabled={loading}>
              {clearLabel}
            </Button>
            {resultsActions === "single-pdf" && results.length ? (
              <Button colorScheme="green" borderRadius="999px" size="lg" onClick={exportPdf}>
                Download PDF
              </Button>
            ) : null}
          </HStack>

          {blocked ? (
            <Box bg={ui.status.warningBg} border={`1px solid ${ui.status.warningBorder}`} borderRadius="16px" p={4}>
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

          {!loading && results.length ? (
            <ResultsView
              query={querySent || value}
              results={results}
              onExportPdf={exportPdf}
              actionsVariant={resultsActions}
              serviceName={serviceName}
            />
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

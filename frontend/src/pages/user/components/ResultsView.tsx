import React from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { getDashboardUi } from "../../../dashboard/uiTokens";
import { collectImages, isRenderableResult, normalizeResultData, UnifiedResult } from "./merge";
import { downloadClientPdf, downloadCsv } from "../../../utils/export";

type DisplayField = { label: string; value: string };
type ApiRecord = { index: number; fields: DisplayField[]; images: string[]; raw: any };
type ApiCard = { key: string; apiName: string; records: ApiRecord[] };

const hiddenKeys = new Set([
  "status",
  "message",
  "error",
  "errors",
  "success",
  "ok",
  "type",
  "query",
  "query_sent",
  "querysent",
  "result_count",
  "count",
  "raw",
]);

function normalizeKey(key: string) {
  return key.replace(/[\s_-]+/g, "").toLowerCase();
}

function prettifyLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).filter(Boolean).join("\n");
  }
  return "";
}

function shouldHideValue(value: unknown) {
  const text = normalizeValue(value).toLowerCase();
  if (!text) return true;
  return (
    text === "0"
    || text === "null"
    || text === "undefined"
    || text === "n/a"
    || text === "na"
    || text === "none"
    || text === "no"
    || text.includes("no record")
    || text.includes("no records")
    || text.includes("no data")
    || text.includes("not found")
    || text.includes("empty")
  );
}

function isImageValue(key: string, value: unknown) {
  if (typeof value !== "string") return false;
  const normalized = normalizeKey(key);
  if (!/image|photo|picture|avatar|pic|img/i.test(normalized)) return false;
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

function collectDisplayFields(data: any, prefix = ""): DisplayField[] {
  if (!data || typeof data !== "object") return [];
  const fields: DisplayField[] = [];

  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = normalizeKey(key);
    if (hiddenKeys.has(normalizedKey) || isImageValue(key, value)) continue;

    const label = prefix ? `${prefix} ${prettifyLabel(key)}` : prettifyLabel(key);

    if (Array.isArray(value)) {
      if (value.every((item) => item && typeof item === "object")) {
        value.forEach((item, idx) => {
          fields.push(...collectDisplayFields(item, `${label} Record #${idx + 1}`));
        });
        continue;
      }

      const printable = normalizeValue(value);
      if (!shouldHideValue(printable)) fields.push({ label, value: printable });
      continue;
    }

    if (value && typeof value === "object") {
      fields.push(...collectDisplayFields(value, label));
      continue;
    }

    const printable = normalizeValue(value);
    if (!shouldHideValue(printable)) fields.push({ label, value: printable });
  }

  return fields;
}

function extractRecords(payload: any): any[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
  }

  return [payload];
}

function buildApiCards(results: UnifiedResult[]): ApiCard[] {
  return results
    .filter(isRenderableResult)
    .map((result) => {
      const normalized = normalizeResultData(result.data);
      const records = extractRecords(normalized)
        .map((raw, idx) => {
          const fields = collectDisplayFields(raw);
          const images = collectImages(raw).filter((src) => /^data:image\//i.test(src) || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src));
          if (!fields.length && !images.length) return null;
          return { index: idx + 1, fields, images, raw } satisfies ApiRecord;
        })
        .filter((item): item is ApiRecord => Boolean(item));

      return {
        key: `${result.apiId}:${result.apiName}`,
        apiName: result.apiName,
        records,
      } satisfies ApiCard;
    })
    .filter((item) => item.records.length > 0);
}

function ImageStrip({ images }: { images: string[] }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [active, setActive] = React.useState<string | null>(null);

  return (
    <>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2.5} mb={2.5}>
        {images.slice(0, 4).map((src) => (
          <Box
            key={src}
            borderRadius="12px"
            overflow="hidden"
            cursor="pointer"
            border={`1px solid ${ui.surface.border}`}
            onClick={() => {
              setActive(src);
              onOpen();
            }}
          >
            <Image src={src} alt="Record evidence" objectFit="cover" w="full" h="120px" />
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={ui.surface.overlay} border={`1px solid ${ui.surface.borderStrong}`}>
          <ModalBody p={3}>{active ? <Image src={active} alt="Record evidence" w="full" borderRadius="10px" /> : null}</ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

export default function ResultsView({
  query,
  results,
  onExportPdf,
  actionsVariant = "default",
}: {
  query: string;
  results: UnifiedResult[];
  onExportPdf?: () => void;
  actionsVariant?: "default" | "single-pdf" | "none";
}) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const cards = React.useMemo(() => buildApiCards(results), [results]);

  if (!cards.length) {
    return (
      <Text textAlign="center" color={ui.text.secondary} fontWeight="700" mt={10}>
        No records found.
      </Text>
    );
  }

  return (
    <Stack spacing={4} mt={6} color={ui.text.primary}>
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={2.5}>
        <Heading size="sm">Results ({cards.reduce((acc, item) => acc + item.records.length, 0)} records)</Heading>
        {actionsVariant === "default" ? (
          <HStack spacing={2} flexWrap="wrap">
            {onExportPdf ? (
              <Button colorScheme="green" borderRadius="999px" size="sm" onClick={onExportPdf}>
                Download PDF
              </Button>
            ) : null}
            <Button
              borderRadius="999px"
              size="sm"
              onClick={() =>
                downloadClientPdf({
                  filename: `${query || "elookup"}-client.pdf`,
                  title: "Elookup Intelligence Report",
                  subtitle: `Query: ${query}`,
                  sections: cards.map((card) => ({
                    heading: card.apiName,
                    rows: card.records.map((record) => ({ record: record.index, ...record.raw })),
                  })),
                  rawJson: results,
                })
              }
            >
              Client PDF
            </Button>
            <Button
              borderRadius="999px"
              size="sm"
              onClick={() =>
                downloadCsv(
                  `${query || "elookup"}-results.csv`,
                  cards.flatMap((card) => card.records.map((record) => ({ apiName: card.apiName, record: record.index, ...record.raw }))),
                )
              }
            >
              CSV
            </Button>
          </HStack>
        ) : null}
      </HStack>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4}>
        {cards.map((card) => (
          <Box
            key={card.key}
            bg={ui.surface.card}
            border={`1px solid ${ui.surface.borderStrong}`}
            borderRadius="14px"
            p={3}
            boxShadow={muiTheme.palette.mode === "dark" ? "0 14px 34px rgba(2,6,23,0.28)" : "0 10px 24px rgba(15,23,42,0.08)"}
          >
            <HStack justify="space-between" align="start" mb={2.5} gap={2}>
              <Box minW={0}>
                <Heading size="xs" mb={1} noOfLines={1}>
                  {card.apiName}
                </Heading>
                <Text fontSize="xs" color={ui.text.muted}>
                  {card.records.length} record{card.records.length > 1 ? "s" : ""} from this API
                </Text>
              </Box>
              <Badge
                borderRadius="999px"
                px={2.5}
                py={1}
                fontSize="10px"
                letterSpacing="0.05em"
                textTransform="uppercase"
                bg={muiTheme.palette.mode === "dark" ? "rgba(96,165,250,0.24)" : "rgba(191,219,254,0.95)"}
                color={ui.text.primary}
                border={`1px solid ${ui.surface.borderStrong}`}
              >
                Source
              </Badge>
            </HStack>

            <Stack spacing={2.5}>
              {card.records.map((record) => (
                <Box key={`${card.key}-${record.index}`} bg={ui.surface.input} border={`1px solid ${ui.surface.border}`} borderRadius="12px" p={2.5}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.08em" fontWeight="700">
                      Record #{record.index}
                    </Text>
                    {actionsVariant === "default" ? (
                      <Button
                        borderRadius="999px"
                        colorScheme="green"
                        size="xs"
                        onClick={() =>
                          downloadClientPdf({
                            filename: `${query || "elookup"}-${card.apiName.replace(/\s+/g, "-")}-record-${record.index}.pdf`,
                            title: `Elookup ${card.apiName} Record #${record.index}`,
                            subtitle: `Query: ${query}`,
                            sections: [{ heading: card.apiName, rows: [{ record: record.index, ...record.raw }] }],
                            rawJson: record.raw,
                          })
                        }
                      >
                        PDF
                      </Button>
                    ) : null}
                  </HStack>

                  {record.images.length ? <ImageStrip images={record.images} /> : null}

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                    {record.fields.map((field) => (
                      <Box key={`${card.key}-${record.index}-${field.label}`} bg={ui.surface.card} border={`1px solid ${ui.surface.border}`} borderRadius="10px" px={2.5} py={2}>
                        <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" mb={1}>
                          {field.label}
                        </Text>
                        <Text fontSize="xs" fontWeight="700" lineHeight="1.45" whiteSpace="pre-wrap" wordBreak="break-word">
                          {field.value}
                        </Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
              ))}
            </Stack>

            <Divider my={3} borderColor={ui.surface.borderStrong} />
            <Text fontSize="11px" color={ui.text.muted}>
              Query: <Text as="span" color={ui.text.secondary}>{query}</Text>
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

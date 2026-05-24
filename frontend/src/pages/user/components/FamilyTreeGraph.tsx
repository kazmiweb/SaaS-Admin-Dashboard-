import React from "react";
import {
  Box,
  HStack,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalOverlay,
  Stack,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { getDashboardUi } from "../../../dashboard/uiTokens";
import { collectImages } from "./merge";

type FamilyRecord = {
  name: string;
  cnic: string;
  fatherName: string;
  fatherCnic: string;
  dateOfBirth: string;
  relationship: string;
  image: string;
};

function emptyRecord(): FamilyRecord {
  return {
    name: "",
    cnic: "",
    fatherName: "",
    fatherCnic: "",
    dateOfBirth: "",
    relationship: "",
    image: "",
  };
}

function normalizeLooseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function extractCnic(value: string): string {
  const digits = value.replace(/\D/g, "");
  const match = digits.match(/\d{13}/);
  return match ? match[0] : value.trim();
}

function sanitizeImageSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) {
    const compact = trimmed.replace(/\s+/g, "");
    const match = compact.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    return match ? match[0] : compact;
  }
  return "";
}

function isLikelyHtml(value: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (lower.includes("<div") || lower.includes("<img")) && lower.includes("cnic");
}

function assignField(record: FamilyRecord, labelRaw: string, valueRaw: string) {
  const label = normalizeLooseKey(labelRaw);
  const value = cleanValue(valueRaw);
  if (!label || !value) return;

  if (label.includes("fathercnic") || (label.includes("father") && label.includes("cnic"))) {
    record.fatherCnic = extractCnic(value);
    return;
  }

  if (label.includes("fathername") || (label.includes("father") && label.includes("name"))) {
    record.fatherName = value;
    return;
  }

  if (label === "cnic" || label.endsWith("cnic")) {
    record.cnic = extractCnic(value);
    return;
  }

  if (label === "dob" || label.includes("dateofbirth") || label.includes("birthdate")) {
    record.dateOfBirth = value;
    return;
  }

  if (label.includes("relationship") || label.includes("relation")) {
    record.relationship = value;
    return;
  }

  if (label === "name" || (label.includes("name") && !label.includes("father"))) {
    record.name = value;
  }
}

function recordHasVisibleData(record: FamilyRecord) {
  return Boolean(
    record.name
      || record.cnic
      || record.fatherName
      || record.fatherCnic
      || record.dateOfBirth
      || record.relationship
      || record.image,
  );
}

function extractFieldPairsFromElement(element: Element): Array<[string, string]> {
  const nodes = Array.from(element.querySelectorAll("p"));
  const pairs: Array<[string, string]> = [];

  for (let idx = 0; idx + 1 < nodes.length; idx += 2) {
    const label = cleanValue(nodes[idx]?.textContent ?? "");
    const value = cleanValue(nodes[idx + 1]?.textContent ?? "");
    if (!label || !value) continue;
    pairs.push([label, value]);
  }

  return pairs;
}

function hasCoreFamilyLabels(pairs: Array<[string, string]>) {
  const labels = pairs.map(([label]) => normalizeLooseKey(label));
  const hasName = labels.some((label) => label === "name" || (label.includes("name") && !label.includes("father")));
  const hasCnic = labels.some((label) => label === "cnic" || label.endsWith("cnic"));
  return hasName && hasCnic;
}

function parseRecordsFromHtml(html: string): FamilyRecord[] {
  if (!isLikelyHtml(html) || typeof DOMParser === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const out: FamilyRecord[] = [];
  const containers = new Set<Element>();

  Array.from(doc.querySelectorAll("img")).forEach((img) => {
    const src = sanitizeImageSrc(img.getAttribute("src") ?? "");
    let current: Element | null = img;

    while (current) {
      const pairs = extractFieldPairsFromElement(current);
      if (pairs.length >= 3 && hasCoreFamilyLabels(pairs)) {
        const record = emptyRecord();
        pairs.forEach(([label, value]) => assignField(record, label, value));
        if (src) record.image = src;

        if (!containers.has(current) && recordHasVisibleData(record)) {
          containers.add(current);
          out.push(record);
        }
        break;
      }
      current = current.parentElement;
    }
  });

  if (!out.length) {
    const pairs = extractFieldPairsFromElement(doc.body);
    if (pairs.length) {
      let current = emptyRecord();
      pairs.forEach(([label, value]) => {
        const labelKey = normalizeLooseKey(label);
        if ((labelKey === "cnic" || labelKey.endsWith("cnic")) && current.cnic && recordHasVisibleData(current)) {
          out.push(current);
          current = emptyRecord();
        }
        assignField(current, label, value);
      });
      if (recordHasVisibleData(current)) out.push(current);
    }
  }

  return out;
}

function looksLikeFamilyRecordObject(value: Record<string, unknown>) {
  const keys = Object.keys(value).map((key) => normalizeLooseKey(key));
  const hasName = keys.some((key) => key === "name" || (key.includes("name") && !key.includes("father")));
  const hasCnic = keys.some((key) => key === "cnic" || key.endsWith("cnic"));
  const hasFather = keys.some((key) => key.includes("father"));
  const hasDob = keys.some((key) => key === "dob" || key.includes("dateofbirth") || key.includes("birthdate"));
  const hasRelation = keys.some((key) => key.includes("relationship") || key.includes("relation"));
  const score = [hasName, hasCnic, hasFather, hasDob, hasRelation].filter(Boolean).length;
  return score >= 2 && (hasName || hasCnic);
}

function collectFamilyObjects(node: unknown, out: Array<Record<string, unknown>>, visited: Set<object>) {
  if (!node || typeof node !== "object") return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    node.forEach((item) => collectFamilyObjects(item, out, visited));
    return;
  }

  const obj = node as Record<string, unknown>;
  if (looksLikeFamilyRecordObject(obj)) out.push(obj);
  Object.values(obj).forEach((value) => collectFamilyObjects(value, out, visited));
}

function collectHtmlSnippets(node: unknown, out: Set<string>, visited: Set<object>) {
  if (typeof node === "string") {
    if (isLikelyHtml(node)) out.add(node);
    return;
  }

  if (!node || typeof node !== "object") return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    node.forEach((item) => collectHtmlSnippets(item, out, visited));
    return;
  }

  Object.values(node as Record<string, unknown>).forEach((value) => collectHtmlSnippets(value, out, visited));
}

function mapObjectToRecord(value: Record<string, unknown>): FamilyRecord {
  const record = emptyRecord();

  Object.entries(value).forEach(([key, entry]) => {
    if (entry == null) return;

    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      assignField(record, key, cleanValue(entry));
      return;
    }

    if (Array.isArray(entry)) {
      const primitiveValues = entry.filter((item) => ["string", "number", "boolean"].includes(typeof item));
      if (primitiveValues.length) assignField(record, key, primitiveValues.map((item) => cleanValue(item)).join(", "));
      return;
    }

    if (typeof entry === "object") {
      Object.entries(entry as Record<string, unknown>).forEach(([childKey, childValue]) => {
        if (typeof childValue === "string" || typeof childValue === "number" || typeof childValue === "boolean") {
          assignField(record, `${key} ${childKey}`, cleanValue(childValue));
        }
      });
    }
  });

  const firstImage = collectImages(value)
    .map((image) => sanitizeImageSrc(image))
    .find((image) => Boolean(image));
  if (firstImage) record.image = firstImage;

  return record;
}

function mergeRecords(existing: FamilyRecord, incoming: FamilyRecord): FamilyRecord {
  return {
    name: existing.name || incoming.name,
    cnic: existing.cnic || incoming.cnic,
    fatherName: existing.fatherName || incoming.fatherName,
    fatherCnic: existing.fatherCnic || incoming.fatherCnic,
    dateOfBirth: existing.dateOfBirth || incoming.dateOfBirth,
    relationship: existing.relationship || incoming.relationship,
    image: existing.image || incoming.image,
  };
}

function dedupeRecords(records: FamilyRecord[]) {
  const map = new Map<string, FamilyRecord>();

  records.forEach((record) => {
    if (!recordHasVisibleData(record)) return;
    const key = [
      record.cnic.toLowerCase(),
      record.name.toLowerCase(),
      record.dateOfBirth.toLowerCase(),
      record.relationship.toLowerCase(),
      record.fatherCnic.toLowerCase(),
      record.fatherName.toLowerCase(),
    ].join("|");

    const signature = key || record.image.toLowerCase();
    const existing = map.get(signature);
    if (!existing) {
      map.set(signature, { ...record });
      return;
    }

    map.set(signature, mergeRecords(existing, record));
  });

  return Array.from(map.values());
}

function extractFamilyRecords(payload: any): FamilyRecord[] {
  const roots: any[] = [];

  if (Array.isArray(payload?.results)) {
    payload.results.forEach((result: any) => {
      if (result?.ok === false) return;
      roots.push(result?.data ?? result);
    });
  } else {
    roots.push(payload?.data ?? payload);
  }

  const objectCandidates: Array<Record<string, unknown>> = [];
  const htmlSnippets = new Set<string>();

  roots.forEach((root) => {
    collectFamilyObjects(root, objectCandidates, new Set());
    collectHtmlSnippets(root, htmlSnippets, new Set());
    if (typeof root === "string" && isLikelyHtml(root)) htmlSnippets.add(root);
  });

  const fromObjects = objectCandidates.map((candidate) => mapObjectToRecord(candidate));
  const fromHtml = Array.from(htmlSnippets).flatMap((snippet) => parseRecordsFromHtml(snippet));
  const merged = dedupeRecords([...fromHtml, ...fromObjects]);

  return merged.filter((record) => record.name || record.cnic || record.relationship || record.dateOfBirth || record.image);
}

function fatherSummary(records: FamilyRecord[]) {
  const fatherName = records.find((record) => record.fatherName)?.fatherName ?? "-";
  const fatherCnic = records.find((record) => record.fatherCnic)?.fatherCnic ?? "-";
  return { fatherName, fatherCnic };
}

function FamilyImagePreview({ image, name }: { image: string; name: string }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const hasImage = Boolean(image);

  return (
    <>
      <Box
        w={{ base: "104px", md: "118px" }}
        minW={{ base: "104px", md: "118px" }}
        h={{ base: "104px", md: "118px" }}
        borderRadius="12px"
        overflow="hidden"
        border={`1px solid ${ui.surface.borderStrong}`}
        bg={ui.surface.input}
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor={hasImage ? "zoom-in" : "default"}
        onClick={hasImage ? onOpen : undefined}
        role={hasImage ? "button" : undefined}
      >
        {hasImage ? (
          <Image src={image} alt={`${name || "Record"} profile`} objectFit="cover" w="100%" h="100%" />
        ) : (
          <Text fontSize="10px" textTransform="uppercase" color={ui.text.muted} letterSpacing="0.05em" fontWeight="700">
            No Image
          </Text>
        )}
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={ui.surface.overlay} border={`1px solid ${ui.surface.borderStrong}`}>
          <ModalBody p={3}>{hasImage ? <Image src={image} alt={`${name || "Record"} profile`} w="full" borderRadius="10px" /> : null}</ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

export default function FamilyTreeGraph({ payload }: { payload: any }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const records = React.useMemo(() => extractFamilyRecords(payload), [payload]);

  if (!records.length) {
    return (
      <Box py={12} textAlign="center">
        <Text fontWeight="800" fontSize="lg">No family records found</Text>
        <Text opacity={0.75} mt={2}>No details were detected in the Family Tree response.</Text>
      </Box>
    );
  }

  const father = fatherSummary(records);

  return (
    <Stack spacing={3} pt={2}>
      <Box
        border={`1px solid ${ui.surface.borderStrong}`}
        borderRadius="14px"
        px={{ base: 3, md: 4 }}
        py={{ base: 2.5, md: 3 }}
        bg={ui.surface.card}
      >
        <HStack spacing={2} flexWrap="wrap">
          <Text fontSize="12px" textTransform="uppercase" letterSpacing="0.05em" color={ui.text.muted} fontWeight="700">
            Father Name:
          </Text>
          <Text fontSize="13px" fontWeight="800">{father.fatherName}</Text>
          <Text fontSize="12px" color={ui.text.muted}>,</Text>
          <Text fontSize="12px" textTransform="uppercase" letterSpacing="0.05em" color={ui.text.muted} fontWeight="700">
            Father CNIC:
          </Text>
          <Text fontSize="13px" fontWeight="800">{father.fatherCnic}</Text>
        </HStack>
      </Box>

      {records.map((record, index) => (
        <Box
          key={`${record.cnic || record.name || "record"}-${index}`}
          border={`1px solid ${ui.surface.borderStrong}`}
          borderRadius="14px"
          px={{ base: 3, md: 4 }}
          py={{ base: 3, md: 3.5 }}
          bg={ui.surface.card}
        >
          <Stack direction={{ base: "column", md: "row" }} align={{ base: "flex-start", md: "flex-start" }} justify="space-between" spacing={4}>
            <Stack spacing={1} flex="1" minW={0}>
              <Text
                fontSize={{ base: "10px", md: "11px" }}
                textTransform="uppercase"
                letterSpacing="0.06em"
                color={ui.text.muted}
                fontWeight="800"
                lineHeight="1.35"
              >
                Record {index + 1}
              </Text>
              <Text fontSize={{ base: "13px", md: "14px" }} fontWeight="800" lineHeight="1.35">
                Name: {record.name || "-"}
              </Text>
              <Text fontSize={{ base: "12px", md: "13px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary}>
                CNIC: {record.cnic || "-"}
              </Text>
              <Text fontSize={{ base: "12px", md: "13px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary}>
                Date of Birth: {record.dateOfBirth || "-"}
              </Text>
              <Text fontSize={{ base: "12px", md: "13px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary}>
                Relationship: {record.relationship || "-"}
              </Text>
            </Stack>

            <FamilyImagePreview image={record.image} name={record.name} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

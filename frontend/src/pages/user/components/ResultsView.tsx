import React from "react";
import {
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
  useBreakpointValue,
  useDisclosure,
} from "@chakra-ui/react";
import { useTheme as useMuiTheme } from "@mui/material";
import { getDashboardUi } from "../../../dashboard/uiTokens";
import { collectImages, isRenderableResult, normalizeResultData, UnifiedResult } from "./merge";
import { downloadClientPdf, downloadCsv } from "../../../utils/export";

type DisplayField = { label: string; value: string };
type ApiRecord = { index: number; fields: DisplayField[]; images: string[]; raw: any; section?: "profile" | "record" };
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

function isLikelyImageSrc(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^data:image\//i.test(trimmed)
    || /^https?:\/\//i.test(trimmed)
    || /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(trimmed)
    || /^(\/|\.\/|uploads\/|upload\/|storage\/|images\/|files\/)/i.test(trimmed);
}

function stripFieldLabelFromValue(label: string, value: string) {
  const normalizedLabel = label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${normalizedLabel}\\s*[:：-]\\s*`, "i");
  return value.trim().replace(pattern, "");
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

function isFamilyTreeHtmlBlob(value: unknown) {
  if (typeof value !== "string") return false;
  const text = value.trim().toLowerCase();
  if (!text) return false;
  return (
    (text.includes("<div") || text.includes("<html") || text.includes("<img"))
    && text.includes("cnic")
    && text.includes("father")
    && (text.includes("data:image") || text.includes("record evidence"))
  );
}

function sanitizeFamilyImageSrc(value: string) {
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
    if (isFamilyTreeHtmlBlob(printable)) continue;
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

function stableSerialize(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join("|")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${stableSerialize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return "";
}

function normalizeLooseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mergeRawData(left: any, right: any): any {
  if (left == null) return right;
  if (right == null) return left;

  if (Array.isArray(left) && Array.isArray(right)) {
    const seen = new Set<string>();
    const out: any[] = [];
    [...left, ...right].forEach((item) => {
      const sig = stableSerialize(item);
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push(item);
    });
    return out;
  }

  if (typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    const out: Record<string, unknown> = { ...left };
    for (const [key, value] of Object.entries(right)) {
      out[key] = mergeRawData((out as any)[key], value);
    }
    return out;
  }

  if (typeof left === "string" && !left.trim() && typeof right === "string") return right;
  return left ?? right;
}

function mergeFieldLists(base: DisplayField[], incoming: DisplayField[]): DisplayField[] {
  const seen = new Set<string>();
  const merged: DisplayField[] = [];
  [...base, ...incoming].forEach((field) => {
    const sig = `${normalizeLooseKey(field.label)}:${normalizeValue(field.value).toLowerCase()}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push(field);
  });
  return merged;
}

function recordSignature(record: ApiRecord): string {
  const fieldSig = record.fields
    .map((field) => `${normalizeLooseKey(field.label)}:${normalizeValue(field.value).toLowerCase()}`)
    .sort()
    .join("|");
  if (fieldSig) return fieldSig;
  if (record.images.length) return `images:${record.images.slice().sort().join("|")}`;
  return stableSerialize(record.raw);
}

function dedupeRecords(records: ApiRecord[]): ApiRecord[] {
  const bySig = new Map<string, ApiRecord>();

  records.forEach((record) => {
    const sig = recordSignature(record);
    const existing = bySig.get(sig);
    if (!existing) {
      bySig.set(sig, { ...record });
      return;
    }

    existing.fields = mergeFieldLists(existing.fields, record.fields);
    existing.images = Array.from(new Set([...existing.images, ...record.images]));
    existing.raw = mergeRawData(existing.raw, record.raw);
  });

  return Array.from(bySig.values()).map((record, index) => ({
    ...record,
    index: index + 1,
  }));
}

function extractCnic(value: string): string | null {
  const match = value.replace(/\D/g, "").match(/\d{13}/);
  return match ? match[0] : null;
}

function isIslamabadExciseService(serviceName?: string) {
  return normalizeLooseKey(serviceName ?? "") === "islamabadexcise";
}

function isPunjabExciseService(serviceName?: string) {
  return normalizeLooseKey(serviceName ?? "") === "punjabexcise";
}

function isKpkExciseService(serviceName?: string) {
  return normalizeLooseKey(serviceName ?? "") === "kpkexcise";
}

function isCnicLookupService(serviceName?: string) {
  return normalizeLooseKey(serviceName ?? "") === "cniclookup";
}

function isIslamabadExciseApi(apiName: string) {
  return normalizeLooseKey(apiName).includes("islamabadexcise");
}

function isPunjabExciseApi(apiName: string) {
  return normalizeLooseKey(apiName).includes("punjabexcise");
}

function isSimDatabaseApi(apiName: string) {
  return normalizeLooseKey(apiName).includes("simdatabase");
}

function isFamilyTreeApi(apiName: string) {
  return normalizeLooseKey(apiName).includes("familytree");
}

function isKpkExciseApi(apiName: string) {
  const normalized = normalizeLooseKey(apiName);
  return normalized.includes("kpk") || normalized.includes("pakhtunkhwa");
}

function isEgadgetApi(apiName: string) {
  const normalized = normalizeLooseKey(apiName);
  return normalized.includes("egadget") || (normalized.includes("gadget") && normalized.includes("imei"));
}

function displayApiName(apiName: string) {
  const normalized = normalizeLooseKey(apiName);
  if (normalized.includes("kpkexciseinternaldastakmvrs")) return "KPK Excise (Vehicles)";
  return apiName;
}

type FamilyTreeRow = {
  name: string;
  cnic: string;
  fatherName: string;
  fatherCnic: string;
  dateOfBirth: string;
  relationship: string;
  image: string;
};

function emptyFamilyTreeRow(): FamilyTreeRow {
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

function assignFamilyTreeField(row: FamilyTreeRow, labelRaw: string, valueRaw: string) {
  const label = normalizeLooseKey(labelRaw);
  const value = normalizeValue(valueRaw);
  if (!label || !value) return;

  if (label.includes("fathercnic") || (label.includes("father") && label.includes("cnic"))) {
    row.fatherCnic = extractCnic(value) ?? value;
    return;
  }
  if (label.includes("fathername") || (label.includes("father") && label.includes("name"))) {
    row.fatherName = value;
    return;
  }
  if (label === "cnic" || label.endsWith("cnic")) {
    row.cnic = extractCnic(value) ?? value;
    return;
  }
  if (label === "dob" || label.includes("dateofbirth") || label.includes("birthdate")) {
    row.dateOfBirth = value;
    return;
  }
  if (label.includes("relationship") || label.includes("relation")) {
    row.relationship = value;
    return;
  }
  if (label === "name" || (label.includes("name") && !label.includes("father"))) {
    row.name = value;
  }
}

function hasFamilyTreeData(row: FamilyTreeRow) {
  return Boolean(
    row.name
    || row.cnic
    || row.fatherName
    || row.fatherCnic
    || row.dateOfBirth
    || row.relationship
    || row.image,
  );
}

function familyTreePairsFromElement(element: Element): Array<[string, string]> {
  const texts = Array.from(element.querySelectorAll("p"));
  const pairs: Array<[string, string]> = [];

  for (let index = 0; index + 1 < texts.length; index += 2) {
    const label = normalizeValue(texts[index]?.textContent ?? "");
    const value = normalizeValue(texts[index + 1]?.textContent ?? "");
    if (!label || !value) continue;
    pairs.push([label, value]);
  }
  return pairs;
}

function parseFamilyTreeRowsFromHtml(html: string): FamilyTreeRow[] {
  if (!isFamilyTreeHtmlBlob(html) || typeof DOMParser === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const out: FamilyTreeRow[] = [];
  const seenContainers = new Set<Element>();

  Array.from(doc.querySelectorAll("img")).forEach((img) => {
    const src = sanitizeFamilyImageSrc(img.getAttribute("src") ?? "");
    let node: Element | null = img;

    while (node) {
      const pairs = familyTreePairsFromElement(node);
      const labels = pairs.map(([label]) => normalizeLooseKey(label));
      const hasName = labels.some((label) => label === "name" || (label.includes("name") && !label.includes("father")));
      const hasCnic = labels.some((label) => label === "cnic" || label.endsWith("cnic"));

      if (pairs.length >= 3 && hasName && hasCnic) {
        if (seenContainers.has(node)) break;
        const row = emptyFamilyTreeRow();
        pairs.forEach(([label, value]) => assignFamilyTreeField(row, label, value));
        if (src) row.image = src;
        if (hasFamilyTreeData(row)) {
          seenContainers.add(node);
          out.push(row);
        }
        break;
      }
      node = node.parentElement;
    }
  });

  return out;
}

function collectFamilyTreeHtml(node: unknown, out: Set<string>, visited: Set<object>) {
  if (typeof node === "string") {
    if (isFamilyTreeHtmlBlob(node)) out.add(node);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    node.forEach((item) => collectFamilyTreeHtml(item, out, visited));
    return;
  }

  Object.values(node as Record<string, unknown>).forEach((item) => collectFamilyTreeHtml(item, out, visited));
}

function looksLikeFamilyTreeObject(record: Record<string, unknown>) {
  const keys = Object.keys(record).map((key) => normalizeLooseKey(key));
  const score = [
    keys.some((key) => key === "name" || (key.includes("name") && !key.includes("father"))),
    keys.some((key) => key === "cnic" || key.endsWith("cnic")),
    keys.some((key) => key.includes("father")),
    keys.some((key) => key === "dob" || key.includes("dateofbirth") || key.includes("birthdate")),
    keys.some((key) => key.includes("relation")),
  ].filter(Boolean).length;
  return score >= 2;
}

function collectFamilyTreeObjects(node: unknown, out: Array<Record<string, unknown>>, visited: Set<object>) {
  if (!node || typeof node !== "object") return;
  if (visited.has(node as object)) return;
  visited.add(node as object);

  if (Array.isArray(node)) {
    node.forEach((item) => collectFamilyTreeObjects(item, out, visited));
    return;
  }

  const record = node as Record<string, unknown>;
  if (looksLikeFamilyTreeObject(record)) out.push(record);
  Object.values(record).forEach((item) => collectFamilyTreeObjects(item, out, visited));
}

function parseFamilyTreeRowObject(record: Record<string, unknown>): FamilyTreeRow {
  const row = emptyFamilyTreeRow();

  Object.entries(record).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      assignFamilyTreeField(row, key, normalizeValue(value));
      return;
    }

    if (Array.isArray(value)) {
      const primitive = value.filter((item) => ["string", "number", "boolean"].includes(typeof item));
      if (primitive.length) assignFamilyTreeField(row, key, primitive.map((item) => normalizeValue(item)).join(", "));
      return;
    }

    if (typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([innerKey, innerValue]) => {
        if (typeof innerValue === "string" || typeof innerValue === "number" || typeof innerValue === "boolean") {
          assignFamilyTreeField(row, `${key} ${innerKey}`, normalizeValue(innerValue));
        }
      });
    }
  });

  const firstImage = collectImages(record)
    .map((src) => sanitizeFamilyImageSrc(src))
    .find((src) => Boolean(src));
  if (firstImage) row.image = firstImage;

  return row;
}

function dedupeFamilyTreeRows(rows: FamilyTreeRow[]) {
  const map = new Map<string, FamilyTreeRow>();

  rows.forEach((row) => {
    if (!hasFamilyTreeData(row)) return;
    const key = [
      row.cnic.toLowerCase(),
      row.name.toLowerCase(),
      row.dateOfBirth.toLowerCase(),
      row.relationship.toLowerCase(),
      row.fatherCnic.toLowerCase(),
      row.fatherName.toLowerCase(),
    ].join("|");
    const signature = key || row.image.toLowerCase();
    const existing = map.get(signature);
    if (!existing) {
      map.set(signature, { ...row });
      return;
    }
    map.set(signature, {
      name: existing.name || row.name,
      cnic: existing.cnic || row.cnic,
      fatherName: existing.fatherName || row.fatherName,
      fatherCnic: existing.fatherCnic || row.fatherCnic,
      dateOfBirth: existing.dateOfBirth || row.dateOfBirth,
      relationship: existing.relationship || row.relationship,
      image: existing.image || row.image,
    });
  });

  return Array.from(map.values());
}

function parseFamilyTreeRowsFromRaw(raw: any) {
  const htmlSnippets = new Set<string>();
  const objectCandidates: Array<Record<string, unknown>> = [];

  collectFamilyTreeHtml(raw, htmlSnippets, new Set());
  collectFamilyTreeObjects(raw, objectCandidates, new Set());

  const fromHtml = Array.from(htmlSnippets).flatMap((snippet) => parseFamilyTreeRowsFromHtml(snippet));
  const fromObjects = objectCandidates.map((item) => parseFamilyTreeRowObject(item));
  return dedupeFamilyTreeRows([...fromHtml, ...fromObjects]).filter((row) => row.name || row.cnic || row.image);
}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("03")) return digits;
  if (digits.length === 12 && digits.startsWith("92")) return `0${digits.slice(2)}`;
  if (digits.length === 13 && digits.startsWith("0092")) return `0${digits.slice(3)}`;
  return null;
}

function extractPhones(value: string): string[] {
  const matches = value.match(/(?:\+?92|0092|0)3\d{9}/g) ?? [];
  return matches
    .map((match) => normalizePhone(match))
    .filter((item): item is string => Boolean(item));
}

function isFatherNameLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("fathername") || (key.includes("father") && key.includes("name"));
}

function isCnicLabel(label: string) {
  return normalizeLooseKey(label).includes("cnic");
}

function isAddressLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("address") || key.includes("location");
}

function isPresentAddressLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("presentaddress") || key.includes("currentaddress");
}

function isPermanentAddressLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("permanentaddress");
}

function isPersonNameLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("name")
    && !key.includes("father")
    && !key.includes("company")
    && !key.includes("model")
    && !key.includes("color")
    && !key.includes("make")
    && !key.includes("body")
    && !key.includes("engine");
}

function isProfileFieldLabel(label: string) {
  return isPersonNameLabel(label) || isFatherNameLabel(label) || isCnicLabel(label) || isAddressLabel(label);
}

function isPhoneLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key.includes("phone") || key.includes("mobile") || key.includes("contact") || key.includes("cell");
}

function getFieldGridColumn(label: string, isMobile: boolean) {
  if (isAddressLabel(label)) return "1 / -1";
  return undefined;
}

function getFieldValueStyle(label: string, isMobile: boolean) {
  if (isAddressLabel(label)) {
    return {
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const,
      overflow: "visible" as const,
      textOverflow: "clip" as const,
      noOfLines: undefined as number | undefined,
    };
  }

  if (isMobile) {
    return {
      whiteSpace: "nowrap" as const,
      wordBreak: "break-word" as const,
      overflow: "hidden" as const,
      textOverflow: "ellipsis" as const,
      noOfLines: 1,
    };
  }

  return {
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    overflow: "visible" as const,
    textOverflow: "clip" as const,
    noOfLines: 3,
  };
}

function canonicalPunjabDetailInfo(label: string): { key: string; label: string } | null {
  const key = normalizeLooseKey(label);
  if (key.includes("registrationno") || key === "regno" || key === "registrationnumber") {
    return { key: "registration_no", label: "Registration No" };
  }
  if (key.includes("chasis") || key.includes("chassisnumber") || key === "chassisno") {
    return { key: "chassis_no", label: "Chasis No" };
  }
  if (key.includes("engineno") || key.includes("enginenumber")) {
    return { key: "engine_no", label: "Engine No" };
  }
  if (key.includes("vehiclebodytype") || key === "bodytype") {
    return { key: "body_type", label: "Body Type" };
  }
  if (key.includes("makename") || key === "make") {
    return { key: "make_name", label: "Make Name" };
  }
  if (key === "date" || key.includes("registrationdate")) {
    return { key: "registration_date", label: "Registration Date" };
  }
  if (key.includes("color") || key.includes("colour")) {
    return { key: "colour", label: "Colour" };
  }
  if (key.includes("registrationdistrict") || key === "district" || key.includes("registereddistrict")) {
    return { key: "registered_district", label: "Registered District" };
  }
  return null;
}

function isSimNoRecordMessage(value: string) {
  const text = value.toLowerCase();
  return (
    text.includes("registered after 2022")
    || text.includes("get data with payment")
    || text.includes("click here")
    || text.includes("followed correct format")
  );
}

function cleanPunjabLabel(label: string) {
  return label
    .replace(/^owner information\s+/i, "")
    .replace(/^vehicle information\s+/i, "")
    .replace(/^basic info\s+/i, "")
    .replace(/^vehicle\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPunjabNameLabel(label: string) {
  const key = normalizeLooseKey(label);
  return key === "name" || key === "owner" || key.includes("ownername") || (isPersonNameLabel(label) && !isFatherNameLabel(label));
}

function shouldDropPunjabBasicInfo(label: string, value: string) {
  const raw = `${label} ${value}`.toLowerCase();
  return raw.includes("basic info");
}

function mergePunjabCategoryResultFields(fields: DisplayField[]): DisplayField[] {
  type PairInfo = {
    order: number;
    category?: string;
    result?: string;
    categoryIndex?: number;
    resultIndex?: number;
  };

  const pairs = new Map<string, PairInfo>();
  const consumed = new Set<number>();
  const merged: DisplayField[] = [];
  const seen = new Set<string>();

  const pushUnique = (rawLabel: string, rawValue: string) => {
    const value = normalizeValue(rawValue);
    const label = cleanPunjabLabel(rawLabel) || rawLabel.trim();
    if (!label || !value || shouldHideValue(value)) return;
    if (shouldDropPunjabBasicInfo(rawLabel, rawValue)) return;
    const sig = `${normalizeLooseKey(label)}:${value.toLowerCase()}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    merged.push({ label, value });
  };

  fields.forEach((field, index) => {
    const key = normalizeLooseKey(field.label);
    if (key.endsWith("category")) {
      const base = key.slice(0, -"category".length) || "root";
      const pair = pairs.get(base) ?? { order: index };
      pair.category = normalizeValue(field.value);
      pair.categoryIndex = index;
      pairs.set(base, pair);
      return;
    }

    if (key.endsWith("result")) {
      const base = key.slice(0, -"result".length) || "root";
      const pair = pairs.get(base) ?? { order: index };
      pair.result = normalizeValue(field.value);
      pair.resultIndex = index;
      pairs.set(base, pair);
    }
  });

  Array.from(pairs.values())
    .sort((a, b) => a.order - b.order)
    .forEach((pair) => {
      if (!pair.category || !pair.result) return;
      if (shouldDropPunjabBasicInfo(pair.category, pair.result)) return;
      if (pair.categoryIndex != null) consumed.add(pair.categoryIndex);
      if (pair.resultIndex != null) consumed.add(pair.resultIndex);
      pushUnique(pair.category, pair.result);
    });

  fields.forEach((field, index) => {
    if (consumed.has(index)) return;
    pushUnique(field.label, normalizeValue(field.value));
  });

  return merged;
}

function isCmsPunjabApi(apiName: string) {
  return normalizeLooseKey(apiName).includes("cmspunjab");
}

function isTimeoutLikeError(value: string) {
  const text = value.toLowerCase();
  return (
    text.includes("timed out")
    || text.includes("timeout")
    || text.includes("connection timed out")
    || text.includes("curl error")
    || text.includes("failed to connect")
  );
}

function isCmsPunjabErrorRecord(fields: DisplayField[]) {
  if (!fields.length) return false;
  const hasOnlyErrorLikeFields = fields.every((field) => {
    const key = normalizeLooseKey(field.label);
    const value = normalizeValue(field.value);
    return key.includes("error") || isTimeoutLikeError(value);
  });
  if (hasOnlyErrorLikeFields) return true;

  const hasQueryTypeCnic = fields.some((field) => {
    const key = normalizeLooseKey(field.label);
    const value = normalizeValue(field.value).toLowerCase();
    return (key.includes("querytype") || key === "type") && value.includes("cnic");
  });
  if (!hasQueryTypeCnic) return false;

  const metaOnlyKeys = ["querytype", "type", "response", "message", "status"];
  const hasRenderableBusinessField = fields.some((field) => {
    const key = normalizeLooseKey(field.label);
    if (metaOnlyKeys.some((meta) => key.includes(meta))) return false;
    return !shouldHideValue(field.value);
  });

  return !hasRenderableBusinessField;
}

function buildDefaultApiCards(results: UnifiedResult[]): ApiCard[] {
  return results
    .filter(isRenderableResult)
    .map((result) => {
      const normalized = normalizeResultData(result.data);
      let records = extractRecords(normalized)
        .map((raw, idx) => {
          const fields = collectDisplayFields(raw);
          const images = collectImages(raw).filter((src) => isLikelyImageSrc(src));
          if (!fields.length && !images.length) return null;
          return { index: idx + 1, fields, images, raw } satisfies ApiRecord;
        })
        .filter((item): item is ApiRecord => Boolean(item));

      if (isCmsPunjabApi(result.apiName)) {
        records = records.filter((record) => !isCmsPunjabErrorRecord(record.fields));
      }

      return {
        key: `${result.apiId}:${result.apiName}`,
        apiName: result.apiName,
        records,
      } satisfies ApiCard;
    })
    .filter((item) => item.records.length > 0);
}

function buildFamilyTreeCards(results: UnifiedResult[]): ApiCard[] {
  return results
    .filter((result) => isRenderableResult(result) && isFamilyTreeApi(result.apiName))
    .map((result) => {
      const normalized = normalizeResultData(result.data);
      const rows = extractRecords(normalized).flatMap((raw) => parseFamilyTreeRowsFromRaw(raw));
      const uniqueRows = dedupeFamilyTreeRows(rows);
      if (!uniqueRows.length) return null;

      const fatherName = uniqueRows.find((row) => row.fatherName)?.fatherName || "-";
      const fatherCnic = uniqueRows.find((row) => row.fatherCnic)?.fatherCnic || "-";

      const profileRecord: ApiRecord = {
        index: 0,
        section: "profile",
        images: [],
        raw: { father_name: fatherName, father_cnic: fatherCnic },
        fields: [
          { label: "Father Name", value: fatherName },
          { label: "Father CNIC", value: fatherCnic },
        ],
      };

      const detailRecords: ApiRecord[] = uniqueRows.map((row, index) => ({
        index: index + 1,
        section: "record",
        images: row.image ? [row.image] : [],
        raw: row,
        fields: [
          { label: "Name", value: row.name || "-" },
          { label: "CNIC", value: row.cnic || "-" },
          { label: "Date Of Birth", value: row.dateOfBirth || "-" },
          { label: "Relationship", value: row.relationship || "-" },
        ],
      }));

      return {
        key: `familytree:${result.apiId}`,
        apiName: result.apiName || "Family Tree",
        records: [profileRecord, ...detailRecords],
      } satisfies ApiCard;
    })
    .filter((card): card is ApiCard => Boolean(card));
}

function buildSimDatabaseSummaryCard(results: UnifiedResult[]): ApiCard | null {
  const numbers = new Set<string>();
  let name = "";
  let cnic = "";
  let address = "";
  const simApiName = results.find((result) => result?.apiName)?.apiName || "Sim Database";

  results
    .filter(isRenderableResult)
    .forEach((result) => {
      const normalized = normalizeResultData(result.data);
      const records = extractRecords(normalized);

      records.forEach((raw) => {
        const fields = collectDisplayFields(raw);
        fields.forEach((field) => {
          const value = normalizeValue(field.value);
          if (!value || shouldHideValue(value)) return;
          if (isSimNoRecordMessage(value)) return;
          const label = normalizeLooseKey(field.label);

          if (!name && label.includes("name") && !label.includes("father") && !label.includes("owner")) {
            name = value;
          }
          if (!cnic && (label.includes("cnic") || /\b\d{13}\b/.test(value))) {
            const nextCnic = extractCnic(value);
            if (nextCnic) cnic = nextCnic;
          }
          if (!address && (label.includes("address") || label.includes("location"))) {
            address = value;
          }
          if (label.includes("mobile") || label.includes("phone") || label.includes("number") || label.includes("sim")) {
            extractPhones(value).forEach((phone) => numbers.add(phone));
          }
        });

        const rawText = stableSerialize(raw);
        if (!cnic && !isSimNoRecordMessage(rawText)) {
          const nextCnic = extractCnic(rawText);
          if (nextCnic) cnic = nextCnic;
        }
        if (!isSimNoRecordMessage(rawText)) {
          extractPhones(rawText).forEach((phone) => numbers.add(phone));
        }
      });
    });

  const mergedNumbers = Array.from(numbers);
  if (!name && !cnic && !address && !mergedNumbers.length) return null;

  const summaryRecord = {
    name: name || "-",
    cnic: cnic || "-",
    address: address || "-",
    all_phone_numbers: mergedNumbers.length ? mergedNumbers : ["-"],
  };

  return {
    key: "simdatabase:profile",
    apiName: simApiName,
    records: [
      {
        index: 1,
        images: [],
        raw: summaryRecord,
        fields: [
          { label: "Name", value: summaryRecord.name },
          { label: "CNIC", value: summaryRecord.cnic },
          { label: "Address", value: summaryRecord.address },
          { label: "All Phone Numbers", value: summaryRecord.all_phone_numbers.join(", ") },
        ],
      },
    ],
  };
}

function buildIslamabadExciseCards(results: UnifiedResult[]): ApiCard[] {
  const allRecords: ApiRecord[] = [];

  results
    .filter(isRenderableResult)
    .forEach((result) => {
      const normalized = normalizeResultData(result.data);
      const next = extractRecords(normalized)
        .map((raw, idx) => {
          const fields = collectDisplayFields(raw);
          const images = collectImages(raw).filter((src) => isLikelyImageSrc(src));
          if (!fields.length && !images.length) return null;
          return { index: idx + 1, fields, images, raw } satisfies ApiRecord;
        })
        .filter((item): item is ApiRecord => Boolean(item));
      allRecords.push(...next);
    });

  const mergedRecords = dedupeRecords(allRecords);
  if (!mergedRecords.length) return [];

  let name = "";
  let fatherName = "";
  let cnic = "";
  let address = "";

  mergedRecords.forEach((record) => {
    record.fields.forEach((field) => {
      const value = normalizeValue(field.value);
      if (!value || shouldHideValue(value)) return;
      if (!name && isPersonNameLabel(field.label)) name = value;
      if (!fatherName && isFatherNameLabel(field.label)) fatherName = value;
      if (!cnic && (isCnicLabel(field.label) || /\b\d{13}\b/.test(value))) {
        const nextCnic = extractCnic(value);
        if (nextCnic) cnic = nextCnic;
      }
      if (!address && isAddressLabel(field.label)) address = value;
    });

    if (!cnic) {
      const nextCnic = extractCnic(stableSerialize(record.raw));
      if (nextCnic) cnic = nextCnic;
    }
  });

  const profileRecord: ApiRecord = {
    index: 0,
    section: "profile",
    images: [],
    raw: {
      name: name || "-",
      father_name: fatherName || "-",
      cnic: cnic || "-",
      address: address || "-",
    },
    fields: [
      { label: "Name", value: name || "-" },
      { label: "Father Name", value: fatherName || "-" },
      { label: "CNIC", value: cnic || "-" },
      { label: "Address", value: address || "-" },
    ],
  };

  const remainingRecords = mergedRecords
    .map((record) => {
      const nextFields = record.fields.filter((field) => !isProfileFieldLabel(field.label));
      return {
        ...record,
        fields: nextFields,
      };
    })
    .filter((record) => record.fields.length > 0 || record.images.length > 0)
    .map((record, index) => ({
      ...record,
      index: index + 1,
      section: "record" as const,
    }));

  return [
    {
      key: "islamabadexcise:vehicles",
      apiName: "Islamabad Excise Vehicles",
      records: [profileRecord, ...remainingRecords],
    },
  ];
}

function buildPunjabExciseCards(results: UnifiedResult[]): ApiCard[] {
  const allRecords: ApiRecord[] = [];

  results
    .filter(isRenderableResult)
    .forEach((result) => {
      const normalized = normalizeResultData(result.data);
      const next = extractRecords(normalized)
        .map((raw, idx) => {
          const fields = collectDisplayFields(raw);
          const images = collectImages(raw).filter((src) => isLikelyImageSrc(src));
          if (!fields.length && !images.length) return null;
          return { index: idx + 1, fields, images, raw } satisfies ApiRecord;
        })
        .filter((item): item is ApiRecord => Boolean(item));
      allRecords.push(...next);
    });

  const mergedRecords = dedupeRecords(allRecords);
  if (!mergedRecords.length) return [];

  let name = "";
  let fatherName = "";
  let cnic = "";
  let presentAddress = "";
  let permanentAddress = "";
  let fallbackAddress = "";
  const phones = new Set<string>();

  mergedRecords.forEach((record) => {
    const normalizedFields = mergePunjabCategoryResultFields(record.fields);
    normalizedFields.forEach((field) => {
      const label = cleanPunjabLabel(field.label) || field.label;
      const value = normalizeValue(field.value);
      if (!value || shouldHideValue(value)) return;

      if (!fatherName && isFatherNameLabel(label)) {
        fatherName = value;
        return;
      }

      if (!cnic && (isCnicLabel(label) || /\b\d{13}\b/.test(value))) {
        const nextCnic = extractCnic(value);
        if (nextCnic) {
          cnic = nextCnic;
          return;
        }
      }

      if (isPhoneLabel(label)) {
        const parsed = parsePhoneList(value);
        if (parsed.length) parsed.forEach((phone) => phones.add(phone));
        else phones.add(value);
        return;
      }

      if (isAddressLabel(label)) {
        if (!presentAddress && isPresentAddressLabel(label)) {
          presentAddress = value;
          return;
        }
        if (!permanentAddress && isPermanentAddressLabel(label)) {
          permanentAddress = value;
          return;
        }
        if (!fallbackAddress) fallbackAddress = value;
        return;
      }

      if (!name && isPunjabNameLabel(label)) {
        name = value;
      }
    });

    if (!cnic) {
      const nextCnic = extractCnic(stableSerialize(record.raw));
      if (nextCnic) cnic = nextCnic;
    }
    extractPhones(stableSerialize(record.raw)).forEach((phone) => phones.add(phone));
  });

  const mergedPhone = Array.from(phones).join(", ");
  if (!presentAddress && fallbackAddress) presentAddress = fallbackAddress;
  if (!permanentAddress && fallbackAddress) permanentAddress = fallbackAddress;
  const mergedAddress = [presentAddress, permanentAddress]
    .filter((item) => item && item !== "-")
    .filter((item, index, array) => array.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index)
    .join(" | ") || fallbackAddress || "-";

  const profileRecord: ApiRecord = {
    index: 0,
    section: "profile",
    images: [],
    raw: {
      owner_name: name || "-",
      father_name: fatherName || "-",
      owner_cnic: cnic || "-",
      mobile_number: mergedPhone || "-",
      address: mergedAddress,
    },
    fields: [
      { label: "Owner Name", value: name || "-" },
      { label: "Owner CNIC", value: cnic || "-" },
      { label: "Father Name", value: fatherName || "-" },
      { label: "Mobile Number", value: mergedPhone || "-" },
      { label: "Address", value: mergedAddress },
    ],
  };

  const selectedDetailKeys = [
    "registration_no",
    "chassis_no",
    "engine_no",
    "body_type",
    "make_name",
    "registration_date",
    "colour",
    "registered_district",
  ] as const;

  const fieldLabelByKey: Record<(typeof selectedDetailKeys)[number], string> = {
    registration_no: "Registration No",
    chassis_no: "Chasis No",
    engine_no: "Engine No",
    body_type: "Body Type",
    make_name: "Make Name",
    registration_date: "Registration Date",
    colour: "Colour",
    registered_district: "Registered District",
  };

  const detailRecords: ApiRecord[] = mergedRecords.map((record, index) => {
    const selectedMap = new Map<string, DisplayField>();
    const normalizedFields = mergePunjabCategoryResultFields(record.fields);
    normalizedFields.forEach((field) => {
      const info = canonicalPunjabDetailInfo(field.label);
      if (!info) return;
      if (!selectedMap.has(info.key)) {
        selectedMap.set(info.key, { label: fieldLabelByKey[info.key as keyof typeof fieldLabelByKey] ?? info.label, value: field.value });
      }
    });

    const fields = selectedDetailKeys.map((key) => ({
      label: fieldLabelByKey[key],
      value: normalizeValue(selectedMap.get(key)?.value) || "-",
    }));

    return {
      index: index + 1,
      section: "record",
      images: record.images,
      raw: record.raw,
      fields,
    } satisfies ApiRecord;
  });

  return [
    {
      key: "punjabexcise:vehicles",
      apiName: "Punjab Excise",
      records: [profileRecord, ...detailRecords],
    },
  ];
}

function buildApiCards(results: UnifiedResult[], serviceName?: string): ApiCard[] {
  const defaultCards = buildDefaultApiCards(results);

  if (isPunjabExciseService(serviceName)) {
    const scopedCards = buildPunjabExciseCards(results);
    if (scopedCards.length) return scopedCards;
    return defaultCards;
  }

  if (isIslamabadExciseService(serviceName)) {
    const scopedCards = buildIslamabadExciseCards(results);
    if (scopedCards.length) return scopedCards;
    return defaultCards;
  }

  if (isCnicLookupService(serviceName)) {
    const simResults = results.filter((result) => isSimDatabaseApi(result.apiName));
    const simSummaryCard = buildSimDatabaseSummaryCard(simResults);
    const familyApiResults = results.filter((result) => isFamilyTreeApi(result.apiName));
    const familyTreeCards = buildFamilyTreeCards(familyApiResults);

    const islamabadApiResults = results.filter((result) => isIslamabadExciseApi(result.apiName));
    const islamabadCards = buildIslamabadExciseCards(islamabadApiResults);
    const punjabApiResults = results.filter((result) => isPunjabExciseApi(result.apiName));
    const punjabCards = buildPunjabExciseCards(punjabApiResults);

    const remainingCards = defaultCards.filter(
      (card) => !isSimDatabaseApi(card.apiName)
        && !isIslamabadExciseApi(card.apiName)
        && !isPunjabExciseApi(card.apiName)
        && !isFamilyTreeApi(card.apiName),
    );

    return [
      ...(simSummaryCard ? [simSummaryCard] : []),
      ...familyTreeCards,
      ...islamabadCards,
      ...punjabCards,
      ...remainingCards,
    ];
  }

  const familyTreeCards = buildFamilyTreeCards(results);
  if (familyTreeCards.length) {
    const remainingCards = defaultCards.filter((card) => !isFamilyTreeApi(card.apiName));
    return [...familyTreeCards, ...remainingCards];
  }

  return defaultCards;
}

function isSimDatabaseProfileCard(card: ApiCard) {
  return card.key === "simdatabase:profile";
}

function isIslamabadVehiclesCard(card: ApiCard) {
  return card.key === "islamabadexcise:vehicles";
}

function isPunjabVehiclesCard(card: ApiCard) {
  return card.key === "punjabexcise:vehicles";
}

function isFamilyTreeCard(card: ApiCard) {
  return card.key.startsWith("familytree:");
}

function isKpkExciseCard(serviceName: string | undefined, card: ApiCard) {
  if (isKpkExciseService(serviceName)) return true;
  return isKpkExciseApi(card.apiName);
}

function isEgadgetCard(card: ApiCard) {
  return isEgadgetApi(card.apiName);
}

function shouldHideRecordImages(serviceName: string | undefined, card: ApiCard) {
  return isKpkExciseCard(serviceName, card);
}

function isIslamabadProfileRecord(record: ApiRecord) {
  return record.section === "profile";
}

function isPunjabProfileRecord(record: ApiRecord) {
  return record.section === "profile";
}

function isFamilyTreeProfileRecord(record: ApiRecord) {
  return record.section === "profile";
}

function getIslamabadProfileRecord(card: ApiCard): ApiRecord | undefined {
  return card.records.find((record) => isIslamabadProfileRecord(record));
}

function getIslamabadDetailRecords(card: ApiCard): ApiRecord[] {
  return card.records.filter((record) => !isIslamabadProfileRecord(record));
}

function getPunjabProfileRecord(card: ApiCard): ApiRecord | undefined {
  return card.records.find((record) => isPunjabProfileRecord(record));
}

function getPunjabDetailRecord(card: ApiCard): ApiRecord | undefined {
  return card.records.find((record) => !isPunjabProfileRecord(record));
}

function getPunjabDetailRecords(card: ApiCard): ApiRecord[] {
  return card.records.filter((record) => !isPunjabProfileRecord(record));
}

function getFamilyTreeProfileRecord(card: ApiCard): ApiRecord | undefined {
  return card.records.find((record) => isFamilyTreeProfileRecord(record));
}

function getFamilyTreeDetailRecords(card: ApiCard): ApiRecord[] {
  return card.records.filter((record) => !isFamilyTreeProfileRecord(record));
}

function showRecordHeading(serviceName: string | undefined, card: ApiCard, _record: ApiRecord) {
  if (isKpkExciseCard(serviceName, card)) return card.records.length > 1;
  if (isEgadgetCard(card)) return card.records.length > 1;
  return false;
}

function getRecordHeading(serviceName: string | undefined, card: ApiCard, record: ApiRecord) {
  if (isIslamabadVehiclesCard(card)) {
    if (isIslamabadProfileRecord(record)) return "Profile";
    return `Record ${record.index}`;
  }
  if (isKpkExciseCard(serviceName, card)) return `Record ${record.index}`;
  if (isEgadgetCard(card)) return `Record ${record.index}`;
  return `Record #${record.index}`;
}

function showRecordPdfAction(_serviceName: string | undefined, card: ApiCard, record: ApiRecord) {
  if (isFamilyTreeCard(card) && isFamilyTreeProfileRecord(record)) return false;
  return !(isIslamabadVehiclesCard(card) && isIslamabadProfileRecord(record));
}

function cardSummaryText(_serviceName: string | undefined, card: ApiCard) {
  if (isIslamabadVehiclesCard(card) || isSimDatabaseProfileCard(card) || isFamilyTreeCard(card)) return "";
  return "";
}

function cardTitle(_serviceName: string | undefined, card: ApiCard) {
  if (isPunjabVehiclesCard(card)) return "Punjab Excise";
  if (isIslamabadVehiclesCard(card)) return "Islamabad Excise Vehicles";
  if (isSimDatabaseProfileCard(card)) return displayApiName(card.apiName);
  return displayApiName(card.apiName);
}

function recordPdfTitle(_serviceName: string | undefined, card: ApiCard, record: ApiRecord) {
  if (isIslamabadVehiclesCard(card)) {
    if (isIslamabadProfileRecord(record)) return "Islamabad Excise Profile";
    return `Islamabad Excise Record ${record.index}`;
  }
  return `Trace Verisys ${card.apiName} Record #${record.index}`;
}

function recordPdfFilename(query: string, card: ApiCard, record: ApiRecord) {
  return `${query || "trace-verisys"}-${card.apiName.replace(/\s+/g, "-")}-record-${record.index}.pdf`;
}

function includeRecordIndexInClientSection(_serviceName: string | undefined, card: ApiCard, record: ApiRecord) {
  if (isPunjabVehiclesCard(card) && isPunjabProfileRecord(record)) return { ...record.raw };
  if (isIslamabadVehiclesCard(card) && isIslamabadProfileRecord(record)) return { ...record.raw };
  return { record: record.index, ...record.raw };
}

function getFieldValue(record: ApiRecord, label: string) {
  const key = normalizeLooseKey(label);
  const found = record.fields.find((field) => normalizeLooseKey(field.label) === key);
  return normalizeValue(found?.value ?? "");
}

function parsePhoneList(value: string) {
  const extracted = extractPhones(value);
  if (extracted.length) return Array.from(new Set(extracted));

  const seen = new Set<string>();
  return value
    .split(/[,\n|]+/)
    .map((item) => item.trim())
    .filter((item) => item && item !== "-")
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function chunkRecords(records: ApiRecord[], size = 2): ApiRecord[][] {
  const rows: ApiRecord[][] = [];
  for (let i = 0; i < records.length; i += size) {
    rows.push(records.slice(i, i + size));
  }
  return rows;
}

const WRITTEN_RECORD_COLUMNS = { base: 2, md: 2 } as const;

function ImageStrip({ images }: { images: string[] }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const galleryImages = React.useMemo(
    () => Array.from(new Set(images.map((src) => src.trim()).filter((src) => src && isLikelyImageSrc(src)))),
    [images],
  );
  const [activeIndex, setActiveIndex] = React.useState(0);
  const active = galleryImages[activeIndex] ?? null;

  const openAt = (index: number) => {
    setActiveIndex(index);
    onOpen();
  };

  const prev = () => {
    setActiveIndex((index) => (index - 1 + galleryImages.length) % galleryImages.length);
  };

  const next = () => {
    setActiveIndex((index) => (index + 1) % galleryImages.length);
  };

  return (
    <>
      <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2} mb={2.5}>
        {galleryImages.slice(0, 6).map((src, index) => (
          <Box
            key={`${src}-${index}`}
            borderRadius="12px"
            overflow="hidden"
            cursor="pointer"
            border={`1px solid ${ui.surface.border}`}
            onClick={() => {
              openAt(index);
            }}
          >
            <Image src={src} alt="Record evidence" objectFit="cover" w="full" h={{ base: "96px", md: "120px" }} />
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={ui.surface.overlay} border={`1px solid ${ui.surface.borderStrong}`}>
          <ModalBody p={3}>
            {active ? (
              <Stack spacing={2}>
                <Image src={active} alt="Record evidence" w="full" borderRadius="10px" maxH={{ base: "60vh", md: "68vh" }} objectFit="contain" />
                {galleryImages.length > 1 ? (
                  <HStack justify="space-between" spacing={2}>
                    <Button size="xs" borderRadius="999px" onClick={prev}>
                      Previous
                    </Button>
                    <Text fontSize="11px" color={ui.text.muted}>
                      {activeIndex + 1} / {galleryImages.length}
                    </Text>
                    <Button size="xs" borderRadius="999px" onClick={next}>
                      Next
                    </Button>
                  </HStack>
                ) : null}
                {galleryImages.length > 1 ? (
                  <SimpleGrid columns={{ base: 3, md: 6 }} spacing={1}>
                    {galleryImages.map((src, index) => (
                      <Box
                        key={`thumb-${src}-${index}`}
                        borderRadius="8px"
                        overflow="hidden"
                        border={index === activeIndex ? `2px solid ${ui.text.accent}` : `1px solid ${ui.surface.border}`}
                        cursor="pointer"
                        onClick={() => setActiveIndex(index)}
                      >
                        <Image src={src} alt={`Record evidence ${index + 1}`} w="full" h="54px" objectFit="cover" />
                      </Box>
                    ))}
                  </SimpleGrid>
                ) : null}
              </Stack>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

function EgadgetImagePanel({ images }: { images: string[] }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const galleryImages = React.useMemo(
    () => Array.from(new Set(images.map((src) => src.trim()).filter((src) => src && isLikelyImageSrc(src)))),
    [images],
  );
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (!galleryImages.length) return;
    if (activeIndex >= galleryImages.length) setActiveIndex(0);
  }, [activeIndex, galleryImages.length]);

  const active = galleryImages[activeIndex] ?? null;
  if (!galleryImages.length) {
    return (
      <Box
        borderRadius="12px"
        border={`1px solid ${ui.surface.borderStrong}`}
        bg={ui.surface.input}
        minH={{ base: "120px", md: "160px" }}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.05em" fontWeight="700">
          No Image
        </Text>
      </Box>
    );
  }

  const thumbSources = galleryImages.length === 1 ? galleryImages : galleryImages.slice(0, 9);
  const thumbColumns = galleryImages.length === 1 ? 1 : 3;
  const thumbHeight = galleryImages.length === 1 ? { base: "140px", md: "164px" } : { base: "62px", md: "74px" };

  return (
    <>
      <Stack spacing={2}>
        <SimpleGrid columns={thumbColumns} spacing={2}>
          {thumbSources.map((src, index) => (
            <Box
              key={`egadget-thumb-${src}-${index}`}
              borderRadius="10px"
              overflow="hidden"
              cursor="pointer"
              border={index === activeIndex ? `2px solid ${ui.text.accent}` : `1px solid ${ui.surface.border}`}
              onClick={() => setActiveIndex(index)}
            >
              <Image src={src} alt={`E-gadget evidence ${index + 1}`} objectFit="cover" w="full" h={thumbHeight} />
            </Box>
          ))}
        </SimpleGrid>

        {active ? (
          <Box
            borderRadius="12px"
            border={`1px solid ${ui.surface.borderStrong}`}
            bg={ui.surface.input}
            overflow="hidden"
            cursor="zoom-in"
            onClick={onOpen}
          >
            <Image src={active} alt="E-gadget evidence preview" objectFit="contain" w="full" h={{ base: "180px", md: "228px" }} />
          </Box>
        ) : null}
      </Stack>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={ui.surface.overlay} border={`1px solid ${ui.surface.borderStrong}`}>
          <ModalBody p={3}>
            {active ? (
              <Image src={active} alt="E-gadget evidence preview" w="full" borderRadius="10px" maxH={{ base: "60vh", md: "68vh" }} objectFit="contain" />
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

function FamilyRecordImage({ image, name }: { image: string; name: string }) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const hasImage = Boolean(image);

  return (
    <>
      <Box
        w={{ base: "84px", md: "112px" }}
        minW={{ base: "84px", md: "112px" }}
        h={{ base: "84px", md: "112px" }}
        borderRadius="10px"
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
          <Image src={image} alt={`${name} profile`} objectFit="cover" w="100%" h="100%" />
        ) : (
          <Text fontSize="9px" textTransform="uppercase" color={ui.text.muted} letterSpacing="0.05em" fontWeight="700">
            No Image
          </Text>
        )}
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent bg={ui.surface.overlay} border={`1px solid ${ui.surface.borderStrong}`}>
          <ModalBody p={3}>{hasImage ? <Image src={image} alt={`${name} profile`} w="full" borderRadius="10px" /> : null}</ModalBody>
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
  serviceName,
}: {
  query: string;
  results: UnifiedResult[];
  onExportPdf?: () => void;
  actionsVariant?: "default" | "single-pdf" | "none";
  serviceName?: string;
}) {
  const muiTheme = useMuiTheme();
  const ui = getDashboardUi(muiTheme.palette.mode);
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? false;
  const cards = React.useMemo(() => buildApiCards(results, serviceName), [results, serviceName]);

  if (!cards.length) {
    return (
      <Text textAlign="center" color={ui.text.secondary} fontWeight="700" mt={10}>
        No records found.
      </Text>
    );
  }

  return (
    <Stack spacing={4} mt={6} color={ui.text.primary}>
      {actionsVariant === "default" ? (
        <HStack justify="flex-end" spacing={2} flexWrap="wrap">
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
                filename: `${query || "trace-verisys"}-client.pdf`,
                title: "Trace Verisys Intelligence Report",
                subtitle: `Query: ${query}`,
                sections: cards.map((card) => ({
                  heading: cardTitle(serviceName, card),
                  rows: card.records.map((record) => includeRecordIndexInClientSection(serviceName, card, record)),
                })),
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
                `${query || "trace-verisys"}-results.csv`,
                cards.flatMap((card) => card.records.map((record) => ({ apiName: card.apiName, record: record.index, ...record.raw }))),
              )
            }
          >
            CSV
          </Button>
        </HStack>
      ) : null}

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: 2.5, md: 4 }}>
        {cards.map((card) => {
          const summary = cardSummaryText(serviceName, card);
          const familyTreeProfile = isFamilyTreeCard(card) ? getFamilyTreeProfileRecord(card) : undefined;
          const familyTreeDetails = isFamilyTreeCard(card) ? getFamilyTreeDetailRecords(card) : [];
          const punjabProfile = isPunjabVehiclesCard(card) ? getPunjabProfileRecord(card) : undefined;
          const punjabDetails = isPunjabVehiclesCard(card) ? getPunjabDetailRecords(card) : [];
          const islamabadProfile = isIslamabadVehiclesCard(card) ? getIslamabadProfileRecord(card) : undefined;
          const islamabadDetails = isIslamabadVehiclesCard(card) ? getIslamabadDetailRecords(card) : [];
          const headingBg = muiTheme.palette.mode === "dark"
            ? "linear-gradient(135deg, rgba(14,165,233,0.24), rgba(37,99,235,0.2))"
            : "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(56,189,248,0.14))";
          const headingBorder = muiTheme.palette.mode === "dark" ? "1px solid rgba(125,211,252,0.34)" : "1px solid rgba(59,130,246,0.26)";
          const headingColor = muiTheme.palette.mode === "dark" ? "#e0f2fe" : "#1e3a8a";
          const useCompactMobileFields = isMobile && !isSimDatabaseProfileCard(card);

          return (
            <Box
              key={card.key}
              bg={{ base: "transparent", md: ui.surface.card }}
              border={{ base: "none", md: `1px solid ${ui.surface.borderStrong}` }}
              borderRadius={{ base: "0", md: "14px" }}
              p={{ base: 0, md: 3 }}
              boxShadow={{ base: "none", md: muiTheme.palette.mode === "dark" ? "0 14px 34px rgba(2,6,23,0.28)" : "0 10px 24px rgba(15,23,42,0.08)" }}
            >
              <HStack justify="space-between" align="start" mb={2} gap={2}>
                <Box minW={0} w="full">
                  <Box
                    px={{ base: 2.5, md: 3 }}
                    py={{ base: 1.5, md: 2 }}
                    borderRadius="10px"
                    bg={headingBg}
                    border={headingBorder}
                    boxShadow={muiTheme.palette.mode === "dark" ? "0 6px 18px rgba(2,6,23,0.25)" : "0 6px 16px rgba(59,130,246,0.16)"}
                  >
                    <Heading
                      size="sm"
                      fontSize={{ base: "13px", md: "14px" }}
                      fontWeight="800"
                      color={headingColor}
                      lineHeight="1.25"
                      noOfLines={1}
                    >
                      {cardTitle(serviceName, card)}
                    </Heading>
                  </Box>
                  {summary ? (
                    <Text fontSize="11px" color={ui.text.muted} mt={1.5}>
                      {summary}
                    </Text>
                  ) : null}
                </Box>
              </HStack>

              <Stack spacing={2}>
                {isFamilyTreeCard(card) ? (
                  <Stack spacing={2.5}>
                    {familyTreeProfile ? (
                      <Box
                        border={`1px solid ${ui.surface.borderStrong}`}
                        borderRadius="12px"
                        px={{ base: 2.5, md: 3 }}
                        py={{ base: 2, md: 2.5 }}
                        bg={ui.surface.input}
                      >
                        <HStack spacing={2} flexWrap="wrap">
                          <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="700">
                            Father Name:
                          </Text>
                          <Text fontSize="12px" fontWeight="800">{getFieldValue(familyTreeProfile, "Father Name") || "-"}</Text>
                          <Text fontSize="10px" color={ui.text.muted}>,</Text>
                          <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="700">
                            Father CNIC:
                          </Text>
                          <Text fontSize="12px" fontWeight="800">{getFieldValue(familyTreeProfile, "Father CNIC") || "-"}</Text>
                        </HStack>
                      </Box>
                    ) : null}

                    <Stack spacing={2}>
                      {familyTreeDetails.map((record) => {
                        const name = getFieldValue(record, "Name") || "-";
                        const cnic = getFieldValue(record, "CNIC") || "-";
                        const dateOfBirth = getFieldValue(record, "Date Of Birth") || "-";
                        const relationship = getFieldValue(record, "Relationship") || "-";
                        const image = sanitizeFamilyImageSrc(record.images[0] ?? "");

                        return (
                          <Box
                            key={`${card.key}-${record.index}`}
                            border={`1px solid ${ui.surface.borderStrong}`}
                            borderRadius="12px"
                            px={{ base: 2.5, md: 3 }}
                            py={{ base: 2.5, md: 3 }}
                            bg={ui.surface.card}
                          >
                            <HStack align="flex-start" justify="space-between" spacing={{ base: 2.5, md: 4 }}>
                              <Stack spacing={1} flex="1" minW={0}>
                                <Text
                                  fontSize={{ base: "10px", md: "11px" }}
                                  color={ui.text.muted}
                                  textTransform="uppercase"
                                  letterSpacing="0.06em"
                                  fontWeight="800"
                                  lineHeight="1.35"
                                >
                                  Record {record.index}
                                </Text>
                                <Text fontSize={{ base: "12px", md: "13px" }} fontWeight="800" lineHeight="1.35" whiteSpace="pre-wrap">
                                  Name: {name}
                                </Text>
                                <Text fontSize={{ base: "11px", md: "12px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary} whiteSpace="pre-wrap">
                                  CNIC: {cnic}
                                </Text>
                                <Text fontSize={{ base: "11px", md: "12px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary} whiteSpace="pre-wrap">
                                  Date of Birth: {dateOfBirth}
                                </Text>
                                <Text fontSize={{ base: "11px", md: "12px" }} fontWeight="700" lineHeight="1.35" color={ui.text.secondary} whiteSpace="pre-wrap">
                                  Relationship: {relationship}
                                </Text>
                              </Stack>

                              <FamilyRecordImage image={image} name={name} />
                            </HStack>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Stack>
                ) : isIslamabadVehiclesCard(card) ? (
                  <Stack spacing={2.5}>
                    {islamabadProfile ? (
                      <SimpleGrid columns={WRITTEN_RECORD_COLUMNS} spacing={{ base: 0.75, md: 1.5 }}>
                        {islamabadProfile.fields.map((field) => (
                          <Box key={`${card.key}-profile-${field.label}`} gridColumn={getFieldGridColumn(field.label, isMobile)}>
                            {useCompactMobileFields ? (
                              <Text
                                mt={0.5}
                                fontSize="11px"
                                fontWeight="700"
                                lineHeight="1.35"
                                whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                              >
                                {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                              </Text>
                            ) : (
                              <>
                                <Text
                                  fontSize="10px"
                                  color={ui.text.muted}
                                  textTransform="uppercase"
                                  letterSpacing="0.05em"
                                  lineHeight="1.35"
                                >
                                  {field.label}
                                </Text>
                                <Text
                                  mt={0.5}
                                  fontSize="12px"
                                  fontWeight="700"
                                  lineHeight="1.3"
                                  whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                  wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                  overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                  textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                  noOfLines={getFieldValueStyle(field.label, isMobile).noOfLines}
                                >
                                  {normalizeValue(field.value) || "-"}
                                </Text>
                              </>
                            )}
                          </Box>
                        ))}
                      </SimpleGrid>
                    ) : null}

                    {islamabadDetails.length ? (
                      <>
                        <Divider borderColor={ui.surface.borderStrong} />

                        <Stack spacing={2}>
                          {chunkRecords(islamabadDetails, 2).map((row, rowIndex, rows) => (
                            <Box key={`${card.key}-row-${rowIndex}`}>
                              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                                {[0, 1].map((slot) => {
                                  const record = row[slot];
                                  if (!record) return <Box key={`${card.key}-row-${rowIndex}-slot-${slot}`} />;
                                  return (
                                    <Box key={`${card.key}-${record.index}`}>
                                      <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="700" mb={1}>
                                        {getRecordHeading(serviceName, card, record)}:
                                      </Text>
                                      <SimpleGrid columns={WRITTEN_RECORD_COLUMNS} spacing={{ base: 0.75, md: 1.5 }}>
                                        {record.fields.length ? (
                                          record.fields.map((field) => (
                                            <Box key={`${card.key}-${record.index}-${field.label}`} gridColumn={getFieldGridColumn(field.label, isMobile)}>
                                              {useCompactMobileFields ? (
                                                <Text
                                                  fontSize="11px"
                                                  fontWeight="700"
                                                  lineHeight="1.35"
                                                  whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                                  wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                                  overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                                  textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                                >
                                                  {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                                </Text>
                                              ) : (
                                                <>
                                                  <Text
                                                    fontSize="9px"
                                                    color={ui.text.muted}
                                                    textTransform="uppercase"
                                                    letterSpacing="0.05em"
                                                    lineHeight="1.35"
                                                  >
                                                    {field.label}
                                                  </Text>
                                                  <Text
                                                    fontSize={{ base: "11px", md: "12px" }}
                                                    fontWeight="700"
                                                    lineHeight="1.35"
                                                    whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                                    wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                                    overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                                    textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                                    noOfLines={getFieldValueStyle(field.label, isMobile).noOfLines}
                                                  >
                                                    {normalizeValue(field.value) || "-"}
                                                  </Text>
                                                </>
                                              )}
                                            </Box>
                                          ))
                                        ) : (
                                          <Text fontSize={{ base: "11px", md: "12px" }} fontWeight="700">
                                            Details not available
                                          </Text>
                                        )}
                                      </SimpleGrid>
                                      {record.images.length ? (
                                        <Box mt={1.5}>
                                          <ImageStrip images={record.images} />
                                        </Box>
                                      ) : null}
                                    </Box>
                                  );
                                })}
                              </SimpleGrid>
                              {rowIndex < rows.length - 1 ? <Divider mt={2} borderColor={ui.surface.border} /> : null}
                            </Box>
                          ))}
                        </Stack>
                      </>
                    ) : null}
                  </Stack>
                ) : isPunjabVehiclesCard(card) ? (
                  <Stack spacing={2.5}>
                    {punjabProfile ? (
                      <Stack spacing={1}>
                        {["Owner Name", "Owner CNIC", "Father Name", "Mobile Number", "Address"].map((label) => {
                          const value = getFieldValue(punjabProfile, label) || "-";
                          return (
                            <Text
                              key={`${card.key}-profile-${label}`}
                              fontSize={{ base: "11px", md: "12px" }}
                              fontWeight="700"
                              lineHeight="1.4"
                              whiteSpace={getFieldValueStyle(label, isMobile).whiteSpace}
                              wordBreak={getFieldValueStyle(label, isMobile).wordBreak}
                              overflow={getFieldValueStyle(label, isMobile).overflow}
                              textOverflow={getFieldValueStyle(label, isMobile).textOverflow}
                            >
                              {label}: {value}
                            </Text>
                          );
                        })}
                      </Stack>
                    ) : null}

                    {punjabDetails.length ? (
                      <>
                        <Divider borderColor={ui.surface.borderStrong} />

                        <Stack spacing={2}>
                          {punjabDetails.map((record) => (
                            <Box key={`${card.key}-detail-record-${record.index}`}>
                              <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="700" mb={1}>
                                Record {record.index}:
                              </Text>
                              <SimpleGrid columns={WRITTEN_RECORD_COLUMNS} spacing={{ base: 0.75, md: 1.5 }}>
                                {record.fields.map((field) => (
                                  <Box key={`${card.key}-detail-${record.index}-${field.label}`} gridColumn={getFieldGridColumn(field.label, isMobile)}>
                                    {useCompactMobileFields ? (
                                      <Text
                                        mt={0.5}
                                        fontSize="11px"
                                        fontWeight="700"
                                        lineHeight="1.35"
                                        whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                        wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                        overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                        textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                      >
                                        {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                      </Text>
                                    ) : (
                                      <>
                                        <Text
                                          fontSize="10px"
                                          color={ui.text.muted}
                                          textTransform="uppercase"
                                          letterSpacing="0.05em"
                                          lineHeight="1.35"
                                        >
                                          {field.label}
                                        </Text>
                                        <Text
                                          mt={0.5}
                                          fontSize="12px"
                                          fontWeight="700"
                                          lineHeight="1.3"
                                          whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                          wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                          overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                          textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                          noOfLines={getFieldValueStyle(field.label, isMobile).noOfLines}
                                        >
                                          {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                        </Text>
                                      </>
                                    )}
                                  </Box>
                                ))}
                              </SimpleGrid>
                              {record.images.length ? (
                                <Box mt={1.5}>
                                  <ImageStrip images={record.images} />
                                </Box>
                              ) : null}
                            </Box>
                          ))}
                        </Stack>
                      </>
                    ) : null}
                  </Stack>
                ) : (
                  <>
                    {card.records.map((record) => (
                      <Box key={`${card.key}-${record.index}`} py={1}>
                        {(() => {
                          const hideImages = shouldHideRecordImages(serviceName, card);
                          const hasImages = record.images.length > 0 && !hideImages;
                          const useEgadgetLayout = hasImages && isEgadgetCard(card);

                          return (
                            <>
                              <HStack justify="space-between" mb={1.5} align="start">
                                {showRecordHeading(serviceName, card, record) ? (
                                  <Text fontSize="10px" color={ui.text.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="700">
                                    {getRecordHeading(serviceName, card, record)}
                                  </Text>
                                ) : <Box />}
                                {actionsVariant === "default" && showRecordPdfAction(serviceName, card, record) ? (
                                  <Button
                                    borderRadius="999px"
                                    colorScheme="green"
                                    size="xs"
                                    minH="22px"
                                    px={2.5}
                                    onClick={() =>
                                      downloadClientPdf({
                                        filename: recordPdfFilename(query, card, record),
                                        title: recordPdfTitle(serviceName, card, record),
                                        subtitle: `Query: ${query}`,
                                        sections: [{ heading: cardTitle(serviceName, card), rows: [includeRecordIndexInClientSection(serviceName, card, record)] }],
                                      })
                                    }
                                  >
                                    PDF
                                  </Button>
                                ) : null}
                              </HStack>

                              {useEgadgetLayout ? (
                                <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3} alignItems="start">
                                  <SimpleGrid
                                    columns={isSimDatabaseProfileCard(card) ? { base: 1, md: 2 } : WRITTEN_RECORD_COLUMNS}
                                    spacing={{ base: 0.75, md: 1.5 }}
                                  >
                                    {record.fields.map((field) => {
                                      const isSimNumbersField = isSimDatabaseProfileCard(card) && normalizeLooseKey(field.label) === "allphonenumbers";
                                      const phoneList = isSimNumbersField ? parsePhoneList(String(field.value ?? "")) : [];

                                      return (
                                        <Box key={`${card.key}-${record.index}-${field.label}`} gridColumn={getFieldGridColumn(field.label, isMobile)}>
                                          <Text
                                            fontSize="10px"
                                            color={ui.text.muted}
                                            textTransform="uppercase"
                                            letterSpacing="0.05em"
                                            lineHeight="1.35"
                                            noOfLines={isMobile && !isAddressLabel(field.label) ? 1 : undefined}
                                          >
                                            {field.label}
                                          </Text>

                                          {isSimNumbersField && isMobile ? (
                                            <SimpleGrid columns={3} spacing={1} mt={1}>
                                              {phoneList.map((phone) => (
                                                <Box
                                                  key={`${card.key}-${record.index}-${field.label}-${phone}`}
                                                  px={2}
                                                  py={1}
                                                  borderRadius="8px"
                                                  bg={ui.surface.input}
                                                  border={`1px solid ${ui.surface.border}`}
                                                  textAlign="center"
                                                >
                                                  <Text fontSize="11px" fontWeight="700" noOfLines={1}>{phone}</Text>
                                                </Box>
                                              ))}
                                            </SimpleGrid>
                                          ) : useCompactMobileFields ? (
                                            <Text
                                              mt={0.5}
                                              fontSize="11px"
                                              fontWeight="700"
                                              lineHeight="1.35"
                                              whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                              wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                              overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                              textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                            >
                                              {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                            </Text>
                                          ) : (
                                            <Text
                                              mt={0.5}
                                              fontSize="12px"
                                              fontWeight="700"
                                              lineHeight="1.3"
                                              whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                              wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                              overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                              textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                              noOfLines={getFieldValueStyle(field.label, isMobile).noOfLines}
                                            >
                                              {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                            </Text>
                                          )}
                                        </Box>
                                      );
                                    })}
                                  </SimpleGrid>

                                  <Box alignSelf="start" w="full" maxW={{ base: "full", xl: "360px" }} ml={{ base: 0, xl: "auto" }}>
                                    <EgadgetImagePanel images={record.images} />
                                  </Box>
                                </SimpleGrid>
                              ) : (
                                <>
                                  {hasImages ? (
                                    <Box>
                                      <ImageStrip images={record.images} />
                                    </Box>
                                  ) : null}

                                  <SimpleGrid
                                    columns={isSimDatabaseProfileCard(card) ? { base: 1, md: 2 } : WRITTEN_RECORD_COLUMNS}
                                    spacing={{ base: 0.75, md: 1.5 }}
                                  >
                                    {record.fields.map((field) => {
                                      const isSimNumbersField = isSimDatabaseProfileCard(card) && normalizeLooseKey(field.label) === "allphonenumbers";
                                      const phoneList = isSimNumbersField ? parsePhoneList(String(field.value ?? "")) : [];

                                      return (
                                        <Box key={`${card.key}-${record.index}-${field.label}`} gridColumn={getFieldGridColumn(field.label, isMobile)}>
                                          <Text
                                            fontSize="10px"
                                            color={ui.text.muted}
                                            textTransform="uppercase"
                                            letterSpacing="0.05em"
                                            lineHeight="1.35"
                                            noOfLines={isMobile && !isAddressLabel(field.label) ? 1 : undefined}
                                          >
                                            {field.label}
                                          </Text>

                                          {isSimNumbersField && isMobile ? (
                                            <SimpleGrid columns={3} spacing={1} mt={1}>
                                              {phoneList.map((phone) => (
                                                <Box
                                                  key={`${card.key}-${record.index}-${field.label}-${phone}`}
                                                  px={2}
                                                  py={1}
                                                  borderRadius="8px"
                                                  bg={ui.surface.input}
                                                  border={`1px solid ${ui.surface.border}`}
                                                  textAlign="center"
                                                >
                                                  <Text fontSize="11px" fontWeight="700" noOfLines={1}>{phone}</Text>
                                                </Box>
                                              ))}
                                            </SimpleGrid>
                                          ) : useCompactMobileFields ? (
                                            <Text
                                              mt={0.5}
                                              fontSize="11px"
                                              fontWeight="700"
                                              lineHeight="1.35"
                                              whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                              wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                              overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                              textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                            >
                                              {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                            </Text>
                                          ) : (
                                            <Text
                                              mt={0.5}
                                              fontSize="12px"
                                              fontWeight="700"
                                              lineHeight="1.3"
                                              whiteSpace={getFieldValueStyle(field.label, isMobile).whiteSpace}
                                              wordBreak={getFieldValueStyle(field.label, isMobile).wordBreak}
                                              overflow={getFieldValueStyle(field.label, isMobile).overflow}
                                              textOverflow={getFieldValueStyle(field.label, isMobile).textOverflow}
                                              noOfLines={getFieldValueStyle(field.label, isMobile).noOfLines}
                                            >
                                              {stripFieldLabelFromValue(field.label, normalizeValue(field.value) || "-") || "-"}
                                            </Text>
                                          )}
                                        </Box>
                                      );
                                    })}
                                  </SimpleGrid>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </Box>
                    ))}
                  </>
                )}
              </Stack>

            </Box>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { requireAuth } from "../../shared/security/authMiddleware.js";

export const exportRouter = Router();

const hiddenFieldKeys = new Set([
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
  "detectedtype",
  "detected_type",
  "result_count",
  "count",
  "raw",
]);

const MAX_SECTIONS = 80;
const MAX_ROWS_PER_SECTION = 420;
const MAX_VALUE_LENGTH = 1200;
const MAX_LABEL_LENGTH = 220;
const MAX_ARRAY_ITEMS = 60;

function normalizeKey(key: string) {
  return key.replace(/[\s_-]+/g, "").toLowerCase();
}

function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function isImageValue(key: string, value: unknown) {
  if (typeof value !== "string") return false;
  const normalized = normalizeKey(key);
  if (!/image|photo|picture|avatar|pic|img/.test(normalized)) return false;
  const trimmed = value.trim();
  return /^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

function isLargeBinaryLike(value: unknown) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  if (/^data:image\//i.test(text)) return true;
  return text.length > MAX_VALUE_LENGTH && /^[A-Za-z0-9+/=\s]+$/.test(text);
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return truncateText(sanitizeText(value), MAX_VALUE_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return sanitizeText(String(value));
  if (Array.isArray(value)) {
    const visibleItems = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(", ");
    const overflow = value.length > MAX_ARRAY_ITEMS ? ` (+${value.length - MAX_ARRAY_ITEMS} more)` : "";
    return truncateText(sanitizeText(`${visibleItems}${overflow}`), MAX_VALUE_LENGTH);
  }
  return "";
}

function shouldHideValue(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return true;
  return (
    text === "0"
    || text === "null"
    || text === "undefined"
    || text === "n/a"
    || text === "na"
    || text === "no"
    || text === "none"
    || text.includes("no record")
    || text.includes("no records")
    || text.includes("no data")
    || text.includes("not found")
    || text.includes("empty")
  );
}

function prettifyLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

type ReportRow = { label: string; value: string };
type ReportSection = { heading: string; rows: ReportRow[] };

function collectRows(input: unknown, prefix = ""): ReportRow[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    const primitiveValues = input.filter((item) => typeof item !== "object");
    const objectValues = input.filter((item) => item && typeof item === "object").slice(0, MAX_ARRAY_ITEMS);
    const rows: ReportRow[] = [];

    if (primitiveValues.length) {
      const merged = primitiveValues.map((item) => normalizeText(item)).filter(Boolean).join(", ");
      if (!shouldHideValue(merged)) {
        rows.push({
          label: truncateText(prefix || "Value", MAX_LABEL_LENGTH),
          value: truncateText(merged, MAX_VALUE_LENGTH),
        });
      }
    }

    objectValues.forEach((item, index) => {
      rows.push(...collectRows(item, prefix ? `${prefix} • Record #${index + 1}` : `Record #${index + 1}`));
    });

    if (input.length > MAX_ARRAY_ITEMS) {
      rows.push({
        label: truncateText(prefix ? `${prefix} • Note` : "Note", MAX_LABEL_LENGTH),
        value: `${input.length - MAX_ARRAY_ITEMS} additional entries omitted`,
      });
    }

    return rows;
  }

  if (typeof input === "object") {
    const rows: ReportRow[] = [];
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const normalizedKey = normalizeKey(key);
      if (hiddenFieldKeys.has(normalizedKey)) continue;
      if (isImageValue(key, value)) continue;
      if (isLargeBinaryLike(value)) continue;

      const label = prefix ? `${prefix} • ${prettifyLabel(key)}` : prettifyLabel(key);
      if (value && typeof value === "object") {
        rows.push(...collectRows(value, label));
        continue;
      }
      const text = normalizeText(value);
      if (!shouldHideValue(text)) {
        rows.push({
          label: truncateText(label, MAX_LABEL_LENGTH),
          value: truncateText(text, MAX_VALUE_LENGTH),
        });
      }
    }
    return rows;
  }

  const text = normalizeText(input);
  return shouldHideValue(text) ? [] : [{ label: truncateText(prefix || "Value", MAX_LABEL_LENGTH), value: truncateText(text, MAX_VALUE_LENGTH) }];
}

function parseSections(raw: unknown): ReportSection[] {
  const payload = raw as any;
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results)
      ? payload.results
      : payload
        ? [payload]
        : [];

  const sections: ReportSection[] = [];
  for (const [index, item] of candidates.slice(0, MAX_SECTIONS).entries()) {
    if (!item) continue;
    const heading = String(item.apiName || item.source || item.name || `Record #${index + 1}`).trim();
    const sourceData = item.data ?? item.merged ?? item;
    const rows = collectRows(sourceData).slice(0, MAX_ROWS_PER_SECTION);
    if (!rows.length) continue;
    sections.push({ heading: truncateText(heading, 120), rows });
  }

  if (sections.length) return sections;
  const fallbackRows = collectRows(raw).slice(0, MAX_ROWS_PER_SECTION);
  if (fallbackRows.length) return [{ heading: "Search Output", rows: fallbackRows }];
  return [];
}

function drawFooter(doc: PDFKit.PDFDocument, pageNo: number, companyName: string) {
  const footerY = doc.page.height - 36;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748b")
    .text(`${companyName} • Confidential Intelligence Report`, 42, footerY, { align: "left" })
    .text(`Page ${pageNo}`, 42, footerY, { align: "right" });
}

exportRouter.post("/pdf", requireAuth, async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().default("Trace Verisys Report"),
    query: z.string().min(1),
    detectedType: z.string().min(1),
    results: z.any(),
  }).parse(req.body);

  const companyName = process.env.REPORT_COMPANY_NAME ?? "Trace Verisys Intelligence";
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sections = parseSections(body.results);

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    let pageNo = 1;
    doc.on("pageAdded", () => {
      pageNo += 1;
      drawFooter(doc, pageNo, companyName);
    });

    // Header strip
    doc.rect(0, 0, doc.page.width, 92).fill("#0b3a6e");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text(companyName, 42, 26, { align: "left" });
    doc.font("Helvetica").fontSize(10).text("Official Intelligence Report", 42, 54);
    doc.font("Helvetica-Bold").fontSize(12).text(body.title, 0, 38, { align: "right" });

    doc.fillColor("#0f172a");
    doc.roundedRect(40, 110, doc.page.width - 80, 86, 8).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text("Report Metadata", 52, 122);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Query: ${truncateText(sanitizeText(body.query), 120)}`, 52, 142);
    doc.text(`Detected Type: ${truncateText(sanitizeText(body.detectedType), 60)}`, 52, 158);
    doc.text(`Generated At: ${generatedAt} UTC`, doc.page.width / 2, 142);
    doc.text(`Total Sections: ${sections.length}`, doc.page.width / 2, 158);

    let y = 220;
    const left = 42;
    const contentWidth = doc.page.width - 84;

    const ensureSpace = (height: number) => {
      if (y + height <= doc.page.height - 90) return;
      doc.addPage();
      y = 52;
    };

    sections.forEach((section, sectionIndex) => {
      const rowHeight = 18;
      const blockHeight = 28 + section.rows.length * rowHeight + 14;
      ensureSpace(blockHeight);

      doc.roundedRect(left, y, contentWidth, 24, 6).fill("#0f4c81");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10.5).text(`Category ${sectionIndex + 1}: ${section.heading}`, left + 10, y + 7, {
        width: contentWidth - 20,
        ellipsis: true,
      });
      y += 30;

      section.rows.forEach((row, rowIndex) => {
        ensureSpace(rowHeight + 6);
        const rowY = y;
        const rowBg = rowIndex % 2 === 0 ? "#f8fafc" : "#f1f5f9";
        doc.rect(left, rowY, contentWidth, rowHeight).fill(rowBg);
        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(8.7).text(row.label, left + 8, rowY + 5, {
          width: 178,
          ellipsis: true,
        });
        doc.fillColor("#0f172a").font("Helvetica").fontSize(8.7).text(row.value, left + 190, rowY + 5, {
          width: contentWidth - 198,
          ellipsis: true,
        });
        y += rowHeight;
      });

      y += 14;
    });

    ensureSpace(92);
    doc.roundedRect(left, y, contentWidth, 74, 8).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fillColor("#334155").font("Helvetica-Bold").fontSize(10).text("Verification & Sign-off", left + 10, y + 10);
    doc.strokeColor("#64748b").lineWidth(1).moveTo(left + 18, y + 52).lineTo(left + 218, y + 52).stroke();
    doc.strokeColor("#64748b").lineWidth(1).moveTo(left + contentWidth - 218, y + 52).lineTo(left + contentWidth - 18, y + 52).stroke();
    doc.fillColor("#475569").font("Helvetica").fontSize(9).text("Prepared By", left + 18, y + 56);
    doc.text("Authorized Signatory", left + contentWidth - 218, y + 56);

    drawFooter(doc, pageNo, companyName);
    doc.end();
  });

  const baseName = truncateText(
    sanitizeText(body.query).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""),
    48,
  ) || "trace-verisys";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}-${Date.now()}.pdf"`);
  res.setHeader("Content-Length", String(pdfBuffer.byteLength));
  res.setHeader("Cache-Control", "no-store");
  res.end(pdfBuffer);
});

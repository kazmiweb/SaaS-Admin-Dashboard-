import jsPDF from "jspdf";

function flatten(obj: any, prefix = "", out: Record<string, any> = {}) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object" || obj instanceof Date) {
    out[prefix || "value"] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    out[prefix || "items"] = JSON.stringify(obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

function normalizeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item)).filter(Boolean).join(", ");
  return "";
}

function shouldHide(value: unknown) {
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

function prettifyLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function rowsForRecord(record: any) {
  const flat = flatten(record);
  return Object.entries(flat)
    .map(([key, value]) => ({ label: prettifyLabel(key), value: normalizeValue(value) }))
    .filter((item) => !shouldHide(item.value));
}

export function downloadCsv(filename: string, rows: any[]) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const flatRows = safeRows.map((r) => flatten(r));
  const headers = Array.from(
    flatRows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    const needs = /[\n\r,\"]/g.test(s);
    const t = s.replace(/\"/g, '""');
    return needs ? `"${t}"` : t;
  };
  const csv = [headers.join(","), ...flatRows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadClientPdf(params: {
  filename: string;
  title: string;
  subtitle?: string;
  sections?: Array<{ heading: string; rows: any[] }>;
  rawJson?: any;
}) {
  const { filename, title, subtitle, sections = [] } = params;
  const companyName = import.meta.env.VITE_REPORT_COMPANY_NAME || "Trace Verisys Intelligence";
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 34;
  const contentWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 22;
  const maxContentY = pageHeight - 48;
  let currentPage = 1;
  let y = 44;

  const drawPageHeader = (isFirstPage: boolean) => {
    doc.setFillColor(10, 54, 122);
    doc.rect(0, 0, pageWidth, isFirstPage ? 88 : 56, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(isFirstPage ? 18 : 13);
    doc.text(companyName, margin, isFirstPage ? 34 : 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text("Intelligence Report", margin, isFirstPage ? 51 : 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(isFirstPage ? 11 : 10);
    doc.text(title, pageWidth - margin, isFirstPage ? 34 : 29, { align: "right", maxWidth: 230 });
  };

  const drawFooter = () => {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${companyName} • Confidential`, margin, footerY);
    doc.text(`Page ${currentPage}`, pageWidth - margin, footerY, { align: "right" });
  };

  const addPage = () => {
    drawFooter();
    doc.addPage();
    currentPage += 1;
    drawPageHeader(false);
    y = 72;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= maxContentY) return;
    addPage();
  };

  const splitLines = (text: string, width: number, maxLines: number) => {
    const safe = text?.trim() ? text : "-";
    const lines = doc.splitTextToSize(safe, width) as string[];
    if (lines.length <= maxLines) return lines;
    const trimmed = lines.slice(0, maxLines);
    const last = trimmed[maxLines - 1] ?? "";
    trimmed[maxLines - 1] = last.length > 2 ? `${last.slice(0, -2)}..` : `${last}..`;
    return trimmed;
  };

  drawPageHeader(true);
  y = 108;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(margin, y, contentWidth, 68, 8, 8, "FD");
  doc.setTextColor(30, 64, 175);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Report Overview", margin + 10, y + 18);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedAt}`, margin + 10, y + 34);
  doc.text(`Query: ${subtitle ? subtitle.replace(/^Query:\s*/i, "") : "-"}`, margin + 10, y + 48);
  doc.text(`Total APIs: ${sections.length}`, margin + 10, y + 62);
  y += 84;

  let hasPrintableContent = false;

  sections.forEach((section, sectionIndex) => {
    const records = (section.rows || []).slice(0, 220);
    const cards = records
      .map((row, rowIndex) => {
        const fields = rowsForRecord(row).slice(0, 50);
        if (!fields.length) return null;
        const recordNo = (row && typeof row === "object" && "record" in row) ? (row as any).record : rowIndex + 1;
        const titleText = typeof recordNo === "number" || typeof recordNo === "string" ? `Record ${recordNo}` : `Record ${rowIndex + 1}`;
        return { title: titleText, fields };
      })
      .filter((item): item is { title: string; fields: Array<{ label: string; value: string }> } => Boolean(item));

    if (!cards.length) return;
    hasPrintableContent = true;

    ensureSpace(36);
    doc.setFillColor(59, 130, 246);
    doc.setDrawColor(37, 99, 235);
    doc.roundedRect(margin, y, contentWidth, 24, 6, 6, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${sectionIndex + 1}. ${section.heading}`, margin + 9, y + 16, { maxWidth: contentWidth - 18 });
    y += 32;

    cards.forEach((card) => {
      const labelWidth = 130;
      const valueWidth = contentWidth - 32 - labelWidth;
      let estimatedHeight = 34;
      card.fields.forEach((field) => {
        const valueLines = splitLines(field.value, valueWidth, 4);
        estimatedHeight += Math.max(14, valueLines.length * 9.6) + 6;
      });
      estimatedHeight += 8;

      ensureSpace(estimatedHeight + 8);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(191, 219, 254);
      doc.roundedRect(margin, y, contentWidth, estimatedHeight, 8, 8, "FD");

      doc.setFillColor(219, 234, 254);
      doc.roundedRect(margin + 8, y + 8, 92, 16, 4, 4, "F");
      doc.setTextColor(30, 64, 175);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.8);
      doc.text(card.title, margin + 14, y + 19, { maxWidth: 80 });

      let fieldY = y + 33;
      card.fields.forEach((field) => {
        const label = splitLines(field.label, labelWidth, 1)[0] || "-";
        const valueLines = splitLines(field.value, valueWidth, 4);
        const rowHeight = Math.max(14, valueLines.length * 9.6);

        doc.setTextColor(71, 85, 105);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.4);
        doc.text(label, margin + 12, fieldY, { maxWidth: labelWidth });

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.6);
        doc.text(valueLines, margin + 16 + labelWidth, fieldY, { maxWidth: valueWidth, lineHeightFactor: 1.1 });

        fieldY += rowHeight + 6;
      });

      y += estimatedHeight + 10;
    });
  });

  if (!hasPrintableContent) {
    ensureSpace(48);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("No printable records found for this report.", margin, y + 10);
  }

  drawFooter();
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

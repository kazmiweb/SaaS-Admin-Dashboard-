import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const { filename, title, subtitle, sections = [], rawJson } = params;
  const companyName = import.meta.env.VITE_REPORT_COMPANY_NAME || "Elookup Intelligence";
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  doc.setFillColor(11, 58, 110);
  doc.rect(0, 0, pageWidth, 88, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(companyName, margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Official Intelligence Report", margin, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, pageWidth - margin, 34, { align: "right" });

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, 108, pageWidth - margin * 2, 78, 8, 8, "FD");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Report Metadata", margin + 10, 125);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${generatedAt}`, margin + 10, 143);
  doc.text(`Subtitle: ${subtitle || "-"}`, margin + 10, 158);
  doc.text(`Categories: ${sections.length}`, pageWidth / 2, 143);

  let y = 210;
  sections.forEach((sec, index) => {
    const sectionRows = (sec.rows || [])
      .slice(0, 500)
      .flatMap((row: any, rowIndex: number) => {
        const detailRows = rowsForRecord(row);
        if (!detailRows.length) return [];
        const prefix = detailRows.length > 1 ? `Record #${rowIndex + 1} • ` : "";
        return detailRows.map((detail) => [prefix + detail.label, detail.value]);
      })
      .slice(0, 900);

    if (!sectionRows.length) return;

    doc.setFillColor(15, 76, 129);
    doc.rect(margin, y, pageWidth - margin * 2, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Category ${index + 1}: ${sec.heading}`, margin + 8, y + 15, { maxWidth: pageWidth - margin * 2 - 16 });
    y += 24;

    autoTable(doc, {
      startY: y,
      head: [["Field", "Value"]],
      body: sectionRows,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8.2,
        cellPadding: 4,
        textColor: [15, 23, 42],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 170, fontStyle: "bold" },
        1: { cellWidth: pageWidth - margin * 2 - 170 },
      },
    });

    // @ts-expect-error jspdf-autotable augment
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 14;
    if (y > pageHeight - 120) {
      doc.addPage();
      y = 54;
    }
  });

  if (y > pageHeight - 110) {
    doc.addPage();
    y = 54;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 74, 8, 8, "FD");
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Verification & Sign-off", margin + 10, y + 18);
  doc.setDrawColor(100, 116, 139);
  doc.line(margin + 20, y + 50, margin + 200, y + 50);
  doc.line(pageWidth - margin - 200, y + 50, pageWidth - margin - 20, y + 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Prepared By", margin + 20, y + 62);
  doc.text("Authorized Signatory", pageWidth - margin - 200, y + 62);

  if (rawJson) {
    const raw = JSON.stringify(rawJson, null, 2);
    const snippet = raw.length > 2400 ? raw.slice(0, 2400) + "\n…" : raw;
    doc.addPage();
    autoTable(doc, {
      startY: 52,
      head: [["Appendix", "Truncated JSON Snapshot"]],
      body: [["Raw Payload", snippet]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: pageWidth - margin * 2 - 120 } },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${companyName} • Confidential`, margin, pageHeight - 20);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 20, { align: "right" });
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

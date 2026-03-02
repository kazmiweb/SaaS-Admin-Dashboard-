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

  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const margin = 42;
  let y = margin;

  doc.setFontSize(18);
  doc.text(title, margin, y);
  y += 18;

  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(subtitle || new Date().toLocaleString(), margin, y);
  doc.setTextColor(0);
  y += 18;

  for (const sec of sections) {
    doc.setFontSize(12);
    doc.text(sec.heading, margin, y);
    y += 10;

    const flatRows = (sec.rows || []).slice(0, 200).map((r) => flatten(r));
    const headers = Array.from(
      flatRows.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    ).slice(0, 12); // keep readable

    autoTable(doc, {
      startY: y + 6,
      head: [headers],
      body: flatRows.map((r) => headers.map((h) => {
        const v = (r as any)[h];
        const s = v === null || v === undefined ? "" : String(v);
        return s.length > 60 ? s.slice(0, 57) + "…" : s;
      })),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [18, 18, 24] },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error jspdf-autotable augment
    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : y + 18;
    if (y > 740) {
      doc.addPage();
      y = margin;
    }
  }

  if (rawJson) {
    doc.setFontSize(11);
    doc.text("Raw JSON (truncated)", margin, y);
    y += 10;
    doc.setFontSize(8);
    const raw = JSON.stringify(rawJson, null, 2);
    const snippet = raw.length > 6000 ? raw.slice(0, 6000) + "\n…" : raw;
    const lines = doc.splitTextToSize(snippet, 520);
    doc.text(lines, margin, y);
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

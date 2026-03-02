import { Router, type Request, type Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { requireAuth } from "../../shared/security/authMiddleware.js";

export const exportRouter = Router();

exportRouter.post("/pdf", requireAuth, async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().default("Elookup Report"),
    query: z.string().min(1),
    detectedType: z.string().min(1),
    results: z.any()
  }).parse(req.body);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="elookup-${Date.now()}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  // Header
  doc.fontSize(20).text("Elookup Intelligence Search", { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(11).text("System Report", { align: "center" });
  doc.moveDown();
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  doc.moveDown();
  doc.fontSize(12).text(`Query: ${body.query}`);
  doc.text(`Detected Type: ${body.detectedType}`);
  doc.text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown();

  doc.fontSize(13).text("Results", { underline: true });
  doc.moveDown(0.5);

  const jsonStr = JSON.stringify(body.results, null, 2);
  doc.font("Courier").fontSize(9).text(jsonStr, { width: 515 });

  doc.end();
});

// Express HTTP server. Single endpoint:
//   POST /process-files  (multipart: excel_file, pdf_file)
//   GET  /healthz
//
// Pipeline:
//   1. parseExcel  -> { code: name } map
//   2. soffice     PDF -> DOCX
//   3. replaceInDocx with word-boundary regex (exact matches only)
//   4. soffice     DOCX -> PDF
//   5. stream the resulting PDF back to the client

import express from "express";
import multer from "multer";
import cors from "cors";
import { parseExcel } from "./services/excelParser.js";
import { convert, findSoffice } from "./services/officeConverter.js";
import { replaceInDocx } from "./services/docxEditor.js";

const PORT = Number(process.env.PORT) || 8000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file

const app = express();

// Allowed origins: localhost for dev + FRONTEND_URL env var for production
// Set FRONTEND_URL=https://your-app.vercel.app in the Render dashboard
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: false,
    exposedHeaders: ["X-Replacements", "X-Matched-Codes", "X-Unmatched"],
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

app.get("/healthz", async (_req, res) => {
  let soffice = null;
  let sofficeError = null;
  try {
    soffice = await findSoffice();
  } catch (err) {
    sofficeError = err.message;
  }
  res.json({ status: "ok", soffice, sofficeError });
});

app.post(
  "/process-files",
  upload.fields([
    { name: "excel_file", maxCount: 1 },
    { name: "pdf_file", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const excel = req.files?.excel_file?.[0];
      const pdf = req.files?.pdf_file?.[0];
      if (!excel) return res.status(400).json({ error: "excel_file is required" });
      if (!pdf) return res.status(400).json({ error: "pdf_file is required" });

      if (!/\.xlsx$/i.test(excel.originalname || "")) {
        return res.status(415).json({ error: "excel_file must be .xlsx" });
      }
      if (!/\.pdf$/i.test(pdf.originalname || "")) {
        return res.status(415).json({ error: "pdf_file must be .pdf" });
      }
      if (!excel.size) return res.status(400).json({ error: "excel_file is empty" });
      if (!pdf.size) return res.status(400).json({ error: "pdf_file is empty" });

      // 1. Excel -> mapping
      let mapping;
      try {
        mapping = parseExcel(excel.buffer);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }

      // 2. PDF -> DOCX (LibreOffice)
      let docxBytes;
      try {
        docxBytes = await convert(pdf.buffer, "pdf", "docx");
      } catch (err) {
        return res.status(500).json({
          error: `PDF -> DOCX conversion failed: ${err.message}`,
        });
      }

      // 3. Edit DOCX text in place
      let edited;
      try {
        edited = replaceInDocx(docxBytes, mapping);
      } catch (err) {
        return res.status(500).json({ error: `DOCX edit failed: ${err.message}` });
      }

      // 4. DOCX -> PDF (LibreOffice)
      let outPdf;
      try {
        outPdf = await convert(edited.bytes, "docx", "pdf");
      } catch (err) {
        return res.status(500).json({
          error: `DOCX -> PDF conversion failed: ${err.message}`,
        });
      }

      const buf = Buffer.from(outPdf);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="processed.pdf"',
        "Content-Length": String(buf.length),
        "X-Replacements": String(edited.stats.totalReplacements),
        "X-Matched-Codes": String(edited.stats.matchedCodes),
        "X-Unmatched": edited.stats.unmatched.join(",").slice(0, 1000),
      });
      res.status(200).end(buf);
    } catch (err) {
      next(err);
    }
  }
);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, async () => {
  console.log(`pdf-coupon backend listening on http://localhost:${PORT}`);
  try {
    const bin = await findSoffice();
    console.log(`LibreOffice: ${bin}`);
  } catch (err) {
    console.warn("WARNING:", err.message);
  }
});

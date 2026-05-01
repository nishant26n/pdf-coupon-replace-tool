// Express HTTP server. Bulk PDF coupon-name replacement.
//
//   POST /process-bulk  (multipart: pdf_files[] - many files)
//   GET  /healthz
//
// Each uploaded PDF must be named "{couponCode}_{name}.pdf".
// For every file, the pipeline is:
//   1. parseFilename -> { code, name }
//   2. soffice  PDF  -> DOCX
//   3. replaceInDocx with \b<code>\b  =>  name
//   4. soffice  DOCX -> PDF
//   5. append the resulting PDF (under its original filename) to a
//      streaming ZIP that is returned to the client.
//
// Per-file errors do not abort the run — the offending file is recorded
// in summary.json (also added to the ZIP) and processing continues.

import express from "express";
import multer from "multer";
import cors from "cors";
import archiver from "archiver";
import { parseFilename } from "./services/filenameParser.js";
import { convert, findSoffice } from "./services/officeConverter.js";
import { replaceInDocx } from "./services/docxEditor.js";

const PORT = Number(process.env.PORT) || 8000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES_PER_REQUEST = 50;

const app = express();

// Allowed origins: localhost for dev + FRONTEND_URL env var for production.
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: false,
    exposedHeaders: ["X-Processed", "X-Skipped"],
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_REQUEST },
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
  "/process-bulk",
  upload.array("pdf_files", MAX_FILES_PER_REQUEST),
  async (req, res, next) => {
    try {
      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No PDF files uploaded" });
      }

      // Pre-validate every filename so totally broken inputs short-circuit
      // with a friendly 4xx instead of a half-built zip.
      const items = files.map((f) => {
        try {
          const { code, name } = parseFilename(f.originalname);
          return { file: f, code, name, error: null };
        } catch (err) {
          return { file: f, code: null, name: null, error: err.message };
        }
      });
      const allInvalid = items.every((i) => i.error || !i.file.size);
      if (allInvalid) {
        return res.status(400).json({
          error:
            "No usable PDFs in upload. Each filename must look like '{couponCode}_{name}.pdf'.",
          files: items.map((i) => ({
            name: i.file.originalname,
            error: i.error || "Empty file",
          })),
        });
      }

      // Buffer the ZIP into memory so we can set the X-Processed /
      // X-Skipped response headers BEFORE the body is sent. Streaming
      // would lock the headers as soon as archiver emits its first byte,
      // and the counts aren't known until the per-file loop finishes.
      // Memory is bounded by MAX_FILE_SIZE * MAX_FILES_PER_REQUEST.
      const summary = [];
      const zipChunks = [];
      const zip = archiver("zip", { zlib: { level: 6 } });
      zip.on("warning", (w) => console.warn("archiver warning:", w));
      zip.on("data", (chunk) => zipChunks.push(chunk));
      const zipDone = new Promise((resolve, reject) => {
        zip.on("end", resolve);
        zip.on("close", resolve);
        zip.on("error", reject);
      });

      for (const it of items) {
        const filename = it.file.originalname;
        if (it.error) {
          summary.push({ filename, status: "skipped", reason: it.error });
          continue;
        }
        if (!it.file.size) {
          summary.push({ filename, status: "skipped", reason: "Empty file" });
          continue;
        }
        try {
          const mapping = { [it.code]: it.name };
          const docxBytes = await convert(it.file.buffer, "pdf", "docx");
          const edited = replaceInDocx(docxBytes, mapping);
          const outPdf = await convert(edited.bytes, "docx", "pdf");
          zip.append(Buffer.from(outPdf), { name: filename });
          summary.push({
            filename,
            status: edited.stats.totalReplacements > 0 ? "ok" : "no-match",
            code: it.code,
            name: it.name,
            replacements: edited.stats.totalReplacements,
            matchedCodes: edited.stats.matchedCodes,
          });
        } catch (err) {
          console.error(`Processing failed for ${filename}:`, err);
          summary.push({ filename, status: "error", error: err.message });
        }
      }

      zip.append(JSON.stringify(summary, null, 2), { name: "summary.json" });
      await zip.finalize();
      await zipDone;

      const zipBuffer = Buffer.concat(zipChunks);
      const processed = summary.filter((s) => s.status === "ok").length;
      const skipped = summary.length - processed;

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="processed_pdfs.zip"',
        "Content-Length": String(zipBuffer.length),
        "X-Processed": String(processed),
        "X-Skipped": String(skipped),
      });
      res.status(200).end(zipBuffer);
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
    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(413)
        .json({ error: `Too many files (max ${MAX_FILES_PER_REQUEST})` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
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

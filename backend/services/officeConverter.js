// Thin wrapper around the LibreOffice command-line interface (`soffice`).
// Used twice per request: PDF -> DOCX, then DOCX -> PDF.
//
// LibreOffice MUST be installed on the host. If it is not on PATH, set
// the SOFFICE_BIN environment variable. Common install locations are
// auto-detected on Windows / macOS / Linux.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

const CANDIDATES = [
  process.env.SOFFICE_BIN,
  "soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/usr/local/bin/soffice",
  "/snap/bin/libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
].filter(Boolean);

let cachedBin = null;

export async function findSoffice() {
  if (cachedBin) return cachedBin;
  for (const p of CANDIDATES) {
    try {
      // For names without an explicit path, probe via --version. For
      // explicit paths, stat the file.
      if (path.isAbsolute(p) || p.includes(path.sep)) {
        await fs.access(p, fs.constants.X_OK | fs.constants.F_OK).catch(async () => {
          await fs.access(p);
        });
      } else {
        await execFileAsync(p, ["--version"], { timeout: 10_000 });
      }
      cachedBin = p;
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(
    "LibreOffice not found. Install LibreOffice (https://www.libreoffice.org) " +
      "and ensure `soffice` is on PATH or set the SOFFICE_BIN environment variable."
  );
}

// Map (inputExt, targetExt) -> { convertTo, infilter? }.
//
// `convertTo` is the value passed to `--convert-to`. The optional filter
// suffix (`docx:"MS Word 2007 XML"`) selects an explicit output filter,
// which is required when the source format is ambiguous between
// LibreOffice modules. PDFs can be opened by Draw or Writer; we want
// Writer so the result is editable text. `--infilter=writer_pdf_import`
// forces Writer to be the importer.
function buildConvertArgs(inputExt, targetExt) {
  if (inputExt === "pdf" && targetExt === "docx") {
    // Force the Writer PDF importer (otherwise Draw opens the PDF and
    // there is no Draw->docx export filter, which is the cause of the
    // "no export filter for ... .docx found" error).
    return { convertTo: "docx", infilter: "writer_pdf_import" };
  }
  return { convertTo: targetExt };
}

// Convert a buffer from one format to another via soffice. Uses a
// per-conversion temp directory so concurrent requests do not collide on
// the soffice user-profile lock; the directory is removed at the end.
export async function convert(inputBytes, inputExt, targetExt) {
  const bin = await findSoffice();
  const id = crypto.randomBytes(8).toString("hex");
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), `pdfcoupon-${id}-`));
  // soffice serializes on a shared user profile by default, blocking
  // parallel conversions. Give every call its own user profile so the
  // backend can serve concurrent requests.
  const userProfileDir = path.join(tmpdir, "profile");
  await fs.mkdir(userProfileDir, { recursive: true });

  const inputPath = path.join(tmpdir, `in.${inputExt}`);
  await fs.writeFile(inputPath, inputBytes);

  const { convertTo, infilter } = buildConvertArgs(inputExt, targetExt);

  const args = [
    `-env:UserInstallation=file:///${userProfileDir.replace(/\\/g, "/")}`,
    "--headless",
    "--norestore",
    "--nolockcheck",
    "--nologo",
  ];
  if (infilter) args.push(`--infilter=${infilter}`);
  args.push("--convert-to", convertTo, "--outdir", tmpdir, inputPath);

  // LibreOffice ships its own embedded Python. If the host has a system
  // Python with PYTHONHOME / PYTHONPATH set, those leak in and produce
  // "Could not find platform independent libraries <prefix>" warnings,
  // and on some setups break filter registration entirely. Strip the
  // Python env vars for the soffice subprocess.
  const env = { ...process.env };
  for (const k of ["PYTHONHOME", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONUSERBASE"]) {
    delete env[k];
  }

  try {
    await execFileAsync(bin, args, {
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      env,
    });
    const outPath = path.join(tmpdir, `in.${targetExt}`);
    return await fs.readFile(outPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `LibreOffice produced no output for ${inputExt}->${targetExt}. ` +
          `The input may be malformed, password-protected, or unsupported.`
      );
    }
    throw new Error(
      `LibreOffice conversion ${inputExt}->${targetExt} failed: ${err.message}`
    );
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
  }
}

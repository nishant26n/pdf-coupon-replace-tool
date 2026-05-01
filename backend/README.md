# Backend — PDF Coupon Replacer (Node.js + LibreOffice, BULK)

Bulk PDF processing. Each uploaded PDF is named `{couponCode}_{name}.pdf`;
the backend extracts the code + name from the filename, swaps the code
inside the PDF for the name, and returns all results in a single ZIP.

Pipeline per file: **PDF → DOCX → text edit → DOCX → PDF**, driven by
LibreOffice in headless mode. The DOCX editor uses word-boundary regex
on paragraph text so split tokens still match correctly and partial
matches (`UNKNOWN999`, `ABC123X`) never fire.

## Prerequisites

1. **Node.js** 20 or newer.
2. **LibreOffice** installed on the host. The location is auto-detected;
   override with `SOFFICE_BIN=...`.

## Setup

```bash
cd backend
npm install
npm run dev      # node --watch server.js
# or
npm start
```

Listens on http://localhost:8000.

## API

### `POST /process-bulk`

Multipart form fields:

| field        | type          | required | notes                                            |
|--------------|---------------|----------|--------------------------------------------------|
| `pdf_files`  | file (repeat) | yes (≥1) | each named `{couponCode}_{name}.pdf`             |

Limits:
- 10 MB per file (`MAX_FILE_SIZE`)
- 50 files per request (`MAX_FILES_PER_REQUEST`)

Filename parsing:
- Split at the FIRST underscore in the stem (filename minus `.pdf`).
- `ABC123_John Doe.pdf` → code `"ABC123"`, name `"John Doe"`
- Names may contain spaces and additional underscores
  (`ABC_John_M_Doe.pdf` → code `"ABC"`, name `"John_M_Doe"`).
- Files that fail to parse are skipped and recorded in `summary.json`.

Response (200): `application/zip`. Contents:
- One entry per successfully processed PDF, keeping its original filename.
- `summary.json` — per-file status (`ok` / `no-match` / `skipped` / `error`)
  with `replacements`, `matchedCodes`, and reason on failure.

Custom headers:
- `X-Processed` — count of files processed successfully
- `X-Skipped` — count of files skipped or errored

If the upload contains no usable filenames the server returns a JSON 400
listing each file's issue.

### `GET /healthz`

`{ "status": "ok", "soffice": "<path>", "sofficeError": "<msg or null>" }`.

## Exact-match guarantees

For each PDF the regex is `\b<code>\b` over each paragraph's
concatenated text. Word boundaries guarantee:

- `ABC123` matches inside `"1. ABC123"`.
- `ABC123` does NOT match inside `"ABC123X"`.
- `N999` does NOT match inside `"UNKNOWN999"` — even when LibreOffice
  splits it as `"UNKNOW"` + `"N999"` (line-level concat restores the
  word boundary).

## Layout preservation

LibreOffice's PDF importer wraps each visual line in a fixed-width
drawing frame. When the replacement name is wider than the original
code, the name would wrap inside the frame and produce broken layout
("John" / "Doe" on different lines). The DOCX editor compensates: for
every drawing whose text was edited it widens `<wp:extent cx>` and
`<a:ext cx>` by `replacement.length / code.length × 1.10`, and sets
`<wps:bodyPr wrap="none">` + `<a:spAutoFit/>` so the frame auto-grows.

## Known limitations

- LibreOffice's PDF import is heuristic — multi-column or complex
  layouts can shift slightly in the round-trip.
- Replacement renders in the substituted font when the original PDF
  used fonts not installed on the host. The `Dockerfile` installs
  Carlito (Calibri-compatible), Caladea (Cambria-compatible),
  Liberation, MS Core Fonts (best-effort), DejaVu, and Noto, which
  covers the common Windows-authored cases.
- Scanned (image-only) PDFs round-trip without text changes (no text
  layer to match).
- Each request invokes `soffice` twice per file. Files are processed
  sequentially to keep memory predictable; for very large batches
  consider scaling horizontally.

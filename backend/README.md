# Backend — PDF Coupon Replacer (Node.js + LibreOffice)

Strategy: **PDF → DOCX → edit → DOCX → PDF**, driven by LibreOffice in
headless mode. The DOCX editor uses word-boundary regex on paragraph
text (not run text) so split tokens still match correctly and partial
matches (`UNKNOWN999`, `ABC123X`) never fire.

## Prerequisites

1. **Node.js** 20 or newer.
2. **LibreOffice** installed on the host. The backend uses the `soffice`
   command-line interface. The location is auto-detected — common paths
   on Windows / macOS / Linux are tried in order. Override with
   `SOFFICE_BIN=...` if needed.

   - Windows: <https://www.libreoffice.org/download/download/> (default
     install path `C:\Program Files\LibreOffice\program\soffice.exe`)
   - macOS: `brew install --cask libreoffice` then `/Applications/LibreOffice.app/Contents/MacOS/soffice`
   - Debian / Ubuntu: `sudo apt install libreoffice --no-install-recommends`

   Verify: `soffice --version` should print `LibreOffice ...`.

If LibreOffice is missing the server still starts but `/process-files`
returns 500 with a clear "LibreOffice not found" error and `/healthz`
echoes the same message.

## Setup

```bash
cd backend
npm install
npm run dev      # node --watch server.js
# or
npm start
```

Listens on http://localhost:8000.

`GET /healthz` returns `{ "status": "ok", "soffice": "<path or null>",
"sofficeError": "<message or null>" }` so the frontend / monitoring
can confirm LibreOffice is wired up.

## API

### `POST /process-files`

Multipart form fields:

| field        | type | required | notes                                                  |
|--------------|------|----------|--------------------------------------------------------|
| `excel_file` | file | yes      | `.xlsx` with `Coupon Code` and `Name` columns          |
| `pdf_file`   | file | yes      | `.pdf` with selectable text                            |

Limits: 10 MB per file. PDFs that LibreOffice cannot open
(password-protected, malformed) return 500 with a descriptive error.

Response (200): `application/pdf` of the processed PDF.

Custom headers:

- `X-Replacements` — total occurrences replaced
- `X-Matched-Codes` — distinct codes that matched at least once
- `X-Unmatched` — comma-separated codes from the Excel that were never
  found in the document

Error response (4xx/5xx): JSON `{ "error": "..." }`.

## Pipeline

1. `parseExcel` builds `{ code: name }`, trimming and skipping empty rows.
2. `convert(pdfBuffer, "pdf", "docx")` calls LibreOffice headless with a
   per-request `UserInstallation` profile (so concurrent requests don't
   block on the shared profile lock).
3. `replaceInDocx` opens the DOCX (`pizzip`), parses
   `word/document.xml` (`@xmldom/xmldom`), walks every `<w:p>` paragraph,
   concatenates the text of all child `<w:t>` elements, and runs a
   single regex `\b(code1|code2|...)\b` (codes alternated longest-first,
   all `escapeRegex`d). Matches are written back into the original
   `<w:t>` elements: the first owning element receives the replacement
   name; subsequent elements (when a match spans runs) have only their
   matched chars cleared. `xml:space="preserve"` is set on every modified
   `<w:t>`. Paragraph order, surrounding runs, and run formatting are
   left untouched.
4. `convert(docxBuffer, "docx", "pdf")` produces the final PDF.
5. The temp directory used for each LibreOffice call is removed in
   `finally`.

## Why edit at the **paragraph** level

DOCX produced by LibreOffice's PDF importer routinely splits a single
visual token across multiple `<w:r>` runs (font / kerning hints), so run
boundaries are NOT word boundaries. Running the regex per run would let
a run beginning with `"N999"` produce a false match inside `"UNKNOWN999"`
(start-of-string is a `\b`). Concatenating the text of all `<w:t>`
elements per paragraph before applying the regex restores the true word
context.

## Exact-match guarantees

- `ABC123` matches inside `"1. ABC123"` (boundaries on both sides).
- `ABC123` does NOT match inside `"ABC123X"` (no boundary after `3`).
- `N999` does NOT match inside `"UNKNOWN999"` (no boundary between `W`
  and `N`) — even when LibreOffice splits the word as `"UNKNOW"` +
  `"N999"`.
- `ABC123` matches inside `"ABC123,"` and the comma is preserved
  (only the matched chars in the run are rewritten).

## Known limitations

These are LibreOffice's PDF import limits, not the backend's:

- **Layout drift**: PDF → DOCX is a heuristic conversion. Multi-column
  layouts, exact glyph positions, and complex tables can shift slightly
  in the round-trip. Plain coupon documents reproduce well.
- **Fonts may change** if the original PDF embedded fonts that LibreOffice
  does not have installed locally.
- **Images and form fields** survive the round-trip but are re-rendered;
  vector content can re-rasterize.
- **Scanned (image-only) PDFs** convert to a DOCX with no text layer;
  nothing is matched and the output is the round-tripped PDF.
- **Performance**: each request invokes `soffice` twice (~2–6 s per
  call on typical hardware). Concurrent requests use isolated user
  profiles so they don't serialize on a shared lock.

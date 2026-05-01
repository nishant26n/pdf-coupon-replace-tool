# PDF Coupon Replacer (Bulk)

Full-stack tool for bulk swapping coupon codes inside PDFs with names
encoded in the filename itself.

- **Backend**: Node.js + Express + LibreOffice CLI + `pizzip` +
  `@xmldom/xmldom` + `archiver` — see [`backend/README.md`](backend/README.md)
- **Frontend**: React + Vite + Tailwind — see [`frontend/README.md`](frontend/README.md)

## Filename convention

Each uploaded PDF must be named:

```
{couponCode}_{name}.pdf
```

Example:
```
ABC123_John Doe.pdf       => find "ABC123" in the PDF, replace with "John Doe"
XYZ789_Jane Smith.pdf     => find "XYZ789", replace with "Jane Smith"
```

Splitting happens at the first underscore. Names may contain spaces and
additional underscores. Files that don't conform are skipped and noted
in the per-batch `summary.json`.

## Prerequisites

- Node.js 20+
- **LibreOffice** installed on the backend host (`soffice` is invoked
  twice per file: PDF → DOCX, DOCX → PDF). Set
  `SOFFICE_BIN=/path/to/soffice` to override auto-detection.

## Quick start

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Backend listens on <http://localhost:8000>. `GET /healthz` confirms
LibreOffice is wired up.

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>, drop your `{code}_{name}.pdf` files,
click **Process & download ZIP**. `processed_pdfs.zip` downloads
automatically.

## How it works (per file)

1. Filename parsed → `{ code, name }`.
2. **LibreOffice** converts the PDF to DOCX.
3. Backend opens the DOCX, walks every paragraph, concatenates all
   `<w:t>` text values, and runs `\b<code>\b` regex (case-sensitive,
   special chars escaped). Matches that span runs are written back into
   the correct text elements; paragraph structure and run formatting
   stay intact.
4. Each modified drawing-frame's `<wp:extent cx>` is widened
   proportionally and `<wps:bodyPr wrap="none">` + `<a:spAutoFit/>` are
   set so multi-word names render on a single line.
5. **LibreOffice** converts the edited DOCX back to PDF.
6. Result appended to a streaming ZIP under the original filename.

## ZIP contents

- One processed PDF per successful input, original filename preserved.
- `summary.json` — array of `{ filename, status, code, name,
  replacements, matchedCodes, reason?, error? }`.

## Limits

- 10 MB per file
- 50 files per request
- LibreOffice's PDF import is heuristic — see
  [`backend/README.md`](backend/README.md#known-limitations) for full
  trade-offs

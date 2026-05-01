# PDF Coupon Replacer

Full-stack tool that swaps coupon codes inside a PDF with names from an
Excel sheet by round-tripping through DOCX.

- **Backend**: Node.js + Express + LibreOffice CLI + `xlsx` + `pizzip` +
  `@xmldom/xmldom` — see [`backend/README.md`](backend/README.md)
- **Frontend**: React + Vite + Tailwind — see [`frontend/README.md`](frontend/README.md)

## Prerequisites

- Node.js 20+
- **LibreOffice** installed on the backend host (the `soffice` CLI is
  invoked twice per request: PDF → DOCX, DOCX → PDF). Set
  `SOFFICE_BIN=/path/to/soffice` to override auto-detection. See
  [`backend/README.md`](backend/README.md#prerequisites) for install
  instructions per OS.

## Quick start

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Backend listens on <http://localhost:8000>. `GET /healthz` confirms
whether `soffice` was found.

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>, upload `.xlsx` and `.pdf`, click
**Process Files**. The processed PDF downloads automatically.

## How it works

1. Excel must have `Coupon Code` and `Name` headers (any column order).
2. The backend builds `{ code: name }` (case-sensitive values, trimmed,
   empty rows skipped).
3. **LibreOffice** converts the uploaded PDF to DOCX.
4. The backend opens the DOCX, walks every paragraph, concatenates all
   `<w:t>` text values per paragraph, and runs a single
   `\b(code1|code2|...)\b` regex (codes alternated longest-first). Word
   boundaries guarantee that codes are only replaced as whole tokens —
   `N999` is not replaced inside `UNKNOWN999`, `ABC123` is not replaced
   inside `ABC123X`. Matches that span runs are written back into the
   correct text elements; paragraph structure and run formatting stay
   intact.
5. **LibreOffice** converts the edited DOCX back to PDF.
6. The processed PDF streams to the client.

## Limits

- 10 MB per file (`MAX_FILE_SIZE` in `backend/server.js`)
- PDFs must contain a text layer; scanned PDFs round-trip without
  changes
- LibreOffice's PDF import is heuristic — see
  [`backend/README.md`](backend/README.md#known-limitations) for the
  full list of trade-offs

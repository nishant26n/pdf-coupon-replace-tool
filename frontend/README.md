# Frontend — PDF Coupon Replacer (Bulk)

React + Vite + Tailwind CSS UI. Drop in many PDFs named
`{couponCode}_{name}.pdf`; backend swaps each coupon code inside its PDF
with the corresponding name and returns a ZIP.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

The dev server expects the backend at `http://localhost:8000`. Override
via `VITE_API_BASE` in a `.env` file or at build time:

```
VITE_API_BASE=https://api.example.com
```

## Build

```bash
npm run build      # production bundle in dist/
npm run preview    # serve dist/ locally
```

## UI

- Drag and drop or click to add multiple PDF files.
- Each filename is parsed live: invalid names show a red error label
  and will be skipped server-side.
- Process button is disabled until at least one file is selected.
- File size validated client-side (10 MB / file, up to 50 files).
- On success the ZIP `processed_pdfs.zip` downloads automatically.
- Status banner reports counts of processed vs skipped files.
- Each file in the ZIP keeps its original name; `summary.json` lists
  per-file status.
- Reset button clears state for another run.

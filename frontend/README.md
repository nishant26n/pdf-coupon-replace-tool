# Frontend — PDF Coupon Replacer

React + Vite + Tailwind CSS UI.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

The dev server expects the backend at `http://localhost:8000`. To point it
elsewhere, set `VITE_API_BASE` in a `.env` file:

```
VITE_API_BASE=http://localhost:8000
```

## Build

```bash
npm run build      # production bundle in dist/
npm run preview    # serve dist/ locally
```

## UI

- Drag-and-drop or click to upload an Excel and a PDF
- Process button is disabled until both files are selected
- File size validated client-side (10 MB limit per file)
- On success, the processed PDF downloads automatically
- Banner shows replacement counts and any unmatched codes
- Reset button clears state for another run

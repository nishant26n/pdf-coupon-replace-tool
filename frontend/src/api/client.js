// Strip trailing slash so VITE_API_BASE="https://example.com/" still works correctly
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

export async function processFiles(excelFile, pdfFile) {
  const fd = new FormData();
  fd.append("excel_file", excelFile);
  fd.append("pdf_file", pdfFile);

  const res = await fetch(`${API_BASE}/process-files`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
      else if (body.detail) msg = body.detail;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  return {
    blob,
    replacements: Number(res.headers.get("X-Replacements") || 0),
    matchedCodes: Number(res.headers.get("X-Matched-Codes") || 0),
    unmatched: (res.headers.get("X-Unmatched") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function downloadBlob(blob, filename = "processed.pdf") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Strip trailing slash so VITE_API_BASE="https://example.com/" still works correctly
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

export async function processBulk(files) {
  const fd = new FormData();
  for (const f of files) fd.append("pdf_files", f);

  const res = await fetch(`${API_BASE}/process-bulk`, {
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
      // body wasn't JSON; fall through with HTTP status
    }
    throw new Error(msg);
  }

  return {
    blob: await res.blob(),
    processed: Number(res.headers.get("X-Processed") || 0),
    skipped: Number(res.headers.get("X-Skipped") || 0),
  };
}

export function downloadBlob(blob, filename = "processed_pdfs.zip") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

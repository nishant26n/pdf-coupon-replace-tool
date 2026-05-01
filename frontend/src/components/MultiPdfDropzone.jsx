import { useRef, useState } from "react";

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// Parse "{couponCode}_{name}.pdf" the same way the backend does, so the
// UI can flag broken filenames before the user submits. Returns either
// { code, name } or { error }.
function parseFilename(name) {
  if (!/\.pdf$/i.test(name)) return { error: "not a .pdf" };
  const stem = name.replace(/\.pdf$/i, "");
  const idx = stem.indexOf("_");
  if (idx === -1) return { error: 'missing "_" separator' };
  const code = stem.slice(0, idx).trim();
  const rest = stem.slice(idx + 1).trim();
  if (!code) return { error: "empty coupon code" };
  if (!rest) return { error: "empty name" };
  return { code, name: rest };
}

export default function MultiPdfDropzone({
  files,
  onChange,
  maxSize,
  maxFiles,
  disabled,
}) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState("");

  function ingest(list) {
    if (disabled) return;
    const incoming = Array.from(list || []);
    if (incoming.length === 0) return;

    const errors = [];
    const accepted = [];

    for (const f of incoming) {
      if (!/\.pdf$/i.test(f.name)) {
        errors.push(`"${f.name}": not a .pdf`);
        continue;
      }
      if (maxSize && f.size > maxSize) {
        errors.push(`"${f.name}": exceeds ${formatBytes(maxSize)}`);
        continue;
      }
      // Skip duplicates (by name + size) already in the list.
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      accepted.push(f);
    }

    let next = [...files, ...accepted];
    if (maxFiles && next.length > maxFiles) {
      errors.push(`Truncated to ${maxFiles} files`);
      next = next.slice(0, maxFiles);
    }

    setError(errors.join(" • "));
    onChange(next);
  }

  function removeAt(i) {
    const next = files.slice();
    next.splice(i, 1);
    onChange(next);
  }

  function clearAll() {
    onChange([]);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-700">
          PDF files
        </label>
        {files.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            Clear all
          </button>
        )}
      </div>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          ingest(e.dataTransfer.files);
        }}
        className={[
          "border-2 border-dashed rounded-lg p-6 cursor-pointer transition select-none",
          hover ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => ingest(e.target.files)}
          disabled={disabled}
        />
        <div className="text-center">
          <p className="text-sm text-slate-600">
            Drag and drop PDFs, or{" "}
            <span className="text-blue-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Filename format: <code>{"{couponCode}_{name}.pdf"}</code> · max{" "}
            {formatBytes(maxSize)} · up to {maxFiles} files
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {files.map((f, i) => {
            const parsed = parseFilename(f.name);
            return (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-start justify-between gap-3 px-3 py-2 bg-white"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {f.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(f.size)}
                    {parsed.error ? (
                      <span className="text-red-600"> · {parsed.error}</span>
                    ) : (
                      <span className="text-slate-500">
                        {" "}
                        · code <code className="bg-slate-100 px-1 rounded">{parsed.code}</code>{" "}
                        → name <code className="bg-slate-100 px-1 rounded">{parsed.name}</code>
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  disabled={disabled}
                  className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 shrink-0"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

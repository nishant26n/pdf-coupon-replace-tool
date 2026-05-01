import { useRef, useState } from "react";

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileDropzone({
  label,
  accept,
  acceptExt,
  file,
  onFile,
  maxSize,
  disabled,
}) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [localError, setLocalError] = useState("");

  function validate(f) {
    if (!f) return "";
    if (acceptExt && !acceptExt.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      return `File must be ${acceptExt.join(" or ")}`;
    }
    if (maxSize && f.size > maxSize) {
      return `File exceeds ${formatBytes(maxSize)} limit`;
    }
    return "";
  }

  function handleFiles(list) {
    const f = list && list[0];
    if (!f) return;
    const err = validate(f);
    if (err) {
      setLocalError(err);
      onFile(null);
      return;
    }
    setLocalError("");
    onFile(f);
  }

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>

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
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
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
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />

        {file ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
                setLocalError("");
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="ml-3 text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-slate-600">
              Drag and drop, or <span className="text-blue-600 font-medium">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {acceptExt?.join(", ")} · max {formatBytes(maxSize)}
            </p>
          </div>
        )}
      </div>

      {localError && (
        <p className="text-xs text-red-600 mt-2">{localError}</p>
      )}
    </div>
  );
}

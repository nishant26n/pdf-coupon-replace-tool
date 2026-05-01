import { useState } from "react";
import FileDropzone from "./components/FileDropzone.jsx";
import ProcessButton from "./components/ProcessButton.jsx";
import StatusBanner from "./components/StatusBanner.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { processFiles, downloadBlob } from "./api/client.js";

const MAX_SIZE = 10 * 1024 * 1024;

export default function App() {
  const [excelFile, setExcelFile] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [banner, setBanner] = useState({ title: "", message: "", details: [] });

  const canSubmit = excelFile && pdfFile && status !== "loading";

  async function handleSubmit() {
    setStatus("loading");
    setBanner({
      title: "Processing files...",
      message: "Replacing coupon codes in your PDF.",
      details: [],
    });
    try {
      const result = await processFiles(excelFile, pdfFile);
      downloadBlob(result.blob, "processed.pdf");
      setStatus("success");
      setBanner({
        title: "Done — downloaded processed.pdf",
        message: `${result.replacements} replacement${result.replacements === 1 ? "" : "s"} across ${result.matchedCodes} matched code${result.matchedCodes === 1 ? "" : "s"}.`,
        details:
          result.unmatched.length > 0
            ? [`Unmatched codes: ${result.unmatched.join(", ")}`]
            : [],
      });
    } catch (err) {
      setStatus("error");
      setBanner({ title: "Error", message: err.message, details: [] });
    }
  }

  function handleReset() {
    setExcelFile(null);
    setPdfFile(null);
    setStatus("idle");
    setBanner({ title: "", message: "", details: [] });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            PDF Coupon Replacer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload an Excel file and a PDF — coupon codes in the PDF are replaced
            with the matching names.
          </p>
        </header>

        <div className="space-y-5">
          <FileDropzone
            label="Excel file (.xlsx)"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            acceptExt={[".xlsx"]}
            file={excelFile}
            onFile={setExcelFile}
            maxSize={MAX_SIZE}
            disabled={status === "loading"}
          />

          <FileDropzone
            label="PDF file"
            accept=".pdf,application/pdf"
            acceptExt={[".pdf"]}
            file={pdfFile}
            onFile={setPdfFile}
            maxSize={MAX_SIZE}
            disabled={status === "loading"}
          />

          <ProgressBar active={status === "loading"} />

          <ProcessButton
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={status === "loading"}
          />

          <StatusBanner
            status={status}
            title={banner.title}
            message={banner.message}
            details={banner.details}
          />

          {(status === "success" || status === "error") && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

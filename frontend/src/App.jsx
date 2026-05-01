import { useState } from "react";
import MultiPdfDropzone from "./components/MultiPdfDropzone.jsx";
import ProcessButton from "./components/ProcessButton.jsx";
import StatusBanner from "./components/StatusBanner.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { processBulk, downloadBlob } from "./api/client.js";

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 50;

export default function App() {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [banner, setBanner] = useState({ title: "", message: "", details: [] });

  const canSubmit = files.length > 0 && status !== "loading";

  async function handleSubmit() {
    setStatus("loading");
    setBanner({
      title: `Processing ${files.length} file${files.length === 1 ? "" : "s"}...`,
      message:
        "Each PDF is converted to DOCX, the coupon code is swapped for the name, and re-rendered to PDF.",
      details: [],
    });
    try {
      const result = await processBulk(files);
      downloadBlob(result.blob, "processed_pdfs.zip");
      setStatus("success");
      setBanner({
        title: "Done — downloaded processed_pdfs.zip",
        message: `${result.processed} processed${
          result.skipped ? `, ${result.skipped} skipped (see summary.json in the zip)` : ""
        }.`,
        details: [],
      });
    } catch (err) {
      setStatus("error");
      setBanner({ title: "Error", message: err.message, details: [] });
    }
  }

  function handleReset() {
    setFiles([]);
    setStatus("idle");
    setBanner({ title: "", message: "", details: [] });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            PDF Coupon Replacer — Bulk
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Drop in PDFs named <code>{"{couponCode}_{name}.pdf"}</code>. Each file is
            processed and the results are zipped for download.
          </p>
        </header>

        <div className="space-y-5">
          <MultiPdfDropzone
            files={files}
            onChange={setFiles}
            maxSize={MAX_SIZE}
            maxFiles={MAX_FILES}
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

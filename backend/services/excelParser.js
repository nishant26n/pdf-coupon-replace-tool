// Excel parser using SheetJS (xlsx).
// Reads first sheet, validates "Coupon Code" and "Name" headers
// (case-insensitive, trimmed), returns { code: name } map.
import XLSX from "xlsx";

export function parseExcel(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    throw new Error(`Could not open Excel file: ${err.message}`);
  }

  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error("Excel file has no sheets");

  const ws = wb.Sheets[firstSheet];
  // sheet_to_json with header:1 gives raw rows including the header row.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  if (!rows.length) throw new Error("Excel file is empty");

  const header = rows[0].map((cell) => String(cell ?? "").trim().toLowerCase());
  const codeCol = header.indexOf("coupon code");
  const nameCol = header.indexOf("name");

  const missing = [];
  if (codeCol === -1) missing.push("Coupon Code");
  if (nameCol === -1) missing.push("Name");
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  const mapping = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[codeCol] ?? "").trim();
    const name = String(row[nameCol] ?? "").trim();
    if (!code || !name) continue;
    mapping[code] = name;
  }

  if (Object.keys(mapping).length === 0) {
    throw new Error("Excel contains no rows with both Coupon Code and Name");
  }
  return mapping;
}

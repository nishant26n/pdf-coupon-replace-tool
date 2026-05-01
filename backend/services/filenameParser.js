// Parse a filename of the form "{couponCode}_{name}.pdf".
// The underscore is split on the FIRST occurrence so that names
// containing additional underscores (e.g. "ABC_John_M_Doe.pdf") still
// produce the intended split: code="ABC", name="John_M_Doe".
//
// Throws Error with a descriptive message if the filename does not
// conform; the caller turns the error into a per-file skip entry.
export function parseFilename(filename) {
  if (!filename) throw new Error("Empty filename");
  if (!/\.pdf$/i.test(filename)) {
    throw new Error(`Not a PDF: ${filename}`);
  }
  const stem = filename.replace(/\.pdf$/i, "");
  const idx = stem.indexOf("_");
  if (idx === -1) {
    throw new Error(
      `Filename "${filename}" missing "_" separator (expected {code}_{name}.pdf)`
    );
  }
  const code = stem.slice(0, idx).trim();
  const name = stem.slice(idx + 1).trim();
  if (!code) throw new Error(`Empty coupon code in filename: ${filename}`);
  if (!name) throw new Error(`Empty name in filename: ${filename}`);
  return { code, name };
}

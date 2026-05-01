// In-place text replacement on a DOCX (Open Office XML) document.
//
// A DOCX is a ZIP whose `word/document.xml` contains text laid out as
// `<w:t>` elements grouped inside `<w:r>` runs inside `<w:p>` paragraphs.
// LibreOffice's PDF -> DOCX conversion frequently splits a single visual
// token across multiple runs (different fonts, kerning, page layout
// hints), so run-level boundaries are NOT word boundaries.
//
// To replace exactly the coupon codes we therefore:
//
//   1. Walk every paragraph and concatenate the text values of all of
//      its `<w:t>` elements, building a per-character index back to
//      (textElement, kInTextElement).
//   2. Run a single regex
//          \b(code1|code2|...)\b
//      (codes alternated longest-first, all `escapeRegex`d) over the
//      paragraph text. The `\b` anchors guarantee that:
//         "ABC123" in "ABC123X" cannot match
//         "N999"   in "UNKNOWN999" cannot match
//         "ABC123" in "ABC123," DOES match (comma is non-word).
//   3. For every match, group the affected characters by their owning
//      `<w:t>` element. The first owning element receives the whole
//      replacement name; later owning elements (if the match spans runs)
//      have their matched chars cleared. Existing prefix and suffix in
//      the same elements stay verbatim, so neighbouring text is never
//      disturbed.
//   4. `xml:space="preserve"` is set on every modified `<w:t>` so Word
//      does not strip leading or trailing whitespace.

import PizZip from "pizzip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
// LibreOffice's PDF importer emits text-frame bodyPr in the wps
// namespace, not drawingml. We have to look up bodyPr in both.
const WPS_NS =
  "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";

// Safety margin applied on top of the length-ratio expansion so the
// frame still has a few EMUs of slack after the text is laid out at
// LibreOffice's slightly different metric than Word.
const FRAME_EXPAND_MARGIN = 1.10;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Set every <w:sectPr><w:pgMar/> to all-zero so the rendered PDF has no
// extra page padding around the imported content.
function zeroPageMargins(doc) {
  const sectPrs = doc.getElementsByTagNameNS(W_NS, "sectPr");
  for (let i = 0; i < sectPrs.length; i++) {
    const sp = sectPrs[i];
    let pgMar = sp.getElementsByTagNameNS(W_NS, "pgMar")[0];
    if (!pgMar) {
      pgMar = doc.createElementNS(W_NS, "w:pgMar");
      sp.appendChild(pgMar);
    }
    for (const k of [
      "top",
      "right",
      "bottom",
      "left",
      "header",
      "footer",
      "gutter",
    ]) {
      pgMar.setAttribute(`w:${k}`, "0");
    }
  }
}

function buildPattern(codes) {
  const ordered = [...codes].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${ordered.map(escapeRegex).join("|")})\\b`, "g");
}

// Walk up from a `<w:t>` (or any descendant) to its enclosing `<w:drawing>`
// — the OOXML element that wraps an anchored / inline text frame produced
// by LibreOffice's PDF importer. Returns null when the element is in a
// flowing paragraph (not inside a frame), in which case no expansion is
// needed.
function findEnclosingDrawing(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (cur.localName === "drawing" && cur.namespaceURI === W_NS) return cur;
    cur = cur.parentNode;
  }
  return null;
}

// LibreOffice imports each PDF text token into a fixed-width drawing
// frame whose `<wp:extent cx="..."/>` matches the original glyph width.
// When the replacement name is wider than the original code, the layout
// engine wraps inside the frame and the second word lands on a clipped
// next line ("John" / "Doe" on different lines).
//
// Mitigation:
//   1. Multiply the frame's `cx` by the expansion ratio (newLen / origLen)
//      with a safety margin, so the frame is wide enough to hold the
//      replacement on a single line.
//   2. Set `<a:bodyPr wrap="none">` and add `<a:spAutoFit/>` so renderers
//      that honour OOXML body-properties auto-size the frame.
//
// The expansion is per-frame, applied once with the largest ratio across
// all matches in that frame.
function expandFrame(drawingEl, ratio) {
  if (!drawingEl) return;
  const effective = Math.max(ratio * FRAME_EXPAND_MARGIN, 1);

  // Widen <wp:extent cx="..."/> (the layout box) and any nested
  // <a:ext cx="..."/> (the shape's own size).
  const extents = [
    ...Array.from(drawingEl.getElementsByTagNameNS(WP_NS, "extent")),
    ...Array.from(drawingEl.getElementsByTagNameNS(A_NS, "ext")),
  ];
  for (const e of extents) {
    const cx = parseInt(e.getAttribute("cx") || "0", 10);
    if (cx > 0) {
      e.setAttribute("cx", String(Math.ceil(cx * effective)));
    }
  }

  // Make every bodyPr non-wrapping and auto-fit to text. LibreOffice
  // emits <wps:bodyPr ...>; PowerPoint-style content uses <a:bodyPr ...>.
  // We patch both. The autofit child element belongs to drawingml (a:)
  // regardless of which namespace bodyPr lives in.
  const ownerDoc = drawingEl.ownerDocument;
  const bodyPrs = [
    ...Array.from(drawingEl.getElementsByTagNameNS(A_NS, "bodyPr")),
    ...Array.from(drawingEl.getElementsByTagNameNS(WPS_NS, "bodyPr")),
  ];
  const childAutofitNames = ["noAutofit", "normAutofit", "spAutoFit"];
  for (const bp of bodyPrs) {
    bp.setAttribute("wrap", "none");
    const toRemove = [];
    for (let c = bp.firstChild; c; c = c.nextSibling) {
      if (
        c.nodeType === 1 &&
        c.namespaceURI === A_NS &&
        childAutofitNames.includes(c.localName)
      ) {
        toRemove.push(c);
      }
    }
    for (const c of toRemove) bp.removeChild(c);
    const spAutoFit = ownerDoc.createElementNS(A_NS, "a:spAutoFit");
    bp.appendChild(spAutoFit);
  }
}

export function replaceInDocx(docxBuffer, rawMapping) {
  const mapping = {};
  for (const [k, v] of Object.entries(rawMapping)) {
    const ck = String(k).trim();
    const cv = String(v).trim();
    if (ck && cv) mapping[ck] = cv;
  }
  const codes = Object.keys(mapping);
  const stats = { matchedCodes: 0, totalReplacements: 0, unmatched: [] };
  if (codes.length === 0) return { bytes: docxBuffer, stats };

  let zip;
  try {
    zip = new PizZip(docxBuffer);
  } catch (err) {
    throw new Error(`Could not open DOCX: ${err.message}`);
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Invalid DOCX: missing word/document.xml");

  const xml = docFile.asText();
  const doc = new DOMParser({ onError: () => {} }).parseFromString(
    xml,
    "application/xml"
  );

  const pattern = buildPattern(codes);
  const matched = new Set();
  // For every drawing frame we touched, track the maximum
  // newName.length / matchedCode.length ratio. After all paragraphs are
  // rewritten we widen each affected frame once with that ratio.
  const frameRatios = new Map();

  const paragraphs = doc.getElementsByTagNameNS(W_NS, "p");
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const tEls = p.getElementsByTagNameNS(W_NS, "t");
    if (tEls.length === 0) continue;

    // Build per-character map back to (textNode, offsetInTextNode).
    const charMap = [];
    let paraText = "";
    for (let j = 0; j < tEls.length; j++) {
      const tEl = tEls[j];
      const value = tEl.firstChild?.nodeValue ?? "";
      for (let k = 0; k < value.length; k++) {
        charMap.push({ tEl, kInText: k });
      }
      paraText += value;
    }
    if (paraText.length === 0) continue;

    pattern.lastIndex = 0;
    let m;
    const matches = [];
    while ((m = pattern.exec(paraText)) !== null) {
      const code = m[1];
      matched.add(code);
      const matchedText = m[0];
      const replacement = mapping[code];
      matches.push({
        startG: m.index,
        endG: m.index + code.length,
        name: replacement,
        ratio: replacement.length / Math.max(matchedText.length, 1),
      });
    }
    if (matches.length === 0) continue;

    // Record the largest expansion ratio for the enclosing drawing frame
    // (if this paragraph is inside one). The frame will be widened in a
    // single post-pass so edits in other paragraphs of the same frame
    // (rare but possible) accumulate.
    const drawingForPara = findEnclosingDrawing(p);
    if (drawingForPara) {
      const localRatio = Math.max(...matches.map((mm) => mm.ratio));
      const prev = frameRatios.get(drawingForPara) ?? 1;
      if (localRatio > prev) frameRatios.set(drawingForPara, localRatio);
    }

    // For each <w:t>, collect a list of slice rewrites { start, end, repl }.
    // Then apply them per element by rebuilding the string from the right.
    const editsByEl = new Map();
    for (const mm of matches) {
      const affected = charMap.slice(mm.startG, mm.endG);
      // Group affected chars by owning element, in encounter order.
      const perEl = []; // ordered list of { el, start, end }
      for (const { tEl, kInText } of affected) {
        const last = perEl[perEl.length - 1];
        if (last && last.el === tEl && kInText === last.end) {
          last.end = kInText + 1;
        } else {
          perEl.push({ el: tEl, start: kInText, end: kInText + 1 });
        }
      }
      // First element gets the replacement name; subsequent elements
      // (if any) have their matched range cleared.
      perEl.forEach((entry, idx) => {
        if (!editsByEl.has(entry.el)) editsByEl.set(entry.el, []);
        editsByEl.get(entry.el).push({
          start: entry.start,
          end: entry.end,
          repl: idx === 0 ? mm.name : "",
        });
      });
      stats.totalReplacements += 1;
    }

    for (const [el, edits] of editsByEl) {
      const orig = el.firstChild?.nodeValue ?? "";
      edits.sort((a, b) => b.start - a.start);
      let next = orig;
      for (const e of edits) {
        next = next.slice(0, e.start) + e.repl + next.slice(e.end);
      }
      // Replace the entire text content. Direct nodeValue assignment is
      // not reliably reflected by xmldom's serializer in all versions, so
      // we remove every existing child and append a fresh text node.
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(doc.createTextNode(next));
      // Preserve leading/trailing spaces on serialization.
      el.setAttribute("xml:space", "preserve");
    }
  }

  // Apply frame expansions once per drawing.
  for (const [drawing, ratio] of frameRatios) {
    expandFrame(drawing, ratio);
  }

  // Strip the page margins LibreOffice's PDF importer inserts. Without
  // this, every section is given default Word margins (~1 cm top/left,
  // sometimes more) and the re-rendered PDF has visible blank space on
  // the left and top compared to the original. Drawings are positioned
  // with relativeFrom="column", so they shift left/up by the same amount
  // we trim — landing back at their original PDF page coordinates.
  zeroPageMargins(doc);

  stats.matchedCodes = matched.size;
  stats.unmatched = codes.filter((c) => !matched.has(c)).sort();

  const newXml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", newXml);
  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  return { bytes: out, stats };
}

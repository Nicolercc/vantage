// ─── JSON Extraction Helper ───────────────────────────────────────────────
// Robustly extract valid JSON from Claude response that may contain:
// - Markdown code fences (```json ... ```)
// - Extra text before/after JSON
// - Incomplete JSON
function findFirstJsonBracketIndex(s: string): number {
  const i = s.indexOf("{");
  const j = s.indexOf("[");
  if (i === -1) return j;
  if (j === -1) return i;
  return Math.min(i, j);
}

export function extractJSON(text: string): object {
  // Remove markdown code fences (opening); strip trailing fence if present
  const cleaned = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  const startIdx = findFirstJsonBracketIndex(cleaned);

  if (startIdx === -1) {
    throw new Error("No JSON object or array found in response");
  }
  
  // Use the first character as the opening bracket
  const openChar = cleaned[startIdx];
  const closeChar = openChar === "{" ? "}" : "]";
  
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIdx; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === openChar) depth++;
    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  
  if (endIdx === -1) {
    throw new Error("Malformed JSON: could not find matching closing bracket");
  }
  
  const jsonStr = cleaned.substring(startIdx, endIdx);
  return JSON.parse(jsonStr);
}

/**
 * Coerce AI string/number coords. A pair is either fully valid or unknown:
 * an unusable lat or lng makes both null, so a missing place never becomes
 * a real point on the map.
 */
export function normalizeLatLng(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | { lat: null; lng: null } {
  const parse = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "string") return NaN;
    const t = v.trim().replace(/,/g, "");
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  };
  const la = parse(lat);
  const ln = parse(lng);
  const valid =
    Number.isFinite(la) && la >= -90 && la <= 90 &&
    Number.isFinite(ln) && ln >= -180 && ln <= 180;
  return valid ? { lat: la, lng: ln } : { lat: null, lng: null };
}

/** When the model adds preamble/postamble, try fenced blocks or trailing JSON. */
export function tryExtractJsonFallback(text: string): object | null {
  const fencedBlocks: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1]?.trim();
    if (inner) fencedBlocks.push(inner);
  }
  for (const block of fencedBlocks.reverse()) {
    try {
      return extractJSON(block);
    } catch {
      /* try next */
    }
  }
  const lineStart = text.lastIndexOf("\n{");
  if (lineStart !== -1) {
    try {
      return extractJSON(text.slice(lineStart + 1));
    } catch {
      /* */
    }
  }
  const lb = text.lastIndexOf("{");
  if (lb !== -1) {
    try {
      return extractJSON(text.slice(lb));
    } catch {
      /* */
    }
  }
  return null;
}

/** The most parties a brief lists; the prompt asks for two to five. */
export const MAX_ACTORS = 6;

/**
 * The model's list of parties, each named once and at most MAX_ACTORS of them.
 * A model can fall into a loop and repeat the same few names dozens of times;
 * the reader should see each party once. Anything that is not a list is passed
 * through for the contract check to reject.
 */
export function uniqueActors(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = item.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_ACTORS) break;
  }
  return out;
}

/** Keep definitions only for terms readers can find in the displayed brief. */
export function normalizeGlossary(raw: unknown, fields: unknown[]) {
  if (!Array.isArray(raw)) return null;
  const text = fields.filter((field): field is string => typeof field === "string").join("\n");
  const entries: { term: string; meaning: string }[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item?.term !== "string" || typeof item?.meaning !== "string") continue;
    const term = item.term.trim();
    const meaning = item.meaning.trim();
    const key = term.toLowerCase();
    if (!term || term.length > 80 || !meaning || meaning.length > 240 || meaning.split(/\s+/).length > 25 || seen.has(key)) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(text)) continue;
    entries.push({ term, meaning });
    seen.add(key);
    if (entries.length === 8) break;
  }
  return entries;
}

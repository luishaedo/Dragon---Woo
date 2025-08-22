
export function uniqJoin(parts, sep = ", ") {
  const seen = new Set();
  const out = [];
  const pushOne = (x) => {
    if (!x) return;
    const s = String(x).trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(s); }
  };
  for (const p of parts) {
    if (!p) continue;
    if (Array.isArray(p)) { for (const x of p) pushOne(x); }
    else pushOne(p);
  }
  return out.join(sep);
}

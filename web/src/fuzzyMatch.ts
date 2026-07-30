// Subsequence-based fuzzy match: every character of the query must appear in
// a candidate, in order, but not necessarily contiguously (so "dnlv" matches
// "Dana Levi"). Contiguous runs score higher than scattered ones, so callers
// that sort by score get closer matches first.
function scoreAgainst(query: string, text: string): number | null {
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      qi++;
      consecutive++;
      score += consecutive;
    } else {
      consecutive = 0;
    }
  }
  return qi === query.length ? score : null;
}

/**
 * Returns the best match score across all candidates, or null if the query
 * doesn't match any of them. `null`/empty candidates are skipped. An
 * empty/whitespace-only query matches everything (score 0).
 */
export function fuzzyMatch(query: string, candidates: (string | null | undefined)[]): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  let best: number | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const score = scoreAgainst(q, candidate.toLowerCase());
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

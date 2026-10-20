export type SnapshotFinding = { field: string; missing: number; checked: number };
export type VisibilitySnapshot = {
  score: number | null;
  verdict: string;
  findings: string[];
  questions: Array<{ question: string; result: string }>;
  scoreNote: string;
};

// A quick sample has a smaller scope than a full audit. Never reuse the
// reference dealer's score or count an unassessed field as a zero.
export function buildVisibilitySnapshot(findings: SnapshotFinding[], location: string,
  questions?: VisibilitySnapshot["questions"]): VisibilitySnapshot {
  const assessed = findings.filter(f => f.checked > 0);
  const total = assessed.reduce((n, f) => n + f.checked, 0);
  const found = assessed.reduce((n, f) => n + Math.max(0, f.checked - f.missing), 0);
  const score = total ? Math.round(100 * found / total) : null;
  const gaps = [...assessed].sort((a, b) => b.missing / b.checked - a.missing / a.checked);
  const points = gaps.slice(0, 3).map(f => f.missing
    ? `${f.field} was not extracted on ${f.missing} of ${f.checked} sampled listing pages.`
    : `${f.field} was readable on all ${f.checked} sampled listing pages.`);
  if (!points.length) points.push("No inventory detail pages were identified. Listing readiness could not be assessed.");
  while (points.length < 3) points.push(points.length === 1
    ? "This bounded website check covers only the pages and fields assessed."
    : "A full report checks more inventory facts and ranks the fixes for your team.");
  const proof = (field: string) => {
    const f = findings.find(row => row.field === field);
    return !f?.checked ? "Not assessed - no sampled listing evidence."
      : f.missing === f.checked ? `No verifiable match - ${field} not extracted on ${f.checked} of ${f.checked} pages.`
      : `Review needed - ${f.checked - f.missing} of ${f.checked} pages expose ${field}; a matching unit was not verified.`;
  };
  return { score, verdict: score === null ? "Listing readiness not assessed" : score < 50
    ? "Key listing facts need attention" : score < 80 ? "Your data is partly readable" : "Your sampled listing facts are readable",
    findings: points, questions: questions ?? [
      { question: `Which RVs have published prices near ${location}?`, result: proof("numeric price") },
      { question: "Which units publish sleeping capacity?", result: proof("sleeping capacity") },
      { question: "Which units publish overall length?", result: proof("length") },
    ], scoreNote: "Sample readiness = readable field checks / assessed field checks. This is a website evidence score, not an AI ranking or the full audit score." };
}

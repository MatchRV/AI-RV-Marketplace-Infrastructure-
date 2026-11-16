import { useQuery } from "@tanstack/react-query";

/**
 * What MatchRV adds over the dealer's listing: price context against similar
 * listings, the tow check, specs with their source, and similar units.
 * Mirrors the server-rendered crawler summary (api-server lib/listing-seo.ts)
 * so the rendered page and the raw HTML carry the same content.
 */
export interface UnitInsights {
  unitId: string;
  url: string;
  seo: { title: string; description: string };
  indexable: boolean;
  noindexReasons: string[];
  typeLabel: string;
  location: string;
  specs: Array<{ label: string; value: string; source: string }>;
  tow: null | {
    basis: "gvwr" | "dry_weight";
    basisLbs: number;
    hitchLbs: number | null;
    comfortable: string[];
    dependsOnConfig: string[];
    tooHeavy: string[];
    pickupsOnly: boolean;
    summary: string;
  };
  priceContext: null | {
    compCount: number;
    medianUsd: number;
    lowUsd: number;
    highUsd: number;
    deltaUsd: number;
    deltaPct: number;
    position: "below" | "near" | "above";
    scope: string;
    summary: string;
  };
  offGrid: null | { score: number; knownInputs: string[]; missingInputs: string[] };
  similar: Array<{ url: string; title: string; priceUsd: number | null; location: string }>;
  hub: null | { url: string; label: string };
  dealerDescription: string | null;
}

const BASE = import.meta.env.BASE_URL || "/";
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Same-origin path for an absolute matchrv.com link, so links work on previews too. */
function localHref(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("matchrv.com") ? `${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}

export function useListingInsights(rawListingId: string) {
  return useQuery<UnitInsights | null>({
    queryKey: ["/api/listing-insights", rawListingId],
    enabled: rawListingId.length > 0,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`${BASE}api/listing-insights/${encodeURIComponent(rawListingId)}`);
      if (!res.ok) return null;
      return (await res.json()) as UnitInsights;
    },
  });
}

const card = "bg-white rounded-[2rem] border border-[#E2E8F0] p-8";
const h3 = "font-display font-black text-xl text-[#161d1d] mb-4 cursor-default select-none";

export function ListingInsights({ insights }: { insights: UnitInsights }) {
  const { priceContext: pc, tow, specs, similar, hub, offGrid } = insights;
  return (
    <>
      {pc && (
        <section id="price-context" className={card}>
          <h3 className={h3}>How this price compares</h3>
          <p className="text-[#3b4949] leading-relaxed">{pc.summary}</p>
          <div className="grid grid-cols-3 gap-3 mt-5 text-center">
            <div className="rounded-2xl bg-[#F7F9FB] p-3"><div className="text-xs text-[#3b4949]">Low</div><div className="font-bold">{usd(pc.lowUsd)}</div></div>
            <div className="rounded-2xl bg-[#F7F9FB] p-3"><div className="text-xs text-[#3b4949]">Median of {pc.compCount}</div><div className="font-bold">{usd(pc.medianUsd)}</div></div>
            <div className="rounded-2xl bg-[#F7F9FB] p-3"><div className="text-xs text-[#3b4949]">High</div><div className="font-bold">{usd(pc.highUsd)}</div></div>
          </div>
        </section>
      )}

      {tow && (
        <section id="tow-check" className={card}>
          <h3 className={h3}>What can tow it</h3>
          <p className="text-[#3b4949] leading-relaxed">{tow.summary}</p>
          {tow.comfortable.length > 0 && (
            <p className="mt-3 text-sm"><strong>Rated with margin in any configuration:</strong> {tow.comfortable.join(", ")}</p>
          )}
          {tow.dependsOnConfig.length > 0 && (
            <p className="mt-2 text-sm"><strong>Some configurations only:</strong> {tow.dependsOnConfig.join(", ")}</p>
          )}
          {tow.tooHeavy.length > 0 && (
            <p className="mt-2 text-sm"><strong>Not rated for it:</strong> {tow.tooHeavy.join(", ")}</p>
          )}
          <p className="mt-3 text-xs text-[#3b4949]">
            Planning guidance from MatchRV's tow reference table, not a safety determination. Check your vehicle's door-jamb sticker and owner's manual.{" "}
            <a className="underline" href={`${BASE}tow-guide`}>How tow ratings work</a>.
          </p>
        </section>
      )}

      {specs.length > 0 && (
        <section id="specs" className={card}>
          <h3 className={h3}>Specs</h3>
          <table className="w-full text-sm">
            <tbody>
              {specs.map((r) => (
                <tr key={r.label} className="border-b border-[#E2E8F0] last:border-0">
                  <th scope="row" className="text-left font-semibold py-2 pr-4">{r.label}</th>
                  <td className="py-2 pr-4">{r.value}</td>
                  <td className="py-2 text-xs text-[#3b4949]">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {offGrid && (
        <section id="off-grid" className={card}>
          <h3 className={h3}>Off-grid readiness</h3>
          <p className="text-[#3b4949] leading-relaxed">
            MatchRV off-grid score: <strong>{offGrid.score}</strong> out of 100, from {offGrid.knownInputs.join("; ")}.
            {offGrid.missingInputs.length > 0 && ` Not stated by the dealer: ${offGrid.missingInputs.join(", ")}.`}
          </p>
        </section>
      )}

      {similar.length > 0 && (
        <section id="similar" className={card}>
          <h3 className={h3}>Similar listings</h3>
          <ul className="space-y-2">
            {similar.map((s) => (
              <li key={s.url}>
                <a className="font-semibold text-[#0B1117] underline" href={localHref(s.url)}>{s.title}</a>
                <span className="text-sm text-[#3b4949]">
                  {s.priceUsd != null ? ` · ${usd(s.priceUsd)}` : ""}{s.location ? ` · ${s.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {hub && (
            <p className="mt-4"><a className="underline" href={localHref(hub.url)}>See all {hub.label.replace(/ for Sale in /, " in ")}</a></p>
          )}
        </section>
      )}
      {similar.length === 0 && hub && (
        <p><a className="underline" href={localHref(hub.url)}>See all {hub.label.replace(/ for Sale in /, " in ")}</a></p>
      )}
    </>
  );
}

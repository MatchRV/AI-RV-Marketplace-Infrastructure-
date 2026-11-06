import { cardTitle, formatPrice, RV_TYPE_LABELS, type SwipeCard } from "@/lib/swipe-deck";
import { likedOutsideDeck } from "@/lib/swipe-session";
import { NAVY, LINE } from "./tokens";

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Unknown";
  return String(value);
}

/** Side-by-side view of retained likes. Only published card facts. */
export function CompareLikes({ likes, activeIds, onOpen }: { likes: SwipeCard[]; activeIds: ReadonlySet<string> | null; onOpen: (c: SwipeCard) => void }) {
  if (!likes.length) {
    return <p className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${LINE}`, color: NAVY }}>No likes yet. Swipe right on a coach and it will show up here, even after you change filters.</p>;
  }
  const rows: { label: string; value: (c: SwipeCard) => string }[] = [
    { label: "Price", value: (c) => formatPrice(c.priceUsd) },
    { label: "Type", value: (c) => RV_TYPE_LABELS[c.rvType] ?? "Unknown" },
    { label: "Length", value: (c) => c.lengthFt != null ? `${Math.round(c.lengthFt)} ft` : "Unknown" },
    { label: "Sleeps", value: (c) => cell(c.sleeps) },
    { label: "Location", value: (c) => c.city && c.state ? `${c.city}, ${c.state}` : "Unknown" },
    { label: "Condition", value: (c) => c.condition === "new" ? "New" : c.condition === "used" ? "Used" : "Unknown" },
  ];
  return (
    <section aria-label="Compare your likes" className="overflow-x-auto rounded-3xl bg-white" style={{ border: `1px solid ${LINE}` }}>
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="p-3 text-left" style={{ color: NAVY }}> </th>
            {likes.map((c) => (
              <th key={c.id} className="p-3 text-left align-bottom min-w-40" style={{ color: NAVY }}>
                <button type="button" onClick={() => onOpen(c)} className="font-extrabold text-left underline">{cardTitle(c)}</button>
                {likedOutsideDeck(activeIds, c.id) && <p className="mt-1 font-normal text-slate-500">Outside current filters</p>}
                <p className="mt-1 font-normal text-slate-500">Dealer name is on the detail view, not guessed here.</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderTop: `1px solid ${LINE}` }}>
              <th className="p-3 text-left" style={{ color: NAVY }}>{row.label}</th>
              {likes.map((c) => <td key={c.id} className="p-3">{row.value(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

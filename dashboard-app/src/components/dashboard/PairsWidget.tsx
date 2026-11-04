import type { Trade } from "../../types";

export function PairsWidget({ trades }: { trades: Trade[] }) {
  const pairLabels = new Map<string, string>();
  for (const trade of trades) {
    const pair = trade.symbol.trim();
    if (pair && !pairLabels.has(pair.toLocaleLowerCase())) {
      pairLabels.set(pair.toLocaleLowerCase(), pair);
    }
  }
  const pairs = [...pairLabels.values()].sort((left, right) => left.localeCompare(right));

  return (
    <section className="panel col-span-full" aria-labelledby="profile-pairs-title">
      <h2 className="section-title" id="profile-pairs-title">Pairs traded</h2>
      <p className="section-subtitle">
        {pairs.length} {pairs.length === 1 ? "pair" : "pairs"} used in this profile
      </p>
      {pairs.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {pairs.map((pair) => (
            <li className="rounded-full border border-sky-400/20 bg-sky-400/5 px-3 py-1.5 text-xs font-medium text-sky-200" key={pair}>
              {pair}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Log a trade to see its pair here.</p>
      )}
    </section>
  );
}

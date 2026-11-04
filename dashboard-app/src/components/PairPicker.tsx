import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FEATURED_PAIRS, normalizeFeaturedPair } from "../data/featuredPairs";

export function PairPicker({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { groups, customPair, matchCount, visibleOptions } = useMemo(() => {
    const query = value.trim().toLocaleLowerCase();
    const normalizedQuery = query.replace(/[^a-z0-9]/g, "");
    const matches = query
      ? FEATURED_PAIRS.filter((item) => {
        const pair = item.pair.toLocaleLowerCase();
        const name = item.name.toLocaleLowerCase();
        const market = item.market.toLocaleLowerCase();
        const normalizedPair = pair.replace(/[^a-z0-9]/g, "");
        const normalizedName = name.replace(/[^a-z0-9]/g, "");
        return pair.includes(query)
          || name.includes(query)
          || market.includes(query)
          || Boolean(normalizedQuery && normalizedPair.includes(normalizedQuery))
          || Boolean(normalizedQuery && normalizedName.includes(normalizedQuery))
          || item.aliases?.some((alias) => alias.toLocaleLowerCase().includes(query)
            || alias.toLocaleLowerCase().replace(/[^a-z0-9]/g, "").includes(normalizedQuery));
      })
      : FEATURED_PAIRS;
    const grouped = new Map<string, typeof FEATURED_PAIRS>();
    for (const item of matches) {
      const current = grouped.get(item.market) ?? [];
      current.push(item);
      grouped.set(item.market, current);
    }
    const exactInstrument = Boolean(normalizeFeaturedPair(query))
      || FEATURED_PAIRS.some((item) => item.name.toLocaleLowerCase() === query);
    const custom = query && !exactInstrument ? value.trim() : "";
    const options = [
      ...[...grouped.values()].flat(),
      ...(custom ? [{ market: "Custom", pair: custom, name: "Use custom instrument" }] : []),
    ];
    return {
      groups: [...grouped.entries()],
      customPair: custom,
      matchCount: matches.length,
      visibleOptions: options,
    };
  }, [value]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function choose(pair: string) {
    onChange(pair);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      if (!visibleOptions.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + direction + visibleOptions.length) % visibleOptions.length);
      return;
    }
    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const active = activeIndex >= 0 ? visibleOptions[activeIndex] : undefined;
      const query = value.trim().toLocaleLowerCase();
      const exact = normalizeFeaturedPair(query)
        ?? FEATURED_PAIRS.find((item) => item.name.toLocaleLowerCase() === query)?.pair;
      choose(active?.pair ?? exact ?? value.trim());
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="flex h-11 min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-violet-400">
        <input
          ref={inputRef}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          name="symbol"
          maxLength={40}
          placeholder="Search pair or enter custom"
          autoComplete="off"
          inputMode="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="journal-pair-options"
          aria-required={required}
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(-1);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          required={required}
        />
        <button
          className="min-h-11 min-w-11 border-l border-slate-800 text-slate-400 hover:bg-slate-800"
          type="button"
          aria-label="Show pair options"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isOpen) setIsOpen(false);
            else {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          ▾
        </button>
      </div>
      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default bg-slate-950/50 sm:hidden"
            aria-label="Close pair options"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="journal-pair-options"
            className="pair-picker-menu absolute left-0 right-0 top-[calc(100%+0.4rem)] z-40 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl"
          >
            <div className="pair-picker-menu-count" role="status">
              {value.trim()
                ? `${matchCount.toLocaleString()} matching pairs`
                : `${FEATURED_PAIRS.length} curated pairs · type any other pair as custom`}
            </div>
            <div
              className="pair-picker-menu-options"
              role="listbox"
              aria-label="Pairs grouped by market"
            >
            {groups.map(([market, pairs]) => {
              const optionOffset = groups.slice(0, groups.findIndex(([name]) => name === market))
                  .reduce((total, [, items]) => total + items.length, 0);
              return (
                <section key={market} aria-label={market}>
                  <h3 className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {market}
                  </h3>
                  {pairs.map((pair, index) => {
                    const active = activeIndex === optionOffset + index;
                    return (
                      <button
                        key={`${pair.market}:${pair.pair}`}
                        type="button"
                        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-slate-800 ${active ? "bg-slate-800" : ""}`}
                        role="option"
                        aria-selected={active}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(pair.pair)}
                      >
                        <span className="truncate text-sm font-medium text-slate-100">{pair.pair}</span>
                        <span className="shrink-0 truncate text-xs text-slate-500">
                          {pair.name}{pair.aliases?.length ? ` · ${pair.aliases.join(", ")}` : ""}
                          {pair.recommended ? " · Watchlist" : ""}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {customPair && (
              <section aria-label="Custom">
                <h3 className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Custom
                </h3>
                <button
                  type="button"
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left hover:bg-slate-800 ${activeIndex === visibleOptions.length - 1 ? "bg-slate-800" : ""}`}
                  role="option"
                  aria-label={`Create custom pair ${customPair}`}
                  aria-selected={activeIndex === visibleOptions.length - 1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(customPair)}
                >
                  <span className="truncate text-sm font-medium text-emerald-200">{customPair}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">Create custom pair</span>
                </button>
              </section>
            )}
            {!groups.length && !customPair && (
              <p className="px-3 py-4 text-sm text-slate-500">No matching pairs. Enter a custom instrument.</p>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

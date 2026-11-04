import { CUSTOM_PAIR_VALUE, FEATURED_PAIRS } from "../data/featuredPairs";

export function ProfilePairField({
  value,
  customValue,
  onPairChange,
  onCustomChange,
  onBlur,
  error,
  invalid,
}: {
  value: string;
  customValue: string;
  onPairChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  invalid: boolean;
}) {
  const isCustom = value === CUSTOM_PAIR_VALUE;

  return (
    <div className="field-label">
      <label className="flex flex-col gap-2" htmlFor="profile-pair-choice">
        <span>Pair <em>Required</em></span>
        <select
          id="profile-pair-choice"
          value={value}
          aria-invalid={invalid}
          aria-describedby={error ? "profile-pair-error" : undefined}
          onChange={(event) => onPairChange(event.target.value)}
          onBlur={onBlur}
        >
          <option value="">Select a pair…</option>
          {[...new Set(FEATURED_PAIRS.map((item) => item.market))].map((market) => (
            <optgroup label={market} key={market}>
              {FEATURED_PAIRS.filter((item) => item.market === market).map((item) => (
                <option value={item.pair} key={item.pair}>
                  {item.pair} — {item.name}{item.aliases?.length ? ` (${item.aliases.join(", ")})` : ""}
                  {item.recommended ? " · Watchlist" : ""}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_PAIR_VALUE}>Custom pair…</option>
        </select>
      </label>
      {isCustom && (
        <input
          className="mt-2"
          type="text"
          maxLength={40}
          placeholder="Enter a custom pair"
          value={customValue}
          aria-label="Custom pair"
          aria-invalid={invalid}
          aria-describedby={error ? "profile-pair-error" : undefined}
          onChange={(event) => onCustomChange(event.target.value)}
          onBlur={onBlur}
          required
        />
      )}
      {error && <small className="field-error" id="profile-pair-error" role="alert">{error}</small>}
    </div>
  );
}

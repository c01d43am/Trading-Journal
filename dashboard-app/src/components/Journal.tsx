import { useEffect, useRef, useState, type FormEvent } from "react";
import { TradeCalendar } from "./TradeCalendar";
import { TradeDatePicker } from "./TradeDatePicker";
import { PairPicker } from "./PairPicker";
import type { Trade } from "../types";

export function Journal({
  trades,
  addTrade,
  dateRange,
  fixedSymbol,
}: {
  trades: Trade[];
  dateRange?: { dateFrom: string; dateTo: string };
  fixedSymbol?: string;
  addTrade: (trade: Omit<Trade, "profileId">) => void;
}) {
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState("");
  const [pnlInput, setPnlInput] = useState("");
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultDate = dateRange
    ? today < dateRange.dateFrom ? dateRange.dateFrom : today > dateRange.dateTo ? dateRange.dateTo : today
    : today;
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const formRef = useRef<HTMLFormElement>(null);
  const pnlEdited = useRef(false);
  const pnlAutoCalculated = useRef(false);
  const canSubmit = Boolean(
    (fixedSymbol || symbol.trim())
    && (side === "Long" || side === "Short")
    && selectedDate
    && time
    && pnlInput.trim()
    && Number.isFinite(Number(pnlInput)),
  );

  useEffect(() => {
    if (fixedSymbol) setSymbol(fixedSymbol);
  }, [fixedSymbol]);

  function recalculatePnl(direction = side) {
    const form = formRef.current;
    if (!form) return;
    const values = new FormData(form);
    const readNumber = (name: string) => {
      const raw = String(values.get(name) ?? "").trim();
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const entry = readNumber("entryPrice");
    const exit = readNumber("exitPrice");
    const size = readNumber("size");
    if (entry !== undefined && exit !== undefined && size !== undefined && size > 0) {
      const amount = (direction === "Short" ? entry - exit : exit - entry) * size;
      setPnlInput(amount.toFixed(2));
      pnlAutoCalculated.current = true;
      return;
    }
    if (pnlAutoCalculated.current) {
      setPnlInput("");
      pnlAutoCalculated.current = false;
    }
  }

  function handleCalculationInput(direction = side) {
    const form = formRef.current;
    if (!form) return;
    const values = new FormData(form);
    const allPricesPresent = ["entryPrice", "exitPrice", "size"].every((name) =>
      String(values.get(name) ?? "").trim() !== "",
    );
    if (allPricesPresent && !pnlEdited.current) {
      recalculatePnl(direction);
    } else if (pnlAutoCalculated.current) {
      setPnlInput("");
      pnlAutoCalculated.current = false;
      pnlEdited.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const readOptionalNumber = (name: string) => {
      const raw = String(values.get(name) ?? "").trim();
      if (!raw) return undefined;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`Enter a valid ${name} value.`);
      return parsed;
    };
    let pnl: number;
    let entryPrice: number | undefined;
    let exitPrice: number | undefined;
    let stopLoss: number | undefined;
    let takeProfit: number | undefined;
    let size: number | undefined;
    let rMultiple: number | undefined;
    let imageData: string | undefined;
    try {
      pnl = Number(pnlInput);
      entryPrice = readOptionalNumber("entryPrice");
      exitPrice = readOptionalNumber("exitPrice");
      stopLoss = readOptionalNumber("stopLoss");
      takeProfit = readOptionalNumber("takeProfit");
      size = readOptionalNumber("size");
      rMultiple = readOptionalNumber("rMultiple");
      const screenshot = values.get("screenshot");
      if (screenshot instanceof File && screenshot.size > 0) {
        if (screenshot.size > 1024 * 1024) throw new Error("Screenshot must be 1 MB or smaller.");
        if (!["image/png", "image/jpeg"].includes(screenshot.type)) {
          throw new Error("Screenshot must be a PNG or JPEG image.");
        }
        imageData = await fileAsDataUrl(screenshot);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    if (!pnlInput.trim() || !Number.isFinite(pnl)) {
      setError("Enter a valid realized P&L.");
      return;
    }

    const date = selectedDate;
    if (dateRange && (date < dateRange.dateFrom || date > dateRange.dateTo)) {
      setError(`Trade date must be between ${dateRange.dateFrom} and ${dateRange.dateTo}.`);
      return;
    }

    if (rMultiple === undefined && entryPrice !== undefined && stopLoss !== undefined && size !== undefined) {
      const risk = Math.abs(entryPrice - stopLoss) * size;
      if (risk > 0) rMultiple = pnl / risk;
    }

    try {
      addTrade({
        id: crypto.randomUUID(),
        symbol: (fixedSymbol ?? symbol).trim().toUpperCase(),
        side: side === "Short" ? "Short" : "Long",
        pnl,
        result: pnl >= 0 ? "Win" : "Loss",
        date,
        time,
        size,
        entryPrice,
        exitPrice,
        stopLoss,
        takeProfit,
        rMultiple,
        notes: String(values.get("notes") ?? "").trim() || undefined,
        imageData,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    form.reset();
    setSymbol("");
    setSide("");
    setPnlInput("");
    setSelectedDate(defaultDate);
    setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    pnlEdited.current = false;
    pnlAutoCalculated.current = false;
    setError("");
  }

  return (
    <section className="panel mt-5 min-w-0" aria-labelledby="journal-title">
      <div className="mb-5">
        <h2 className="section-title" id="journal-title">Journal</h2>
        <p className="section-subtitle">Record closed trades. Balance and equity update immediately.</p>
      </div>
      <form ref={formRef} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
        <label className="field-label">
          <span>Pair / symbol</span>
          {fixedSymbol
            ? <input className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={fixedSymbol} readOnly aria-readonly="true" />
            : <PairPicker value={symbol} onChange={setSymbol} required />}
        </label>
        <label className="field-label">
          <span>Side</span>
          <select name="side" value={side} onChange={(event) => { setSide(event.target.value); handleCalculationInput(event.target.value); }} required>
            <option value="">Select direction</option>
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
        <label className="field-label">
          <span>Realized P&amp;L</span>
          <input name="pnl" type="number" step="any" inputMode="decimal" value={pnlInput} onChange={(event) => { setPnlInput(event.target.value); pnlEdited.current = true; pnlAutoCalculated.current = false; }} onBlur={() => { if (!pnlInput.trim()) { pnlEdited.current = false; recalculatePnl(); } }} required />
        </label>
        <label className="field-label">
          <span>Entry price <em>Optional</em></span>
          <input name="entryPrice" type="number" step="any" inputMode="decimal" onChange={() => handleCalculationInput()} />
        </label>
        <label className="field-label">
          <span>Exit price <em>Optional</em></span>
          <input name="exitPrice" type="number" step="any" inputMode="decimal" onChange={() => handleCalculationInput()} />
        </label>
        <label className="field-label">
          <span>Position size <em>Optional</em></span>
          <input name="size" type="number" min="0" step="any" inputMode="decimal" onChange={() => handleCalculationInput()} />
        </label>
        <label className="field-label">
          <span>Stop loss <em>Optional</em></span>
          <input name="stopLoss" type="number" min="0" step="any" inputMode="decimal" />
        </label>
        <label className="field-label">
          <span>Take profit <em>Optional</em></span>
          <input name="takeProfit" type="number" min="0" step="any" inputMode="decimal" />
        </label>
        <label className="field-label">
          <span>R-Multiple <em>Optional</em></span>
          <input name="rMultiple" type="number" step="any" inputMode="decimal" />
        </label>
        <label className="field-label">
          <span>Date</span>
          <TradeDatePicker value={selectedDate} onChange={setSelectedDate} dateRange={dateRange} />
        </label>
        <label className="field-label">
          <span>Time</span>
          <input name="time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
        </label>
        <label className="field-label sm:col-span-2">
          <span>Notes <em>Optional</em></span>
          <textarea name="notes" rows={2} className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <label className="field-label sm:col-span-2">
          <span>Screenshot <em>Optional · PNG or JPEG, max 1 MB</em></span>
          <input name="screenshot" type="file" accept="image/png,image/jpeg" onChange={() => setError("")} />
        </label>
        {error && <p className="text-sm text-rose-300 sm:col-span-2 lg:col-span-4" role="alert">{error}</p>}
        <button className="button-primary min-h-11 w-full sm:col-span-2 lg:col-span-4" type="submit" disabled={!canSubmit}>Save Trade</button>
      </form>

      <TradeCalendar trades={trades} dateRange={dateRange} />
    </section>
  );
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the selected screenshot."));
    };
    reader.onerror = () => reject(new Error("Could not read the selected screenshot."));
    reader.readAsDataURL(file);
  });
}

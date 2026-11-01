import { useMemo, useState, type FocusEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProfileStore } from "../store/profiles";
import type { Mode, Profile, PropFirmPhase } from "../types";

type FieldName =
  | "name"
  | "pin"
  | "pair"
  | "dateFrom"
  | "dateTo"
  | "capital"
  | "firmName"
  | "dailyDrawdownPct"
  | "maxDrawdownPct"
  | "targetPct"
  | "phase"
  | "brokerName";

type FormValues = Partial<Record<FieldName, string>>;
type FieldErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Partial<Record<FieldName, boolean>>;

const initialValues: FormValues = {};
const phases = ["Phase 1", "Phase 2", "Master Account"] as const;

function getFieldError(field: FieldName, value: string | undefined, values: FormValues, mode: Mode) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "This field is required.";

  if (field === "pin" && !/^[a-zA-Z0-9]{4,32}$/.test(trimmed)) {
    return "Use 4–32 letters or numbers.";
  }

  if (field === "capital" || field === "dailyDrawdownPct" || field === "maxDrawdownPct" || field === "targetPct") {
    const number = Number(trimmed);
    if (!Number.isFinite(number) || number < 0 || (field === "capital" && number === 0)) {
      return field === "capital" ? "Enter a number greater than 0." : "Enter a valid non-negative number.";
    }
  }

  if (field === "dateFrom" || field === "dateTo") {
    const date = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "Enter a valid date.";
  }

  if (mode === "backtesting" && field === "dateTo" && values.dateFrom && trimmed < values.dateFrom) {
    return "Date To must be on or after Date From.";
  }

  return "";
}

function fieldsForMode(mode: Mode): FieldName[] {
  if (mode === "backtesting") return ["name", "pair", "dateFrom", "dateTo", "capital", "pin"];
  if (mode === "propfirm") {
    return ["name", "firmName", "capital", "dailyDrawdownPct", "maxDrawdownPct", "targetPct", "phase", "pin"];
  }
  return ["name", "brokerName", "capital", "pin"];
}

export function ProfileForm() {
  const navigate = useNavigate();
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const [mode, setMode] = useState<Mode>("backtesting");
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => {
    const result: FieldErrors = {};
    for (const field of fieldsForMode(mode)) {
      result[field] = getFieldError(field, values[field], values, mode);
    }
    return result;
  }, [mode, values]);
  const isValid = Object.values(errors).every((error) => !error);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setValues({});
    setTouched({});
    setSubmitted(false);
  }

  function updateField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleBlur(field: FieldName, event: FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    const value = event.currentTarget.value;
    setTouched((current) => ({ ...current, [field]: true }));
    setValues((current) => ({ ...current, [field]: value }));
  }

  function renderError(field: FieldName) {
    const error = errors[field];
    if (!error || (!touched[field] && !submitted)) return null;
    return <small className="field-error" role="alert">{error}</small>;
  }

  function textField(
    field: FieldName,
    label: string,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    return (
      <label className="field-label" key={field}>
        <span>{label}<em>Required</em></span>
        <input
          {...props}
          value={values[field] ?? ""}
          aria-invalid={Boolean(errors[field] && (touched[field] || submitted))}
          onChange={(event) => updateField(field, event.target.value)}
          onBlur={(event) => handleBlur(field, event)}
        />
        {renderError(field)}
      </label>
    );
  }

  function selectField(field: FieldName, label: string, options: readonly string[]) {
    return (
      <label className="field-label" key={field}>
        <span>{label}<em>Required</em></span>
        <select
          value={values[field] ?? ""}
          aria-invalid={Boolean(errors[field] && (touched[field] || submitted))}
          onChange={(event) => updateField(field, event.target.value)}
          onBlur={(event) => handleBlur(field, event)}
        >
          <option value="">Select…</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {renderError(field)}
      </label>
    );
  }

  function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;

    const base = {
      id: crypto.randomUUID(),
      name: values.name!.trim(),
      pin: values.pin!.trim(),
      mode,
      createdAt: new Date().toISOString(),
    };
    let profile: Profile;

    if (mode === "backtesting") {
      profile = {
        ...base,
        mode,
        backtesting: {
          pair: values.pair!.trim(),
          dateFrom: values.dateFrom!,
          dateTo: values.dateTo!,
          capital: Number(values.capital),
        },
      };
    } else if (mode === "propfirm") {
      profile = {
        ...base,
        mode,
        propfirm: {
          firmName: values.firmName!.trim(),
          capital: Number(values.capital),
          dailyDrawdownPct: Number(values.dailyDrawdownPct),
          maxDrawdownPct: Number(values.maxDrawdownPct),
          targetPct: Number(values.targetPct),
          phase: values.phase as PropFirmPhase,
        },
      };
    } else {
      profile = {
        ...base,
        mode,
        broker: {
          brokerName: values.brokerName!.trim(),
          capital: Number(values.capital),
        },
      };
    }

    saveProfile(profile);
    useProfileStore.getState().unlockProfile(profile.id);
    navigate(`/profile/${profile.id}`);
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
      <Link to="/" className="mb-9 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">← All profiles</Link>
      <header className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">New workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Create a profile</h1>
        <p className="mt-3 text-sm text-slate-400">Choose a mode and enter its profile details. Your data stays in this browser.</p>
      </header>

      <form className="panel space-y-6" onSubmit={createProfile} noValidate>
        <label className="field-label">
          <span>Mode</span>
          <select value={mode} onChange={(event) => changeMode(event.target.value as Mode)}>
            <option value="backtesting">Backtesting</option>
            <option value="propfirm">Prop Firm</option>
            <option value="broker">Broker</option>
          </select>
        </label>

        <div className="space-y-5">
          {mode === "backtesting" && (
            <>
              {textField("name", "Profile Name", { autoFocus: true, placeholder: "e.g. EURUSD test" })}
              {textField("pair", "Pair", { placeholder: "EURUSD, NQ, BTCUSD" })}
              {textField("dateFrom", "Date From", { type: "date" })}
              {textField("dateTo", "Date To", { type: "date" })}
              {textField("capital", "Capital", { type: "number", min: 0, step: "any", placeholder: "10000" })}
            </>
          )}

          {mode === "propfirm" && (
            <>
              {textField("name", "Profile Name", { autoFocus: true, placeholder: "e.g. Evaluation account" })}
              {textField("firmName", "Prop Firm Name", { placeholder: "Firm name" })}
              {textField("capital", "Capital", { type: "number", min: 0, step: "any", placeholder: "100000" })}
              {textField("dailyDrawdownPct", "DD (Max Daily Drawdown) (%)", { type: "number", min: 0, step: "any", placeholder: "5" })}
              {textField("maxDrawdownPct", "Max DD (Max Total Drawdown) (%)", { type: "number", min: 0, step: "any", placeholder: "10" })}
              {textField("targetPct", "Target (%)", { type: "number", min: 0, step: "any", placeholder: "8" })}
              {selectField("phase", "Phase", phases)}
            </>
          )}

          {mode === "broker" && (
            <>
              {textField("name", "Profile Name", { autoFocus: true, placeholder: "e.g. Main account" })}
              {textField("brokerName", "Broker Name", { placeholder: "Broker name" })}
              {textField("capital", "Capital", { type: "number", min: 0, step: "any", placeholder: "10000" })}
            </>
          )}
        </div>

        <label className="field-label border-t border-slate-800 pt-5">
          <span>Profile PIN<em>Required · 4–32 letters or numbers</em></span>
          <input
            type="password"
            autoComplete="new-password"
            inputMode="numeric"
            minLength={4}
            maxLength={32}
            pattern="[A-Za-z0-9]{4,32}"
            value={values.pin ?? ""}
            aria-invalid={Boolean(errors.pin && (touched.pin || submitted))}
            onChange={(event) => updateField("pin", event.target.value)}
            onBlur={(event) => handleBlur("pin", event)}
          />
          {renderError("pin")}
        </label>

        <div className="flex items-center justify-between border-t border-slate-800 pt-5">
          <Link className="button-quiet" to="/">Cancel</Link>
          <button className="button-primary" type="submit" disabled={!isValid}>Create Profile</button>
        </div>
      </form>
    </main>
  );
}

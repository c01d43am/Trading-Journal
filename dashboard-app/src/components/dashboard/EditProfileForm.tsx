import { useMemo, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { ProfilePairField } from "../ProfilePairField";
import { CUSTOM_PAIR_VALUE, isFeaturedPair, normalizeFeaturedPair } from "../../data/featuredPairs";
import type { Mode, Profile, PropFirmPhase } from "../../types";

type FieldName =
  | "name"
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

type FieldValues = Partial<Record<FieldName | "customPair", string>>;
type FieldErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Partial<Record<FieldName, boolean>>;

const fieldsForMode: Record<Mode, FieldName[]> = {
  backtesting: ["name", "pair", "dateFrom", "dateTo", "capital"],
  propfirm: ["name", "firmName", "capital", "dailyDrawdownPct", "maxDrawdownPct", "targetPct", "phase"],
  broker: ["name", "brokerName", "capital"],
};

const fieldLabels: Record<FieldName, string> = {
  name: "Profile Name",
  pair: "Pair",
  dateFrom: "Date From",
  dateTo: "Date To",
  capital: "Capital",
  firmName: "Prop Firm Name",
  dailyDrawdownPct: "DD (Max Daily Drawdown) (%)",
  maxDrawdownPct: "Max DD (Max Total Drawdown) (%)",
  targetPct: "Target (%)",
  phase: "Phase",
  brokerName: "Broker Name",
};

function initialValues(profile: Profile): FieldValues {
  const savedPair = profile.backtesting?.pair ?? "";
  const presetPair = normalizeFeaturedPair(savedPair);
  return {
    name: profile.name,
    pair: !savedPair ? "" : isFeaturedPair(savedPair) ? presetPair : CUSTOM_PAIR_VALUE,
    customPair: savedPair && !isFeaturedPair(savedPair) ? savedPair : "",
    dateFrom: profile.backtesting?.dateFrom,
    dateTo: profile.backtesting?.dateTo,
    capital: profile.backtesting?.capital.toString()
      ?? profile.propfirm?.capital.toString()
      ?? profile.broker?.capital.toString(),
    firmName: profile.propfirm?.firmName,
    dailyDrawdownPct: profile.propfirm?.dailyDrawdownPct.toString(),
    maxDrawdownPct: profile.propfirm?.maxDrawdownPct.toString(),
    targetPct: profile.propfirm?.targetPct.toString(),
    phase: profile.propfirm?.phase,
    brokerName: profile.broker?.brokerName,
  };
}

export function EditProfileForm({
  profile,
  onCancel,
  onSave,
  onDelete,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (updated: Profile) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<Mode>(profile.mode);
  const [values, setValues] = useState<FieldValues>(() => initialValues(profile));
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => {
    const result: FieldErrors = {};
    for (const field of fieldsForMode[mode]) {
      const rawValue = field === "pair" && values.pair === CUSTOM_PAIR_VALUE
        ? values.customPair
        : values[field];
      const value = rawValue?.trim() ?? "";
      if (!value) {
        result[field] = "This field is required.";
      } else if (["capital", "dailyDrawdownPct", "maxDrawdownPct", "targetPct"].includes(field)) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || (field === "capital" && number === 0)) {
          result[field] = field === "capital"
            ? "Enter a number greater than 0."
            : "Enter a valid non-negative number.";
        }
      } else if (field === "dateFrom" || field === "dateTo") {
        if (Number.isNaN(new Date(`${value}T00:00:00`).getTime())) result[field] = "Enter a valid date.";
      }
    }
    if (mode === "backtesting" && values.dateFrom && values.dateTo && values.dateTo < values.dateFrom) {
      result.dateTo = "Date To must be on or after Date From.";
    }
    return result;
  }, [mode, values]);
  const isValid = Object.values(errors).every((error) => !error);

  function updateField(field: FieldName | "customPair", value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function setFieldMode(nextMode: Mode) {
    setMode(nextMode);
    setValues((current) => ({ name: current.name }));
    setTouched({});
    setSubmitted(false);
  }

  function errorFor(field: FieldName) {
    const error = errors[field];
    if (!error || (!touched[field] && !submitted)) return null;
    return <small className="field-error" role="alert">{error}</small>;
  }

  function input(field: FieldName, props: InputHTMLAttributes<HTMLInputElement> = {}) {
    return (
      <label className="field-label" key={field}>
        <span>{fieldLabels[field]}<em>Required</em></span>
        <input
          {...props}
          value={values[field] ?? ""}
          aria-invalid={Boolean(errors[field] && (touched[field] || submitted))}
          onChange={(event) => updateField(field, event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, [field]: true }))}
        />
        {errorFor(field)}
      </label>
    );
  }

  function phaseSelect() {
    return (
      <label className="field-label" key="phase">
        <span>{fieldLabels.phase}<em>Required</em></span>
        <select
          value={values.phase ?? ""}
          aria-invalid={Boolean(errors.phase && (touched.phase || submitted))}
          onChange={(event) => updateField("phase", event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, phase: true }))}
        >
          <option value="">Select…</option>
          <option>Phase 1</option>
          <option>Phase 2</option>
          <option>Master Account</option>
        </select>
        {errorFor("phase")}
      </label>
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;

    const base = {
      id: profile.id,
      name: values.name!.trim(),
      accessMethod: profile.accessMethod,
      accessSalt: profile.accessSalt,
      accessHash: profile.accessHash,
      mode,
      createdAt: profile.createdAt,
    };
    if (mode === "backtesting") {
      onSave({
        ...base,
        mode,
        backtesting: {
          pair: (values.pair === CUSTOM_PAIR_VALUE ? values.customPair : values.pair)!.trim(),
          dateFrom: values.dateFrom!,
          dateTo: values.dateTo!,
          capital: Number(values.capital),
        },
      });
    } else if (mode === "propfirm") {
      onSave({
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
      });
    } else {
      onSave({
        ...base,
        mode,
        broker: { brokerName: values.brokerName!.trim(), capital: Number(values.capital) },
      });
    }
  }

  return (
    <form className="panel space-y-6" onSubmit={save} noValidate>
      <h2 className="section-title">Edit profile</h2>
      <label className="field-label">
        <span>Mode</span>
        <select value={mode} onChange={(event) => setFieldMode(event.target.value as Mode)}>
          <option value="backtesting">Backtesting</option>
          <option value="propfirm">Prop Firm</option>
          <option value="broker">Broker</option>
        </select>
      </label>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {mode === "backtesting" && (
          <>
            {input("name", { autoFocus: true })}
            <ProfilePairField
              value={values.pair ?? ""}
              customValue={values.customPair ?? ""}
              onPairChange={(value) => setValues((current) => ({
                ...current,
                pair: value,
                ...(value === CUSTOM_PAIR_VALUE ? { customPair: "" } : {}),
              }))}
              onCustomChange={(value) => updateField("customPair", value)}
              onBlur={() => setTouched((current) => ({ ...current, pair: true }))}
              error={touched.pair || submitted ? errors.pair : undefined}
              invalid={Boolean(errors.pair && (touched.pair || submitted))}
            />
            {input("dateFrom", { type: "date" })}
            {input("dateTo", { type: "date" })}
            {input("capital", { type: "number", min: 0, step: "any" })}
          </>
        )}
        {mode === "propfirm" && (
          <>
            {input("name", { autoFocus: true })}
            {input("firmName")}
            {input("capital", { type: "number", min: 0, step: "any" })}
            {input("dailyDrawdownPct", { type: "number", min: 0, step: "any" })}
            {input("maxDrawdownPct", { type: "number", min: 0, step: "any" })}
            {input("targetPct", { type: "number", min: 0, step: "any" })}
            {phaseSelect()}
          </>
        )}
        {mode === "broker" && (
          <>
            {input("name", { autoFocus: true })}
            {input("brokerName")}
            {input("capital", { type: "number", min: 0, step: "any" })}
          </>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-end">
        <button className="button-quiet min-h-11 w-full sm:w-auto" type="button" onClick={onCancel}>Cancel</button>
        <button
          className="min-h-11 w-full rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/20 sm:w-auto"
          type="button"
          onClick={onDelete}
        >
          Delete Profile
        </button>
        <button className="button-primary min-h-11 w-full sm:w-auto" type="submit" disabled={!isValid}>Save Updates</button>
      </div>
    </form>
  );
}

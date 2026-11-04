import { useMemo, useState, type FocusEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProfilePairField } from "../components/ProfilePairField";
import { CUSTOM_PAIR_VALUE } from "../data/featuredPairs";
import { accessCodeError, hashAccessCode } from "../security/profileAccess";
import { useProfileStore } from "../store/profiles";
import type { AccessMethod, Mode, Profile, PropFirmPhase } from "../types";

type FieldName =
  | "name"
  | "accessMethod"
  | "accessCode"
  | "accessConfirm"
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

type FormValues = Partial<Record<FieldName | "customPair", string>>;
type FieldErrors = Partial<Record<FieldName, string>>;
type TouchedFields = Partial<Record<FieldName, boolean>>;

const initialValues: FormValues = { accessMethod: "password" };
const phases = ["Phase 1", "Phase 2", "Master Account"] as const;

function getFieldError(field: FieldName, value: string | undefined, values: FormValues, mode: Mode) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "This field is required.";

  if (field === "accessCode") {
    return accessCodeError(values.accessMethod as AccessMethod, value ?? "");
  }
  if (field === "accessConfirm" && value !== values.accessCode) {
    return "The access codes do not match.";
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
  if (mode === "backtesting") return ["name", "pair", "dateFrom", "dateTo", "capital", "accessMethod", "accessCode", "accessConfirm"];
  if (mode === "propfirm") {
    return ["name", "firmName", "capital", "dailyDrawdownPct", "maxDrawdownPct", "targetPct", "phase", "accessMethod", "accessCode", "accessConfirm"];
  }
  return ["name", "brokerName", "capital", "accessMethod", "accessCode", "accessConfirm"];
}

export function ProfileForm() {
  const navigate = useNavigate();
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const [mode, setMode] = useState<Mode>("backtesting");
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState("");

  const errors = useMemo(() => {
    const result: FieldErrors = {};
    for (const field of fieldsForMode(mode)) {
      const value = field === "pair" && values.pair === CUSTOM_PAIR_VALUE
        ? values.customPair
        : values[field];
      result[field] = getFieldError(field, value, values, mode);
    }
    return result;
  }, [mode, values]);
  const isValid = Object.values(errors).every((error) => !error);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setValues({ accessMethod: "password" });
    setTouched({});
    setSubmitted(false);
  }

  function updateField(field: FieldName | "customPair", value: string) {
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

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;

    let credential: Awaited<ReturnType<typeof hashAccessCode>>;
    try {
      credential = await hashAccessCode(values.accessCode!);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not protect this profile.");
      return;
    }
    const base = {
      id: crypto.randomUUID(),
      name: values.name!.trim(),
      accessMethod: values.accessMethod as AccessMethod,
      ...credential,
      mode,
      createdAt: new Date().toISOString(),
    };
    let profile: Profile;

    if (mode === "backtesting") {
      profile = {
        ...base,
        mode,
        backtesting: {
          pair: (values.pair === CUSTOM_PAIR_VALUE ? values.customPair : values.pair)!.trim(),
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
          <span>Profile access type<em>Required</em></span>
          <select
            value={values.accessMethod ?? "password"}
            onChange={(event) => {
              updateField("accessMethod", event.target.value);
              updateField("accessCode", "");
              updateField("accessConfirm", "");
            }}
          >
            <option value="password">Password · 8–128 characters</option>
            <option value="pin">PIN · 6–12 digits</option>
            <option value="passcode">Passcode · 6–64 characters</option>
          </select>
        </label>
        {textField("accessCode", "Create access code", { type: "password", autoComplete: "new-password" })}
        {textField("accessConfirm", "Confirm access code", { type: "password", autoComplete: "new-password" })}
        <p className="text-xs leading-5 text-slate-500">The access code is stored as a salted PBKDF2 hash and cannot be recovered. If forgotten, delete the profile and its data.</p>
        {saveError && <p className="field-error" role="alert">{saveError}</p>}

        <div className="flex items-center justify-between border-t border-slate-800 pt-5">
          <Link className="button-quiet" to="/">Cancel</Link>
          <button className="button-primary" type="submit" disabled={!isValid}>Create Profile</button>
        </div>
      </form>
    </main>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ModeBadge } from "../components/ModeBadge";
import { accessCodeError, hashAccessCode, verifyAccessCode } from "../security/profileAccess";
import { useProfileStore } from "../store/profiles";
import type { AccessMethod } from "../types";

export function LockScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const profile = useProfileStore((state) => state.profiles[id]);
  const lockProfile = useProfileStore((state) => state.lockProfile);
  const unlockProfile = useProfileStore((state) => state.unlockProfile);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const deleteProfile = useProfileStore((state) => state.deleteProfile);
  const [method, setMethod] = useState<AccessMethod>(profile?.accessMethod ?? "password");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lockProfile();
    setMethod(profile?.accessMethod ?? "password");
    setCode("");
    setConfirmation("");
    setError("");
  }, [id, lockProfile]);

  if (!profile) return <Navigate to="/" replace />;

  const needsAccessSetup = !profile.accessHash || !profile.accessSalt;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (needsAccessSetup) {
        const codeError = accessCodeError(method, code);
        if (codeError) {
          setError(codeError);
          return;
        }
        if (code !== confirmation) {
          setError("The access codes do not match.");
          return;
        }
        const credential = await hashAccessCode(code);
        const profileWithoutLegacyPin = { ...profile };
        delete profileWithoutLegacyPin.pin;
        saveProfile({
          ...profileWithoutLegacyPin,
          ...credential,
          accessMethod: method,
        });
      } else if (!await verifyAccessCode(code, profile.accessSalt!, profile.accessHash!)) {
        setError("Incorrect profile access code.");
        return;
      }
      unlockProfile(profile.id);
      navigate(`/profile/${profile.id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify the profile access code.");
    } finally {
      setBusy(false);
    }
  }

  function deleteForgottenProfile() {
    const typedName = window.prompt(`This permanently deletes "${profile.name}" and all its data. Type ${profile.name} to confirm.`);
    if (typedName !== profile.name) return;
    deleteProfile(profile.id);
    navigate("/", { replace: true });
  }

  return (
    <main className="fixed inset-0 z-40 flex min-h-screen max-w-none flex-col justify-end bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="panel flex min-h-screen w-full flex-col justify-center rounded-none border-x-0 border-y-0 px-5 py-10 sm:min-h-0 sm:max-w-lg sm:rounded-2xl sm:border-x sm:border-y sm:px-6 sm:py-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              {needsAccessSetup ? "Protect your profile" : "Profile locked"}
            </p>
            <h1 className="text-2xl font-semibold text-white">
              {needsAccessSetup ? `Set an access code for ${profile.name}` : `Unlock ${profile.name}`}
            </h1>
          </div>
          <ModeBadge mode={profile.mode} />
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-400">
          {needsAccessSetup
            ? "This older profile needs a new access code. Choose a password, PIN, or passcode to continue."
            : `Enter this profile's ${profile.accessMethod ?? "access code"} to open its dashboard.`}
        </p>
        <form className="space-y-5" onSubmit={submit} noValidate>
          {needsAccessSetup && (
            <label className="field-label">
              <span>Access type</span>
              <select value={method} onChange={(event) => setMethod(event.target.value as AccessMethod)}>
                <option value="password">Password · 8–128 characters</option>
                <option value="pin">PIN · 6–12 digits</option>
                <option value="passcode">Passcode · 6–64 characters</option>
              </select>
            </label>
          )}
          <label className="field-label">
            <span>{needsAccessSetup ? "Create access code" : "Profile access code"}</span>
            <input
              autoFocus
              className="!h-14 !text-lg"
              type="password"
              autoComplete={needsAccessSetup ? "new-password" : "current-password"}
              inputMode={needsAccessSetup && method === "pin" ? "numeric" : undefined}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "access-error" : undefined}
            />
            {error && <small id="access-error" className="field-error" role="alert">{error}</small>}
          </label>
          {needsAccessSetup && (
            <label className="field-label">
              <span>Confirm access code</span>
              <input
                className="!h-14 !text-lg"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>
          )}
          <button className="button-primary w-full text-sm" type="submit" disabled={busy}>
            {busy ? "Verifying…" : needsAccessSetup ? "Set code and unlock" : "Unlock profile"}
          </button>
        </form>
        <Link
          className="button-quiet mt-3 w-full"
          to="/"
          onClick={lockProfile}
        >
          Switch profile
        </Link>
        <button className="button-quiet mt-3 w-full text-rose-300" type="button" onClick={deleteForgottenProfile}>
          Forgot code? Delete profile and its data
        </button>
        <p className="mt-4 text-center text-xs text-slate-600">Access codes are stored as salted PBKDF2 hashes and cannot be recovered.</p>
      </section>
    </main>
  );
}

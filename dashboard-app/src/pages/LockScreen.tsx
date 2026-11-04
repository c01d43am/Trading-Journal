import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ModeBadge } from "../components/ModeBadge";
import { useProfileStore } from "../store/profiles";

export function LockScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const profile = useProfileStore((state) => state.profiles[id]);
  const lockProfile = useProfileStore((state) => state.lockProfile);
  const unlockProfile = useProfileStore((state) => state.unlockProfile);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const deleteProfile = useProfileStore((state) => state.deleteProfile);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    lockProfile();
  }, [id, lockProfile]);

  if (!profile) return <Navigate to="/" replace />;

  const needsPinSetup = !profile.pin;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (needsPinSetup) {
      if (!/^[a-zA-Z0-9]{4,32}$/.test(pin)) {
        setError("Use 4–32 letters or numbers.");
        return;
      }
      saveProfile({ ...profile, pin });
    } else if (pin !== profile.pin) {
      setError("Invalid PIN.");
      return;
    }

    unlockProfile(profile.id);
    navigate(`/profile/${profile.id}`, { replace: true });
  }

  function deleteForgottenProfile() {
    if (!window.confirm(
      `Delete ${profile.name}? This permanently removes the profile and all of its trades and settings.`,
    )) return;
    deleteProfile(profile.id);
    navigate("/", { replace: true });
  }

  return (
    <main className="fixed inset-0 z-40 flex min-h-screen max-w-none flex-col justify-end bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="panel flex min-h-screen w-full flex-col justify-center rounded-none border-x-0 border-y-0 px-5 py-10 sm:min-h-0 sm:max-w-lg sm:rounded-2xl sm:border-x sm:border-y sm:px-6 sm:py-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
              {needsPinSetup ? "Protect your profile" : "Profile locked"}
            </p>
            <h1 className="text-2xl font-semibold text-white">
              {needsPinSetup ? `Set a PIN for ${profile.name}` : `Enter PIN to unlock ${profile.name}`}
            </h1>
          </div>
          <ModeBadge mode={profile.mode} />
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-400">
          {needsPinSetup
            ? "This profile was created before PIN protection. Set a PIN with 4–32 letters or numbers to continue."
            : "Enter this profile's PIN to open its dashboard."}
        </p>
        <form className="space-y-5" onSubmit={submit} noValidate>
          <label className="field-label">
            <span>{needsPinSetup ? "Create Profile PIN" : "Profile PIN"}</span>
            <input
              autoFocus
              className="!h-14 !text-lg !tracking-[0.2em]"
              type="password"
              autoComplete="current-password"
              inputMode="numeric"
              minLength={4}
              maxLength={32}
              pattern="[A-Za-z0-9]{4,32}"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "pin-error" : undefined}
            />
            {error && <small id="pin-error" className="field-error" role="alert">{error}</small>}
          </label>
          <button className="button-primary w-full text-sm" type="submit">
            {needsPinSetup ? "Set PIN and unlock" : "Unlock profile"}
          </button>
        </form>
        <Link
          className="button-quiet mt-3 w-full"
          to="/"
          onClick={lockProfile}
        >
          Switch profile
        </Link>
        <button
          className="mt-3 min-h-11 w-full rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/20"
          type="button"
          onClick={deleteForgottenProfile}
        >
          Forgot PIN? Delete profile
        </button>
      </section>
    </main>
  );
}

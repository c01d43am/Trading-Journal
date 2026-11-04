import { Link, useNavigate } from "react-router-dom";
import { ModeBadge } from "../components/ModeBadge";
import { useProfileStore } from "../store/profiles";

export function ProfileList() {
  const navigate = useNavigate();
  const profileMap = useProfileStore((state) => state.profiles);
  const profiles = Object.values(profileMap);
  const deleteProfile = useProfileStore((state) => state.deleteProfile);
  const lockProfile = useProfileStore((state) => state.lockProfile);

  function selectProfile(id: string) {
    lockProfile();
    navigate(`/profile/unlock/${id}`);
  }

  function confirmDelete(id: string, name: string) {
    const confirmation = window.prompt(`This permanently deletes "${name}" and all its data. Type ${name} to confirm.`);
    if (confirmation !== name) return;
    deleteProfile(id);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-12 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white">
          <span className="grid size-10 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">TD</span>
          Trading Desk
        </Link>
        <span className="text-xs text-slate-500">Saved locally in this browser</span>
      </header>

      <section className="mb-9 max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Your workspace</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Choose a profile</h1>
        <p className="mt-4 leading-7 text-slate-400">Open a saved trading dashboard or create a backtesting, prop firm, or broker profile.</p>
      </section>

      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Saved profiles <span className="ml-2 text-slate-500">{profiles.length}</span></h2>
        <Link className="button-primary" to="/profile/new">＋ New Profile</Link>
      </div>

      {profiles.length === 0 ? (
        <div className="panel flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-slate-800 text-2xl text-slate-300">↗</span>
          <h3 className="font-semibold text-slate-100">No profiles yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Create your first profile to open a dashboard tailored to your trading mode.</p>
          <Link className="button-primary mt-5" to="/profile/new">Create your first profile</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <article key={profile.id} className="panel transition hover:border-slate-700 hover:bg-slate-900/90">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 truncate text-lg font-semibold text-white">
                    <svg aria-label={profile.accessHash ? "Access-code protected" : "Access-code setup required"} role="img" className="size-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="10" width="16" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                    </svg>
                    <span className="truncate">{profile.name}</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">Created {new Date(profile.createdAt).toLocaleDateString()}</p>
                </div>
                <ModeBadge mode={profile.mode} />
              </div>
              <p className="mb-5 text-xs text-slate-400">
                {profile.mode === "backtesting" && `${profile.backtesting?.pair} · $${profile.backtesting?.capital.toLocaleString()}`}
                {profile.mode === "propfirm" && `${profile.propfirm?.firmName} · ${profile.propfirm?.phase}`}
                {profile.mode === "broker" && `${profile.broker?.brokerName} · $${profile.broker?.capital.toLocaleString()}`}
              </p>
              <div className="flex gap-2">
                <button className="button-primary flex-1" type="button" onClick={() => selectProfile(profile.id)}>Open dashboard</button>
                <button className="button-quiet" type="button" onClick={() => confirmDelete(profile.id, profile.name)} aria-label={`Delete ${profile.name}`}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-slate-600">Profiles and dashboard data are stored locally in this browser.</p>
    </main>
  );
}

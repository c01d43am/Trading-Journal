import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { EditProfileForm } from "../components/dashboard/EditProfileForm";
import { BacktestingWidgets } from "../components/dashboard/BacktestingWidgets";
import { BrokerWidgets } from "../components/dashboard/BrokerWidgets";
import { PropFirmWidgets } from "../components/dashboard/PropFirmWidgets";
import { Journal } from "../components/Journal";
import { filterTradesForProfile } from "../data/tradeFilters";
import { ModeBadge } from "../components/ModeBadge";
import { useProfileStore } from "../store/profiles";
import type { Profile, Trade } from "../types";

const EMPTY_TRADES: Trade[] = [];

export function Dashboard() {
  const { id = "" } = useParams();
  return <ProfileDashboard key={id} id={id} />;
}

function ProfileDashboard({ id }: { id: string }) {
  const navigate = useNavigate();
  const profile = useProfileStore((state) => state.profiles[id]);
  const unlockedProfileId = useProfileStore((state) => state.unlockedProfileId);
  const allTrades = useProfileStore((state) => state.trades[id] ?? EMPTY_TRADES);
  const addTrade = useProfileStore((state) => state.addTrade);
  const saveProfile = useProfileStore((state) => state.saveProfile);
  const deleteProfile = useProfileStore((state) => state.deleteProfile);
  const lockProfile = useProfileStore((state) => state.lockProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const trades = filterTradesForProfile(profile, allTrades);

  useEffect(() => {
    if (!profile) navigate("/", { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;
  if (!isLeaving && unlockedProfileId !== id) return <Navigate to={`/profile/unlock/${id}`} replace />;

  function handleSave(updated: Profile) {
    saveProfile(updated);
    setIsEditing(false);
  }

  function handleDelete() {
    setConfirmingDelete(true);
  }

  function confirmDelete() {
    setIsLeaving(true);
    setConfirmingDelete(false);
    deleteProfile(profile.id);
    navigate("/", { replace: true });
  }

  function navigateAfterLock(path: string) {
    setIsLeaving(true);
    lockProfile();
    navigate(path);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-7 sm:py-9">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigateAfterLock("/")} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-800 bg-slate-900 text-xs font-bold text-slate-200" aria-label="All profiles">TD</button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-white">{profile.name}</h1>
              <ModeBadge mode={profile.mode} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Trading dashboard · Profile-isolated data</p>
          </div>
        </div>
        {!isEditing && (
          <nav className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button className="button-quiet min-h-11 flex-1 sm:flex-none" type="button" onClick={() => setIsEditing(true)}>Edit profile</button>
            <button type="button" className="button-quiet min-h-11 flex-1 sm:flex-none" onClick={() => navigateAfterLock("/")}>Switch profile</button>
            <button type="button" className="button-primary min-h-11 flex-1 sm:flex-none" onClick={() => navigateAfterLock("/profile/new")}>New profile</button>
            <button
              className="min-h-11 flex-1 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/20 sm:flex-none"
              type="button"
              onClick={handleDelete}
            >
              Delete Profile
            </button>
          </nav>
        )}
      </header>

      {isEditing ? (
        <EditProfileForm
          key={profile.id}
          profile={profile}
          onCancel={() => setIsEditing(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {profile.mode === "backtesting" && <BacktestingWidgets key={profile.id} profile={profile} profileId={profile.id} trades={trades} />}
            {profile.mode === "propfirm" && <PropFirmWidgets key={profile.id} profile={profile} profileId={profile.id} trades={trades} />}
            {profile.mode === "broker" && <BrokerWidgets key={profile.id} profile={profile} profileId={profile.id} trades={trades} />}
          </div>
          <Journal
            key={profile.mode === "backtesting"
              ? `${profile.id}:${profile.backtesting?.pair}:${profile.backtesting?.dateFrom}:${profile.backtesting?.dateTo}`
              : profile.id}
            trades={trades}
            dateRange={profile.mode === "backtesting" ? profile.backtesting : undefined}
            fixedSymbol={profile.mode === "backtesting" ? profile.backtesting?.pair : undefined}
            addTrade={(trade) => addTrade(id, trade)}
          />
        </>
      )}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmingDelete(false);
          }}
        >
          <section
            aria-labelledby="delete-profile-title"
            aria-modal="true"
            className="w-full rounded-t-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-white" id="delete-profile-title">Delete profile?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Are you sure you want to delete {profile.name}? This will permanently delete all trade data and settings for this profile.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="button-quiet w-full sm:w-auto"
                type="button"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
              <button
                className="min-h-11 w-full rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/20 sm:w-auto"
                type="button"
                onClick={confirmDelete}
              >
                Confirm Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

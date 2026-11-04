import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { filterTradesForProfile, isTradeForProfilePair, isTradeWithinProfileRange } from "../data/tradeFilters";
import type { EquityPoint, Profile, Trade } from "../types";

type ProfileMap = Record<string, Profile>;
type TradeMap = Record<string, Trade[]>;
type EquityMap = Record<string, EquityPoint[]>;

interface ProfileStore {
  profiles: ProfileMap;
  trades: TradeMap;
  equityData: EquityMap;
  unlockedProfileId: string | null;
  saveProfile: (profile: Profile) => void;
  deleteProfile: (id: string) => void;
  unlockProfile: (id: string) => void;
  lockProfile: () => void;
  addTrade: (profileId: string, trade: Omit<Trade, "profileId">) => void;
  getProfile: (id: string) => Profile | undefined;
  getTrades: (profileId: string) => Trade[];
  getEquityData: (profileId: string) => EquityPoint[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfile(value: unknown): value is Profile {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.createdAt !== "string"
    || (value.pin !== undefined && typeof value.pin !== "string")
    || (value.accessHash !== undefined && typeof value.accessHash !== "string")
    || (value.accessSalt !== undefined && typeof value.accessSalt !== "string")
    || (value.accessMethod !== undefined && !["password", "pin", "passcode"].includes(String(value.accessMethod)))
  ) {
    return false;
  }
  if (value.mode === "backtesting") {
    const data = value.backtesting;
    return isRecord(data)
      && typeof data.pair === "string"
      && typeof data.dateFrom === "string"
      && typeof data.dateTo === "string"
      && typeof data.capital === "number";
  }
  if (value.mode === "propfirm") {
    const data = value.propfirm;
    return isRecord(data)
      && typeof data.firmName === "string"
      && typeof data.capital === "number"
      && typeof data.dailyDrawdownPct === "number"
      && typeof data.maxDrawdownPct === "number"
      && typeof data.targetPct === "number"
      && (data.phase === "Phase 1" || data.phase === "Phase 2" || data.phase === "Master Account");
  }
  if (value.mode === "broker") {
    const data = value.broker;
    return isRecord(data) && typeof data.brokerName === "string" && typeof data.capital === "number";
  }
  return false;
}

function startingCapital(profile: Profile) {
  if (profile.mode === "backtesting") return profile.backtesting?.capital ?? 0;
  if (profile.mode === "propfirm") return profile.propfirm?.capital ?? 0;
  return profile.broker?.capital ?? 0;
}

function initialEquity(profileId: string, capital: number): EquityPoint[] {
  return [{ profileId, label: "Start", value: capital }];
}

function isTrade(value: unknown, profileId: string): value is Trade {
  return isRecord(value)
    && value.profileId === profileId
    && typeof value.id === "string"
    && typeof value.symbol === "string"
    && (value.side === "Long" || value.side === "Short")
    && typeof value.pnl === "number"
    && Number.isFinite(value.pnl)
    && (value.result === "Win" || value.result === "Loss")
    && typeof value.date === "string";
}

function normalizeState(value: unknown): Pick<ProfileStore, "profiles" | "trades" | "equityData"> {
  const source = isRecord(value) && isRecord(value.state) ? value.state : value;
  const normalizeProfile = (profile: Profile): Profile => {
    const normalized = { ...profile };
    delete normalized.pin;
    return normalized;
  };
  if (Array.isArray(source)) {
    const profiles = source.filter(isProfile).reduce<ProfileMap>((map, profile) => {
      map[profile.id] = normalizeProfile(profile);
      return map;
    }, {});
    const trades: TradeMap = {};
    const equityData: EquityMap = {};
    for (const profile of Object.values(profiles)) {
      trades[profile.id] = [];
      equityData[profile.id] = initialEquity(profile.id, startingCapital(profile));
    }
    return { profiles, trades, equityData };
  }
  if (!isRecord(source) || !isRecord(source.profiles)) {
    throw new Error("Invalid profile data in localStorage key \"trading_profiles\".");
  }

  const profiles: ProfileMap = {};
  const profileValues = Array.isArray(source.profiles) ? source.profiles : Object.values(source.profiles);
  for (const profile of profileValues) {
    if (!isProfile(profile)) {
      throw new Error("Invalid profile data in localStorage key \"trading_profiles\".");
    }
    profiles[profile.id] = normalizeProfile(profile);
  }

  const trades: TradeMap = {};
  if (isRecord(source.trades)) {
    for (const [profileId, profileTrades] of Object.entries(source.trades)) {
      if (profiles[profileId] && Array.isArray(profileTrades)) {
        trades[profileId] = profileTrades.filter((trade) => isTrade(trade, profileId));
      }
    }
  }

  const equityData: EquityMap = {};
  if (isRecord(source.equityData)) {
    for (const [profileId, points] of Object.entries(source.equityData)) {
      if (profiles[profileId] && Array.isArray(points)) {
        equityData[profileId] = points.filter(
          (point): point is EquityPoint =>
            isRecord(point)
            && point.profileId === profileId
            && typeof point.label === "string"
            && typeof point.value === "number"
            && Number.isFinite(point.value),
        );
      }
    }
  }
  for (const profile of Object.values(profiles)) {
    trades[profile.id] ??= [];
    equityData[profile.id] ??= equityFromTrades(profile.id, startingCapital(profile), trades[profile.id]);
  }
  return { profiles, trades, equityData };
}

const profileDataStorage = {
  getItem(name: string) {
    const stored = localStorage.getItem(name);
    if (stored === null) return null;
    const normalized = normalizeState(JSON.parse(stored));
    const migrated = JSON.stringify({ state: normalized, version: 2 });
    if (migrated !== stored) localStorage.setItem(name, migrated);
    return migrated;
  },
  setItem(name: string, value: string) {
    const persisted: unknown = JSON.parse(value);
    const normalized = normalizeState(persisted);
    localStorage.setItem(name, JSON.stringify(normalized));
  },
  removeItem(name: string) {
    localStorage.removeItem(name);
  },
};

function equityFromTrades(profileId: string, capital: number, trades: Trade[]): EquityPoint[] {
  const scopedTrades = trades
    .filter((trade) => trade.profileId === profileId)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date));
  return scopedTrades.reduce<EquityPoint[]>((points, trade) => {
    const previous = points[points.length - 1];
    points.push({
      profileId,
      label: trade.date,
      value: Math.round((previous.value + trade.pnl) * 100) / 100,
    });
    return points;
  }, initialEquity(profileId, capital));
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profiles: {},
      trades: {},
      equityData: {},
      unlockedProfileId: null,
      saveProfile: (profile) =>
        set((state) => {
          const previous = state.profiles[profile.id];
          const modeChanged = previous !== undefined && previous.mode !== profile.mode;
          const nextTrades = modeChanged ? [] : state.trades[profile.id] ?? [];
          const shouldResetEquity = modeChanged || !state.equityData[profile.id];
          return {
            profiles: { ...state.profiles, [profile.id]: profile },
            trades: { ...state.trades, [profile.id]: nextTrades },
            equityData: {
              ...state.equityData,
              [profile.id]: shouldResetEquity
                ? initialEquity(profile.id, startingCapital(profile))
                : equityFromTrades(profile.id, startingCapital(profile), nextTrades),
            },
          };
        }),
      deleteProfile: (id) =>
        set((state) => {
          const profiles = { ...state.profiles };
          delete profiles[id];
          const removeProfileData = <T extends { profileId: string }>(
            recordsByProfile: Record<string, T[]>,
          ): Record<string, T[]> =>
            Object.fromEntries(
              Object.entries(recordsByProfile)
                .filter(([profileId]) => profileId !== id)
                .flatMap(([profileId, records]) => {
                  const remaining = records.filter((record) => record.profileId !== id);
                  return remaining.length ? [[profileId, remaining]] : [];
                }),
            );
          const wasUnlocked = state.unlockedProfileId === id;
          return {
            profiles,
            trades: removeProfileData(state.trades),
            equityData: removeProfileData(state.equityData),
            ...(wasUnlocked ? { unlockedProfileId: null } : {}),
          };
        }),
      unlockProfile: (id) => {
        set({ unlockedProfileId: id });
      },
      lockProfile: () => {
        set({ unlockedProfileId: null });
      },
      addTrade: (profileId, trade) =>
        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile) throw new Error(`Cannot add a trade to missing profile "${profileId}".`);
          if (
            !trade.symbol.trim()
            || (trade.side !== "Long" && trade.side !== "Short")
            || !Number.isFinite(trade.pnl)
            || !trade.date
            || !trade.time
          ) {
            throw new Error("Pair, direction, a valid P&L, date, and time are required.");
          }
          if (!isTradeWithinProfileRange(profile, trade)) {
            throw new Error("Trade date must be within the backtesting profile date range.");
          }
          if (!isTradeForProfilePair(profile, trade)) {
            throw new Error(`Trade pair must match the backtesting profile pair (${profile.backtesting?.pair}).`);
          }
          const savedTrade: Trade = { ...trade, profileId };
          const profileTrades = [...(state.trades[profileId] ?? []), savedTrade];
          return {
            trades: { ...state.trades, [profileId]: profileTrades },
            equityData: {
              ...state.equityData,
              [profileId]: equityFromTrades(profileId, startingCapital(profile), profileTrades),
            },
          };
        }),
      getProfile: (id) => get().profiles[id],
      getTrades: (profileId) => {
        const state = get();
        const profileTrades = (state.trades[profileId] ?? []).filter((trade) => trade.profileId === profileId);
        return filterTradesForProfile(state.profiles[profileId], profileTrades);
      },
      getEquityData: (profileId) => (get().equityData[profileId] ?? []).filter((point) => point.profileId === profileId),
    }),
    {
      name: "trading_profiles",
      storage: createJSONStorage(() => profileDataStorage),
      version: 2,
      partialize: ({ profiles, trades, equityData }) => ({ profiles, trades, equityData }),
      merge: (persisted, current) => ({ ...current, ...normalizeState(persisted) }),
    },
  ),
);

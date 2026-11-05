# Trading Dashboard

A React, TypeScript, Vite, Tailwind CSS, Zustand, and React Router dashboard. Profiles are stored in browser `localStorage` under `trading_profiles`; there is no backend.

## Run locally

```bash
npm install
npm run dev
```

## Routes

- `/` — saved profile list
- `/profile/new` — mode-specific profile setup
- `/profile/unlock/:id` — PIN screen before opening a profile
- `/profile/:id` — dashboard for the selected profile

Backtesting profiles open with the journal dashboard. Their Date From and Date To fields accept `dd-mm-yyyy` and include a calendar picker. Prop firm and broker profiles open the account dashboard with metrics and charts based on that profile's saved trades. The dashboard has one trade calendar in the journal. Use **Add trade** to jump to the entry form; saved trades appear in Trading history. Delete a single trade or clear all trades for the active profile from Trading history, with confirmation. Use **Edit profile** to update required fields, switch profile mode, or delete the profile; **Cancel** discards unsaved edits.

The Zustand store persists profiles, trades, and equity data under `trading_profiles`, each in a dictionary keyed by profile ID. New profiles start with no recorded trades and one equity point at their starting capital. Performance charts remain empty until you add trades; all records and metrics are kept separate by profile.

Each new profile requires a 4–32 character alphanumeric PIN. Selecting a profile opens its unlock screen; the active profile remains unlocked for the current browser session and is re-locked when switching profiles. Existing profiles without a PIN will prompt you to create one the first time you open them. For this local-only prototype, PINs are stored as plain text in browser localStorage and are not suitable for protecting sensitive data.

The profile setup/edit pair selector and the journal's instrument picker use the same curated Forex, metals, energy, and cryptocurrency list. Both support custom instruments. If a PIN is forgotten, the unlock screen can permanently delete that profile and its trades after confirmation; PIN recovery is not available.

## File tree

```text
dashboard-app/
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── styles.css
    ├── types.ts
    ├── components/
    │   ├── EquityChart.tsx
    │   ├── ModeBadge.tsx
    │   ├── ProgressBar.tsx
    │   ├── StatCard.tsx
    │   ├── TradesTable.tsx
    │   ├── platform/
    │   │   ├── PlatformCharts.tsx
    │   │   ├── PropTradingDashboard.tsx
    │   │   └── TradingHistory.tsx
    │   └── dashboard/
    │       ├── BacktestingWidgets.tsx
    │       ├── BrokerWidgets.tsx
    │       ├── EditProfileForm.tsx
    │       └── PropFirmWidgets.tsx
    ├── data/
    │   ├── mockData.ts
    ├── platform-dashboard.css
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── LockScreen.tsx
    │   ├── ProfileForm.tsx
    │   └── ProfileList.tsx
    └── store/
        └── profiles.ts
```

Dashboard metrics, charts, objectives, history, and the journal calendar use trades saved under the active profile ID; account charts are empty until you add trades.

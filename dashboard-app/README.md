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

The dashboard opens in view mode with mode-specific profile cards and widgets. Use **Edit profile** to update required fields, switch profile mode, or delete the profile; **Cancel** discards unsaved edits.

The Zustand store persists profiles, trades, and equity data under `trading_profiles`, each in a dictionary keyed by profile ID. New profiles start with no recorded trades and one equity point at their starting capital. Preview trades and charts are generated deterministically from the active profile ID and mode, and are never saved as recorded trades.

Each new profile requires a 4–32 character alphanumeric PIN. Selecting a profile opens its unlock screen; the active profile remains unlocked for the current browser session and is re-locked when switching profiles. Existing profiles without a PIN will prompt you to create one the first time you open them. For this local-only prototype, PINs are stored as plain text in browser localStorage and are not suitable for protecting sensitive data.

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
    │   └── dashboard/
    │       ├── BacktestingWidgets.tsx
    │       ├── BrokerWidgets.tsx
    │       ├── EditProfileForm.tsx
    │       └── PropFirmWidgets.tsx
    ├── data/
    │   └── mockData.ts
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── LockScreen.tsx
    │   ├── ProfileForm.tsx
    │   └── ProfileList.tsx
    └── store/
        └── profiles.ts
```

Mock preview data is generated per profile. Recorded trades and equity points are stored separately under their profile ID.

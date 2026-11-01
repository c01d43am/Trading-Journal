export type Mode = "backtesting" | "propfirm" | "broker";
export type PropFirmPhase = "Phase 1" | "Phase 2" | "Master Account";

export interface Trade {
  id: string;
  profileId: string;
  symbol: string;
  side: "Long" | "Short";
  pnl: number;
  result: "Win" | "Loss";
  date: string;
  time?: string;
  size?: number;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  rMultiple?: number;
  notes?: string;
}

export interface EquityPoint {
  profileId: string;
  label: string;
  value: number;
  timestamp?: string;
}

export interface Profile {
  id: string;
  name: string;
  pin: string;
  mode: Mode;
  createdAt: string;
  backtesting?: {
    pair: string;
    dateFrom: string;
    dateTo: string;
    capital: number;
  };
  propfirm?: {
    firmName: string;
    capital: number;
    dailyDrawdownPct: number;
    maxDrawdownPct: number;
    targetPct: number;
    phase: PropFirmPhase;
  };
  broker?: {
    brokerName: string;
    capital: number;
  };
}

export const MODE_LABELS: Record<Mode, string> = {
  backtesting: "Backtesting",
  propfirm: "Prop Firm",
  broker: "Broker",
};

export const balanceTimeline = {
  labels: ["Wed 21", "Thu 22", "Fri 23", "Sat 24", "Oct 25", "Oct 26", "Oct 27", "Oct 28", "Oct 29", "Oct 30", "Oct 31"],
  balance: [5000, 5018, 4992, 5025.51, 4985, 4958, 4977, 4920, 4892, 4857, 4830.5],
  equity: [5000, 5024, 4998, 5027.7, 4977, 4962, 4984, 4912, 4898, 4850, 4830.5],
};

export const durationBuckets = [
  { label: "2m 31s", low: -42, q1: -18, median: 4, q3: 21, high: 48 },
  { label: "7m 25s", low: -50, q1: -24, median: 8, q3: 27, high: 62 },
  { label: "11m 08s", low: -57, q1: -31, median: -3, q3: 18, high: 54 },
  { label: "18m 42s", low: -38, q1: -15, median: 11, q3: 32, high: 77 },
  { label: "31m 16s", low: -44, q1: -20, median: 5, q3: 24, high: 61 },
];

export const durationScatter = {
  wins: [
    { x: 2.5, y: 18 }, { x: 4.2, y: 31 }, { x: 6.1, y: 24 }, { x: 8.6, y: 42 },
    { x: 11.2, y: 15 }, { x: 13.4, y: 55 }, { x: 17.8, y: 22 }, { x: 21.3, y: 77 },
    { x: 26.1, y: 33 }, { x: 31.4, y: 48 }, { x: 38.2, y: 29 }, { x: 44.6, y: 61 },
  ],
  losses: [
    { x: 3.1, y: -16 }, { x: 5.7, y: -28 }, { x: 9.3, y: -41 }, { x: 12.6, y: -19 },
    { x: 15.1, y: -57 }, { x: 19.7, y: -32 }, { x: 24.9, y: -23 }, { x: 29.5, y: -45 },
    { x: 34.8, y: -27 }, { x: 41.3, y: -38 }, { x: 49.2, y: -18 },
  ],
};

export const instrumentPerformance = {
  labels: ["XAUUSD", "EURUSD", "GBPUSD", "US30", "NAS100", "USDJPY"],
  profit: [312, 154, 96, 82, 45, 28],
  loss: [-238, -186, -142, -121, -87, -54],
  volume: [8.4, 5.2, 4.3, 3.5, 2.8, 1.9],
};

export interface DaySummary {
  trades: number;
  pnl: number;
}

export const novemberDailySummary: Record<number, DaySummary> = {
  2: { trades: 3, pnl: 18.42 },
  3: { trades: 5, pnl: -12.8 },
  4: { trades: 2, pnl: 34.75 },
  5: { trades: 4, pnl: 8.16 },
  6: { trades: 6, pnl: -27.5 },
  9: { trades: 4, pnl: 32.92 },
  10: { trades: 3, pnl: 14.2 },
  11: { trades: 7, pnl: -18.4 },
  12: { trades: 5, pnl: 41.35 },
  13: { trades: 6, pnl: 22.08 },
  16: { trades: 3, pnl: -9.75 },
  17: { trades: 4, pnl: 28.6 },
  18: { trades: 6, pnl: -21.2 },
  19: { trades: 5, pnl: 16.9 },
  20: { trades: 4, pnl: 35.18 },
  23: { trades: 5, pnl: -14.3 },
  24: { trades: 3, pnl: 24.05 },
  25: { trades: 7, pnl: 12.44 },
  27: { trades: 4, pnl: -27.5 },
  30: { trades: 4, pnl: 31.82 },
};

export const weeklySummary = [
  { week: "Week One", pnl: 21.03, days: 5 },
  { week: "Week Two", pnl: 92.15, days: 5 },
  { week: "Week Three", pnl: 49.73, days: 5 },
  { week: "Week Four", pnl: 22.19, days: 5 },
  { week: "Week Five", pnl: 31.82, days: 1 },
];

export interface HistoryTrade {
  symbol: string;
  type: "Buy" | "Sell";
  openDate: string;
  openPrice: string;
  closedDate: string;
  closedPrice: string;
  tp: string;
  sl: string;
  lots: string;
  commission: string;
  profit: number;
}

export const tradingHistory: HistoryTrade[] = [
  { symbol: "XAUUSD", type: "Buy", openDate: "Nov 05, 09:42", openPrice: "2,746.21", closedDate: "Nov 05, 10:18", closedPrice: "2,751.08", tp: "2,758.00", sl: "2,739.00", lots: "0.10", commission: "-$0.70", profit: 48.70 },
  { symbol: "EURUSD", type: "Sell", openDate: "Nov 05, 08:15", openPrice: "1.08742", closedDate: "Nov 05, 08:47", closedPrice: "1.08698", tp: "1.08500", sl: "1.08920", lots: "0.20", commission: "-$1.40", profit: 8.80 },
  { symbol: "GBPUSD", type: "Buy", openDate: "Nov 04, 14:31", openPrice: "1.29810", closedDate: "Nov 04, 15:06", closedPrice: "1.29695", tp: "1.30200", sl: "1.29600", lots: "0.15", commission: "-$1.05", profit: -17.25 },
  { symbol: "NAS100", type: "Sell", openDate: "Nov 04, 11:08", openPrice: "20,184.4", closedDate: "Nov 04, 11:44", closedPrice: "20,166.2", tp: "20,145.0", sl: "20,210.0", lots: "0.10", commission: "-$0.80", profit: 18.20 },
  { symbol: "XAUUSD", type: "Buy", openDate: "Nov 03, 10:52", openPrice: "2,738.60", closedDate: "Nov 03, 11:14", closedPrice: "2,735.74", tp: "2,750.00", sl: "2,733.00", lots: "0.10", commission: "-$0.70", profit: -28.60 },
  { symbol: "USDJPY", type: "Sell", openDate: "Nov 03, 08:35", openPrice: "153.842", closedDate: "Nov 03, 09:02", closedPrice: "153.716", tp: "153.500", sl: "154.000", lots: "0.10", commission: "-$0.65", profit: 8.25 },
  { symbol: "EURUSD", type: "Buy", openDate: "Nov 02, 13:20", openPrice: "1.08521", closedDate: "Nov 02, 14:11", closedPrice: "1.08466", tp: "1.08900", sl: "1.08400", lots: "0.25", commission: "-$1.75", profit: -13.75 },
  { symbol: "US30", type: "Buy", openDate: "Nov 02, 09:18", openPrice: "42,115.0", closedDate: "Nov 02, 09:51", closedPrice: "42,139.2", tp: "42,180.0", sl: "42,090.0", lots: "0.10", commission: "-$0.80", profit: 24.20 },
];

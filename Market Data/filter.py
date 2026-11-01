"""
filter.py — filter TradingView exports (forex/crypto/stock) into pair-style symbols.

Inputs (same folder):
    forex_list.csv
    crypto_list.csv
    stock_list.csv

Outputs:
    all_pairs.csv
    all_pairs.txt   (tab-separated)
"""

import os
import re
import itertools
import pandas as pd

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
FOREX_FILE  = "forex_list.csv"
CRYPTO_FILE = "crypto_list.csv"
STOCK_FILE  = "stock_list.csv"

OUT_CSV = "all_pairs.csv"
OUT_TXT = "all_pairs.txt"

# Stock-pair generation rule: "sector" | "industry" | "all"
STOCK_PAIRING = "sector"

# Max stock pairs to keep (None = unlimited). Pairs are sorted by
# combined market cap descending before truncation.
MAX_STOCK_PAIRS = 2000

# Drop these instrument types from stocks (preferred, warrants, etc.)
DROP_STOCK_TYPES = {"preferred", "warrant", "unit", "right", "fund"}

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
QUOTES = [
    "USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "USDD",
    "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNH",
    "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "TRX", "MATIC",
]

def clean_symbol(sym: str) -> str:
    """Strip exchange prefix ('BINANCE:BTCUSD' -> 'BTCUSD') and separators."""
    s = str(sym).strip().upper()
    if ":" in s:
        s = s.split(":")[-1]
    return re.sub(r"[/\-_=]", "", s)

def fmt_forex(sym: str):
    """'EURUSD' -> 'EUR/USD'. Returns None if not a 6-letter code."""
    s = clean_symbol(sym)
    if len(s) == 6 and s.isalpha():
        return f"{s[:3]}/{s[3:]}"
    return None

def fmt_crypto(sym: str):
    """'BTCUSD' -> 'BTC/USD'; 'ETHUSDT' -> 'ETH/USDT'; 'ETHBTC' -> 'ETH/BTC'."""
    s = clean_symbol(sym)
    for q in QUOTES:
        if s.endswith(q) and len(s) > len(q):
            base = s[: -len(q)]
            if base:  # avoid 'USD/USD'
                return f"{base}/{q}"
    return None

def find_col(df, *candidates):
    """Case-insensitive column lookup."""
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None

def load_csv(path):
    if not os.path.exists(path):
        print(f"  [skip] {path} not found")
        return None
    try:
        df = pd.read_csv(path, low_memory=False)
    except Exception as e:
        print(f"  [error] {path}: {e}")
        return None
    print(f"  [load] {path}: {len(df):,} rows x {len(df.columns)} cols")
    return df

# ------------------------------------------------------------------
# 1. Forex
# ------------------------------------------------------------------
def build_forex(df):
    if df is None or df.empty:
        return pd.DataFrame()

    sym = find_col(df, "Symbol", "Ticker")
    if sym is None:
        print("  [warn] forex: no Symbol column")
        return pd.DataFrame()

    out = pd.DataFrame({
        "Pair":   df[sym].map(fmt_forex),
        "Market": "Forex",
        "Name":   df[find_col(df, "Name", "Description")] if find_col(df, "Name", "Description") else None,
        "Price":  df[find_col(df, "Price", "Close")] if find_col(df, "Price", "Close") else None,
        "Change %": df[find_col(df, "Change %", "Change")] if find_col(df, "Change %", "Change") else None,
    })
    out = out.dropna(subset=["Pair"]).drop_duplicates("Pair")
    return out.reset_index(drop=True)

# ------------------------------------------------------------------
# 2. Crypto
# ------------------------------------------------------------------
def build_crypto(df):
    if df is None or df.empty:
        return pd.DataFrame()

    sym = find_col(df, "Symbol", "Ticker")
    if sym is None:
        print("  [warn] crypto: no Symbol column")
        return pd.DataFrame()

    name_col = find_col(df, "Name", "Description")
    price_col = find_col(df, "Price", "Close")
    chg_col = find_col(df, "Change %", "Change")
    vol_col = find_col(df, "Volume", "24h Volume")
    mcap_col = find_col(df, "Market Capitalization", "Market Cap")

    out = pd.DataFrame({
        "Pair":   df[sym].map(fmt_crypto),
        "Market": "Crypto",
        "Name":   df[name_col] if name_col else None,
        "Price":  df[price_col] if price_col else None,
        "Change %": df[chg_col] if chg_col else None,
        "Volume": df[vol_col] if vol_col else None,
        "Market Capitalization": df[mcap_col] if mcap_col else None,
    })
    out = out.dropna(subset=["Pair"]).drop_duplicates("Pair")
    # prefer USD quotes: sort so USD pairs first, then keep all
    out["_q"] = out["Pair"].str.split("/").str[1]
    out["_qpref"] = out["_q"].map({"USD": 0, "USDT": 1, "USDC": 2, "EUR": 3, "GBP": 4}).fillna(9)
    out = out.sort_values(["_qpref", "Pair"]).drop(columns=["_q", "_qpref"])
    return out.reset_index(drop=True)

# ------------------------------------------------------------------
# 3. Stocks -> generate pairs
# ------------------------------------------------------------------
def build_stock_pairs(df):
    if df is None or df.empty:
        return pd.DataFrame()

    sym = find_col(df, "Symbol", "Ticker")
    if sym is None:
        print("  [warn] stocks: no Symbol column")
        return pd.DataFrame()

    df = df.copy()
    df["_sym"] = df[sym].astype(str).str.split(":").str[-1].str.upper()

    # Drop bad instrument types
    type_col = find_col(df, "Type")
    if type_col:
        mask = ~df[type_col].astype(str).str.lower().isin(DROP_STOCK_TYPES)
        df = df[mask]

    # Keep only rows with a valid price
    price_col = find_col(df, "Price", "Close")
    if price_col:
        df = df[pd.to_numeric(df[price_col], errors="coerce").notna()]

    # Drop duplicates
    df = df.drop_duplicates("_sym")
    print(f"  [stocks] {len(df)} common-stock tickers after filtering")

    if len(df) < 2:
        return pd.DataFrame()

    # Choose grouping column
    group_col = None
    if STOCK_PAIRING == "sector":
        group_col = find_col(df, "Sector")
    elif STOCK_PAIRING == "industry":
        group_col = find_col(df, "Industry")

    mcap_col = find_col(df, "Market Capitalization", "Market Cap")
    if mcap_col:
        df["_mcap"] = pd.to_numeric(df[mcap_col], errors="coerce").fillna(0)
    else:
        df["_mcap"] = 0

    rows = []
    if group_col:
        for grp_name, grp in df.groupby(group_col, dropna=True):
            if len(grp) < 2:
                continue
            grp = grp.sort_values("_mcap", ascending=False)
            syms = grp["_sym"].tolist()
            mcaps = grp["_mcap"].tolist()
            for (a, ma), (b, mb) in itertools.combinations(zip(syms, mcaps), 2):
                rows.append({
                    "Pair":   f"{a}/{b}",
                    "Market": "Stocks",
                    "Sector": grp_name,
                    "_mcap":  ma + mb,
                })
    else:
        syms = df.sort_values("_mcap", ascending=False)["_sym"].tolist()
        mcaps = df.sort_values("_mcap", ascending=False)["_mcap"].tolist()
        for (a, ma), (b, mb) in itertools.combinations(zip(syms, mcaps), 2):
            rows.append({"Pair": f"{a}/{b}", "Market": "Stocks", "Sector": None, "_mcap": ma + mb})

    out = pd.DataFrame(rows)
    if out.empty:
        return out

    out = out.sort_values("_mcap", ascending=False).drop(columns=["_mcap"])
    if MAX_STOCK_PAIRS:
        out = out.head(MAX_STOCK_PAIRS)
    return out.reset_index(drop=True)

# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
def main():
    print("Loading inputs...")
    fx = load_csv(FOREX_FILE)
    cr = load_csv(CRYPTO_FILE)
    st = load_csv(STOCK_FILE)

    print("\nBuilding pairs...")
    fx_out = build_forex(fx);    print(f"  forex  : {len(fx_out):,} pairs")
    cr_out = build_crypto(cr);   print(f"  crypto : {len(cr_out):,} pairs")
    st_out = build_stock_pairs(st); print(f"  stocks : {len(st_out):,} pairs")

    frames = [f for f in (fx_out, cr_out, st_out) if not f.empty]
    if not frames:
        raise SystemExit("No output produced — check input files.")

    allp = pd.concat(frames, ignore_index=True, sort=False)

    # Clean column order
    order = ["Market", "Pair", "Name", "Sector", "Price", "Change %",
             "Volume", "Market Capitalization"]
    order = [c for c in order if c in allp.columns]
    allp = allp[order]

    # Sort: Forex, Crypto, Stocks; then by Pair
    rank = {"Forex": 0, "Crypto": 1, "Stocks": 2}
    allp["_r"] = allp["Market"].map(rank).fillna(9)
    allp = allp.sort_values(["_r", "Pair"], ignore_index=True).drop(columns="_r")

    allp.to_csv(OUT_CSV, index=False)
    allp.to_csv(OUT_TXT, sep="\t", index=False)

    print("\n=== DONE ===")
    print(allp["Market"].value_counts().to_string())
    print(f"\nWrote {OUT_CSV} and {OUT_TXT}")
    print("\nSample:")
    print(allp.head(15).to_string(index=False))

if __name__ == "__main__":
    main()
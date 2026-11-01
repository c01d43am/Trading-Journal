import tvscreener as tvs

# For Forex
forex_df = tvs.ForexScreener().get()
forex_df.to_csv('forex_list.csv', index=False)

# For Crypto
crypto_df = tvs.CryptoScreener().get()
crypto_df.to_csv('crypto_list.csv', index=False)

# For Stocks (e.g., US market)
stock_df = tvs.StockScreener().get()
stock_df.to_csv('stock_list.csv', index=False)
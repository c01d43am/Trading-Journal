from PyInstaller.utils.hooks import collect_all

datas = [(r"..\web", "web")]
binaries = []
hiddenimports = []
for package in (
    "flask",
    "PIL",
    "webview",
    "pythonnet",
    "clr_loader",
    "googleapiclient",
    "google_auth_oauthlib",
    "google.auth",
    "google_auth_httplib2",
):
    package_datas, package_binaries, package_imports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_imports
hiddenimports += [
    "clr",
    "clr_loader",
    "pythonnet",
    "webview.platforms.winforms",
]

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="TradingJournal",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)
collect = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="TradingJournalProfileIsolationUpdateStatus",
)

(() => {
  const $ = (selector) => document.querySelector(selector);
  const dateFns = window.TradeDateFns;
  let trades = [];
  let config = {};
  let google = { available: false };
  let toastTimer;
  let pairCatalog = [];
  let instrumentOptions = [];
  let highlightedInstrument = -1;
  let backtestingProfiles = { profiles: [], active_profile_id: null };
  let calendarMonth = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();
  let calendarSelectedDay = null;
  let calendarProfileKey = null;
  let tradeDatePickerMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let editingProfileId = null;
  let isEditingProfile = false;
  let isNewProfile = false;
  let profileDirty = false;
  let selectedProfileId = null;
  let modeEquityChart = null;

  async function api(url, options = {}) {
    const requestOptions = { ...options };
    if (selectedProfileId && url.startsWith("/api/")) {
      const headers = new Headers(options.headers || {});
      headers.set("X-Trading-Profile-ID", selectedProfileId);
      requestOptions.headers = headers;
    }
    const response = await fetch(url, requestOptions);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  function showToast(message, isError = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
  }

  function formatMoney(value) {
    const amount = Number(value) || 0;
    return `${amount < 0 ? "-$" : "$"}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function numeric(form, name) {
    const value = new FormData(form).get(name);
    return value === "" || value == null ? null : Number(value);
  }

  function profileTypeLabel(type) {
    return {
      backtesting: "Backtesting",
      broker: "Broker",
      prop_firm: "Prop Firm",
    }[type] || "Backtesting";
  }

  function profileModeData(profile) {
    if (!profile) return null;
    if (profile.type === "backtesting" && profile.backtesting) return profile.backtesting;
    if (profile.type === "broker" && profile.broker && typeof profile.broker === "object") return profile.broker;
    if (profile.type === "prop_firm" && profile.prop_firm && typeof profile.prop_firm === "object") return profile.prop_firm;
    return null;
  }

  function profileMetadata(profile) {
    const data = profileModeData(profile);
    if (profile.type === "backtesting" && data) {
      return [
        ["PROFILE NAME", profile.name],
        ["PAIR", data.pair],
        ["DATE RANGE", `${data.date_from} – ${data.date_to}`],
        ["CAPITAL", formatMoney(data.capital)],
      ];
    }
    if (profile.type === "broker" && data) {
      return [
        ["PROFILE NAME", profile.name],
        ["BROKER NAME", data.broker_name],
        ["CAPITAL", formatMoney(data.capital)],
      ];
    }
    if (profile.type === "prop_firm" && data) {
      return [
        ["PROFILE NAME", profile.name],
        ["PROP FIRM", data.firm_name],
        ["CAPITAL", formatMoney(data.capital)],
        ["DD", `${data.daily_drawdown_pct}%`],
        ["MAX DD", `${data.max_drawdown_pct}%`],
        ["TARGET", `${data.target_pct}%`],
        ["PHASE", data.phase],
      ];
    }
    return [
      ["PROFILE NAME", profile.name],
      ["STARTING CAPITAL", profile.capital == null ? "" : formatMoney(profile.capital)],
      ["STRATEGY", profile.strategy],
      ["BROKER", typeof profile.broker === "string" ? profile.broker : ""],
      ["PROP FIRM", typeof profile.prop_firm === "string" ? profile.prop_firm : ""],
    ];
  }

  function setProfileFormMode(form) {
    const type = form.querySelector("[data-profile-mode]").value;
    for (const group of form.querySelectorAll("[data-mode-fields]")) {
      const active = group.dataset.modeFields === type;
      group.hidden = !active;
      for (const field of group.querySelectorAll("input, select")) field.disabled = !active;
    }
    validateProfileForm(form);
  }

  function validateProfileForm(form, submitAttempt = false) {
    if (submitAttempt) form.dataset.submitted = "true";
    const mode = form.querySelector("[data-profile-mode]").value;
    const group = form.querySelector(`[data-mode-fields="${mode}"]`);
    const nameField = form.querySelector('[data-profile-field="name"]');
    const fields = [nameField, ...group.querySelectorAll("[data-profile-field]")];
    let valid = true;
    const values = Object.fromEntries(fields.map((field) => [field.dataset.profileField, field.value.trim()]));

    for (const field of fields) {
      const key = field.dataset.profileField;
      const value = values[key];
      let message = "";
      if (!value) {
        message = "This field is required.";
      } else if (field.type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || (key === "capital" && number === 0)) {
          message = key === "capital" ? "Enter a number greater than 0." : "Enter a valid non-negative number.";
        }
      }
      if (mode === "backtesting" && key === "date_to" && value && values.date_from && value < values.date_from) {
        message = "Date To must be on or after Date From.";
      }
      const error = field.closest(".field").querySelector(`[data-error-for="${key}"]`);
      error.textContent = message;
      const showError = submitAttempt || field.dataset.touched === "true";
      error.hidden = !message || !showError;
      field.setAttribute("aria-invalid", String(Boolean(message && showError)));
      if (message) valid = false;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = !valid;
    return { valid, values, mode };
  }

  function profileFromForm(form, id, createdAt) {
    const validation = validateProfileForm(form, true);
    if (!validation.valid) return null;
    const dataGroup = form.querySelector(`[data-mode-fields="${validation.mode}"]`);
    const value = (key) => dataGroup.querySelector(`[data-profile-field="${key}"]`).value.trim();
    const profile = {
      id,
      type: validation.mode,
      name: validation.values.name,
      created_at: createdAt || new Date().toISOString(),
    };
    if (validation.mode === "backtesting") {
      profile.backtesting = {
        pair: value("pair"),
        date_from: value("date_from"),
        date_to: value("date_to"),
        capital: Number(value("capital")),
      };
    } else if (validation.mode === "prop_firm") {
      profile.prop_firm = {
        firm_name: value("firm_name"),
        capital: Number(value("capital")),
        daily_drawdown_pct: Number(value("daily_drawdown_pct")),
        max_drawdown_pct: Number(value("max_drawdown_pct")),
        target_pct: Number(value("target_pct")),
        phase: value("phase"),
      };
    } else {
      profile.broker = {
        broker_name: value("broker_name"),
        capital: Number(value("capital")),
      };
    }
    return profile;
  }

  function dateTimeDefaults() {
    const now = new Date();
    const pad = (part) => String(part).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const range = selectedCalendarRange();
    const date = range
      ? today < range.dateFrom ? range.dateFrom : today > range.dateTo ? range.dateTo : today
      : today;
    setTradeDate(date);
    $("#trade-time").value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    updateTradeFormValidity();
  }

  function setTradeDate(date) {
    $("#trade-date").value = date;
    tradeDatePickerMonth = dateFns.startOfMonth(dateFns.parseISO(date));
    renderTradeDatePicker();
    updateTradeFormValidity();
  }

  function renderTradeDatePicker() {
    const selected = $("#trade-date").value;
    if (!selected) return;
    const range = selectedCalendarRange();
    const year = tradeDatePickerMonth.getFullYear();
    const month = tradeDatePickerMonth.getMonth();
    $("#trade-date-label").textContent = dateFns.format(dateFns.parseISO(selected), "MMM d, yyyy");
    const monthSelect = $("#trade-date-month");
    if (!monthSelect.options.length) {
      for (let index = 0; index < 12; index += 1) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = dateFns.format(new Date(2020, index, 1), "MMMM");
        monthSelect.appendChild(option);
      }
    }
    monthSelect.value = String(month);
    $("#trade-date-year").value = String(year);
    $("#trade-date-range-hint").textContent = range
      ? `Backtest range: ${range.dateFrom} to ${range.dateTo}`
      : "Any date is available.";

    const firstOfMonth = dateFns.startOfMonth(tradeDatePickerMonth);
    const days = dateFns.eachDayOfInterval({
      start: firstOfMonth,
      end: dateFns.endOfMonth(tradeDatePickerMonth),
    });
    const grid = $("#trade-date-grid");
    grid.replaceChildren();
    for (let index = 0; index < dateFns.getDay(firstOfMonth); index += 1) {
      const blank = document.createElement("span");
      blank.setAttribute("aria-hidden", "true");
      grid.appendChild(blank);
    }
    for (const date of days) {
      const key = localDateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-picker-day";
      button.dataset.tradeDate = key;
      button.textContent = dateFns.format(date, "d");
      button.setAttribute("aria-pressed", String(key === selected));
      button.disabled = Boolean(range && (key < range.dateFrom || key > range.dateTo));
      if (key === selected) button.classList.add("is-selected");
      if (key === localDateKey(new Date())) button.classList.add("is-today");
      grid.appendChild(button);
    }
  }

  function toggleTradeDatePicker(open) {
    const shouldOpen = open ?? $("#trade-date-popover").hidden;
    $("#trade-date-popover").hidden = !shouldOpen;
    $("#trade-date-backdrop").hidden = !shouldOpen;
    $("#trade-date-trigger").setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) renderTradeDatePicker();
  }

  function renderBacktestingProfiles() {
    const select = $("#backtesting-profile-select");
    const activeValue = isNewProfile ? "" : backtestingProfiles.active_profile_id || "";
    const activeProfile = selectedBacktestingProfile();
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = isNewProfile ? "New profile (unsaved)" : "No profile selected";
    select.appendChild(placeholder);
    for (const profile of backtestingProfiles.profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    }
    select.value = activeValue;
    const activeProfileExists = backtestingProfiles.profiles.some(
      (profile) => profile.id === backtestingProfiles.active_profile_id
    );
    $("#profile-empty").hidden = activeProfileExists || isNewProfile;
    $("#edit-profile").hidden = !activeProfile || isNewProfile || isEditingProfile;
    $("#profile-actions").hidden = isEditingProfile || isNewProfile;
    $("#switch-profile").hidden = isEditingProfile || isNewProfile;
    $("#new-profile").hidden = isEditingProfile || isNewProfile;
    $("#backtesting-profile-select").disabled = isEditingProfile || isNewProfile;
    $("#dashboard-view-content").hidden = isEditingProfile || isNewProfile;
    $("#profile-title").textContent = activeProfile?.name || (isNewProfile ? "New profile" : "Trading profiles");
    $("#profile-empty p").textContent = backtestingProfiles.profiles.length
      ? "Choose a saved profile or create another trading workspace."
      : "Create a profile to organize your trading workspace.";
  }

  function showBacktestingProfile(profile = null) {
    const form = $("#backtesting-profile-form");
    isNewProfile = profile === null && isNewProfile;
    editingProfileId = profile?.id || null;
    form.hidden = !isEditingProfile && !isNewProfile;
    $("#profile-type").value = profile?.type || "backtesting";
    $("#profile-name").value = profile?.name || "";
    const data = profileModeData(profile) || {};
    const legacyBroker = typeof profile?.broker === "string" ? profile.broker : "";
    const legacyFirm = typeof profile?.prop_firm === "string" ? profile.prop_firm : "";
    $("#profile-pair").value = data.pair || "";
    $("#profile-date-from").value = data.date_from || "";
    $("#profile-date-to").value = data.date_to || "";
    $("#profile-capital").value = profile?.type === "backtesting" ? data.capital ?? profile?.capital ?? "" : "";
    $("#profile-firm-name").value = data.firm_name || legacyFirm;
    $("#profile-prop-capital").value = profile?.type === "prop_firm" ? data.capital ?? profile?.capital ?? "" : "";
    $("#profile-daily-dd").value = data.daily_drawdown_pct ?? "";
    $("#profile-max-dd").value = data.max_drawdown_pct ?? "";
    $("#profile-target").value = data.target_pct ?? "";
    $("#profile-phase").value = data.phase || "";
    $("#profile-broker-name").value = data.broker_name || legacyBroker;
    $("#profile-broker-capital").value = profile?.type === "broker" ? data.capital ?? profile?.capital ?? "" : "";
    $("#delete-profile").hidden = !profile;
    $("#save-profile").textContent = profile ? "Save Updates" : "Create profile";
    $("#profile-error").textContent = "";
    delete form.dataset.submitted;
    for (const field of form.querySelectorAll("[data-profile-field]")) {
      delete field.dataset.touched;
      field.closest(".field").querySelectorAll(".field-error").forEach((error) => {
        error.textContent = "";
        error.hidden = true;
      });
    }
    profileDirty = false;
    setProfileFormMode(form);
    renderBacktestingProfiles();
  }

  function selectedBacktestingProfile() {
    return backtestingProfiles.profiles.find(
      (profile) => profile.id === backtestingProfiles.active_profile_id
    ) || null;
  }

  function renderProfileGate() {
    const list = $("#profile-gate-list");
    list.replaceChildren();
    const count = backtestingProfiles.profiles.length;
    $("#profile-gate-count").textContent = `${count} ${count === 1 ? "profile" : "profiles"}`;
    $("#profile-gate-empty").hidden = count > 0;
    for (const profile of backtestingProfiles.profiles) {
      const card = document.createElement("article");
      card.className = "profile-choice-card";
      const detail = document.createElement("div");
      detail.className = "profile-choice-detail";
      const titleRow = document.createElement("div");
      titleRow.className = "profile-choice-title-row";
      const title = document.createElement("h3");
      title.textContent = profile.name;
      const badge = document.createElement("span");
      badge.className = `profile-choice-badge profile-choice-badge-${profile.type}`;
      badge.textContent = profileTypeLabel(profile.type).toUpperCase();
      titleRow.append(title, badge);
      detail.appendChild(titleRow);

      const metadata = document.createElement("div");
      metadata.className = "profile-choice-metadata";
      const details = profileMetadata(profile).filter(([, value]) => value);
      for (const [label, value] of details) {
        const item = document.createElement("span");
        const heading = document.createElement("small");
        heading.textContent = label;
        const content = document.createElement("strong");
        content.textContent = value;
        item.append(heading, content);
        metadata.appendChild(item);
      }
      detail.appendChild(metadata);

      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "button secondary profile-choice-open";
      choose.textContent = "Open dashboard";
      choose.addEventListener("click", () => openProfileDashboard(profile.id));
      card.append(detail, choose);
      list.appendChild(card);
    }
  }

  function showProfileGate() {
    isEditingProfile = false;
    isNewProfile = false;
    $("#profile-gate").hidden = false;
    $("#main-dashboard").hidden = true;
    $("#settings-open").hidden = true;
    $("#profile-gate-form").hidden = true;
    $("#profile-gate-create").hidden = false;
    $("#profile-gate-error").textContent = "";
    renderProfileGate();
  }

  function showProfileDashboard() {
    $("#profile-gate").hidden = true;
    $("#main-dashboard").hidden = false;
    $("#settings-open").hidden = false;
    renderModeDashboard(selectedBacktestingProfile());
  }

  function dashboardCard(label, value, detail, mode, valueTone = "") {
    const card = document.createElement("article");
    card.className = `mode-stat-card mode-${mode}`;
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = value;
    if (valueTone) amount.classList.add(`mode-stat-value-${valueTone}`);
    const caption = document.createElement("small");
    caption.textContent = detail;
    card.append(title, amount, caption);
    return card;
  }

  function dashboardPanel(title, subtitle = "") {
    const panel = document.createElement("section");
    panel.className = "mode-panel";
    const heading = document.createElement("div");
    heading.className = "mode-panel-heading";
    const label = document.createElement("h2");
    label.textContent = title;
    heading.appendChild(label);
    if (subtitle) {
      const description = document.createElement("p");
      description.textContent = subtitle;
      heading.appendChild(description);
    }
    panel.appendChild(heading);
    return panel;
  }

  function formatChartDateTime(timestamp) {
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
      : String(timestamp || "");
  }

  function createEquityCurve(equityCurve, color, title = "Equity curve") {
    const panel = dashboardPanel(title, "Starting capital plus recorded journal trades");
    const chart = document.createElement("div");
    chart.className = "mode-equity-chart";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", title);
    chart.appendChild(canvas);
    panel.appendChild(chart);

    const values = equityCurve.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = (maximum - minimum) * 0.15 || Math.max(Math.abs(values[0] || 0) * 0.01, 1);
    const finalValue = values.at(-1) ?? 0;
    const startingValue = values[0] ?? 0;
    const lineColor = finalValue > startingValue ? "#4bd6a0" : finalValue < startingValue ? "#fa7c88" : color;
    const labels = equityCurve.map((point) => point.timestamp || point.label);
    const chartLibrary = window.Chart;
    if (chartLibrary) {
      modeEquityChart = new chartLibrary(canvas, {
        type: "line",
        data: {
          labels: labels.map((timestamp) => {
            const date = new Date(timestamp);
            return Number.isFinite(date.getTime())
              ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
              : String(timestamp);
          }),
          datasets: [{
            data: values,
            borderColor: lineColor,
            backgroundColor: `${lineColor}22`,
            borderWidth: 2,
            pointRadius: (context) => context.dataIndex === 0 ? 3 : 0,
            pointHoverRadius: 4,
            pointBackgroundColor: lineColor,
            fill: true,
            tension: 0.25,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false, axis: "x" },
          animation: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#81909e", autoSkip: true, maxTicksLimit: 7, maxRotation: 0 },
              border: { color: "#26333e" },
            },
            y: {
              min: minimum - padding,
              max: maximum + padding,
              grid: { color: "rgba(148, 163, 184, 0.12)", tickBorderDash: [4, 4] },
              ticks: { color: "#81909e", callback: (value) => formatMoney(value) },
              border: { color: "#26333e", dash: [4, 4] },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              displayColors: false,
              callbacks: {
                title: (items) => formatChartDateTime(labels[items[0]?.dataIndex ?? 0]),
                label: (item) => `Equity: ${formatMoney(item.parsed.y)}`,
              },
            },
          },
        },
        plugins: [{
          id: "equity-crosshair",
          afterDraw(chartInstance) {
            const activeElement = chartInstance.tooltip?.getActiveElements()[0];
            if (!activeElement) return;
            const { ctx, chartArea } = chartInstance;
            const { x, y } = activeElement.element;
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.strokeStyle = "rgba(203, 213, 225, 0.65)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#e2e8f0";
            ctx.fill();
            ctx.restore();
          },
        }],
      });
    }
    return panel;
  }

  function calculateJournalMetrics(profileId, startingCapital, journalTrades, startingAt) {
    const sortedTrades = journalTrades
      .slice()
      .sort((left, right) =>
        `${left.date || ""}T${left.time || "00:00:00"}`.localeCompare(
          `${right.date || ""}T${right.time || "00:00:00"}`,
        ),
      );
    let balance = startingCapital;
    let peak = startingCapital;
    let maxDrawdown = 0;
    let activeDate = "";
    let dailyPeak = startingCapital;
    let dailyDrawdown = 0;
    const firstTrade = sortedTrades[0];
    const equityCurve = [{
      label: "Start",
      value: startingCapital,
      timestamp: startingAt || (firstTrade ? `${firstTrade.date}T${firstTrade.time || "00:00:00"}` : new Date().toISOString()),
    }];
    for (const trade of sortedTrades) {
      const pnl = Number(trade.pnl) || 0;
      if (trade.date !== activeDate) {
        activeDate = trade.date;
        dailyPeak = balance;
      }
      balance += pnl;
      peak = Math.max(peak, balance);
      maxDrawdown = Math.max(maxDrawdown, peak - balance);
      dailyPeak = Math.max(dailyPeak, balance);
      dailyDrawdown = Math.max(dailyDrawdown, dailyPeak - balance);
      equityCurve.push({
        label: trade.time ? `${trade.date || ""} ${trade.time}` : trade.date || "",
        value: Math.round(balance * 100) / 100,
        timestamp: `${trade.date || ""}T${trade.time || "00:00:00"}`,
      });
    }
    const netProfit = sortedTrades.reduce((total, trade) => total + (Number(trade.pnl) || 0), 0);
    const roundedBalance = Math.round((startingCapital + netProfit) * 100) / 100;
    const roundedOpenPnl = 0;
    const equity = roundedBalance;
    equityCurve.push({
      label: "Current",
      value: equity,
      timestamp: new Date().toISOString(),
    });
    return {
      netProfit: Math.round(netProfit * 100) / 100,
      balance: roundedBalance,
      openPnl: roundedOpenPnl,
      equity,
      dailyDrawdown: Math.round(dailyDrawdown * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      equityCurve,
    };
  }
  function renderCompliance(account, accountMetrics) {
    const targetProgress = account.capital * account.target_pct > 0
      ? Math.max(0, (accountMetrics.netProfit / (account.capital * account.target_pct / 100)) * 100)
      : 0;
    const dailyLimit = account.capital * account.daily_drawdown_pct / 100;
    const maxLimit = account.capital * account.max_drawdown_pct / 100;
    const dailyUsage = dailyLimit > 0
      ? Math.min(accountMetrics.dailyDrawdown / dailyLimit * 100, 100)
      : 0;
    const maxUsage = maxLimit > 0
      ? Math.min(accountMetrics.maxDrawdown / maxLimit * 100, 100)
      : 0;
    const panel = dashboardPanel("Compliance");
    const metrics = document.createElement("div");
    metrics.className = "compliance-grid";

    const target = document.createElement("div");
    target.className = "compliance-metric";
    const targetLabel = document.createElement("span");
    targetLabel.textContent = "Progress to Target";
    const targetValue = document.createElement("strong");
    targetValue.textContent = `${Math.min(targetProgress, 100).toFixed(1)}%`;
    const progressTrack = document.createElement("div");
    progressTrack.className = "compliance-progress";
    const progress = document.createElement("span");
    progress.style.width = `${Math.min(targetProgress, 100)}%`;
    progressTrack.appendChild(progress);
    target.append(targetLabel, targetValue, progressTrack);

    const remainingMetric = (label, limitPct, usedPct) => {
      const metric = document.createElement("div");
      metric.className = "compliance-metric";
      const heading = document.createElement("span");
      heading.textContent = label;
      const percent = limitPct * (1 - usedPct / 100);
      const cash = account.capital * percent / 100;
      const value = document.createElement("strong");
      value.textContent = `${percent.toFixed(2)}% · ${formatMoney(cash)}`;
      const detail = document.createElement("small");
      detail.textContent = `of ${limitPct}% allowed`;
      metric.append(heading, value, detail);
      return metric;
    };
    metrics.append(target, remainingMetric("Daily DD remaining", account.daily_drawdown_pct, dailyUsage));
    metrics.appendChild(remainingMetric("Max DD remaining", account.max_drawdown_pct, maxUsage));
    panel.appendChild(metrics);

    const pills = document.createElement("div");
    pills.className = "rule-status-pills";
    for (const [label, usage] of [["Daily DD", dailyUsage], ["Max DD", maxUsage], ["Target", Math.min(Math.round(targetProgress), 100)]]) {
      const pill = document.createElement("span");
      const status = usage >= 90 ? "Breached" : usage >= 70 ? "Warning" : "OK";
      pill.className = `rule-status rule-${status.toLowerCase()}`;
      pill.textContent = `${label}: ${status} · ${usage}% used`;
      pills.appendChild(pill);
    }
    panel.appendChild(pills);
    return panel;
  }

  function renderModeDashboard(profile) {
    const section = $("#mode-dashboard");
    const grid = $("#mode-dashboard-grid");
    modeEquityChart?.destroy();
    modeEquityChart = null;
    grid.replaceChildren();
    const data = profileModeData(profile);
    if (!profile || !data) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const metrics = calculateJournalMetrics(profile.id, data.capital, trades, profile.created_at);
    if (profile.type === "backtesting") {
      grid.append(
        dashboardCard("PAIR", data.pair, "Backtesting instrument", profile.type),
        dashboardCard("CAPITAL", formatMoney(data.capital), "Starting capital", profile.type),
        dashboardCard("BALANCE", formatMoney(metrics.balance), "Starting capital + realized journal P&L", profile.type, metrics.balance >= data.capital ? "positive" : "negative"),
        dashboardCard("EQUITY", formatMoney(metrics.equity), "Balance + open P&L", profile.type, metrics.equity >= data.capital ? "positive" : "negative"),
        dashboardCard("OPEN P&L", formatMoney(metrics.openPnl), "No open trades recorded", profile.type, metrics.openPnl >= 0 ? "positive" : "negative"),
        createEquityCurve(metrics.equityCurve, "#62a8ff"),
      );
    } else if (profile.type === "prop_firm") {
      grid.append(
        dashboardCard("PROP FIRM", data.firm_name, "Account provider", profile.type),
        dashboardCard("CAPITAL", formatMoney(data.capital), "Starting capital", profile.type),
        dashboardCard("BALANCE", formatMoney(metrics.balance), "Starting capital + realized journal P&L", profile.type, metrics.balance >= data.capital ? "positive" : "negative"),
        dashboardCard("EQUITY", formatMoney(metrics.equity), "Balance + open P&L", profile.type, metrics.equity >= data.capital ? "positive" : "negative"),
        dashboardCard("OPEN P&L", formatMoney(metrics.openPnl), "No open trades recorded", profile.type, metrics.openPnl >= 0 ? "positive" : "negative"),
        renderCompliance(data, metrics),
        createEquityCurve(metrics.equityCurve, "#ba8aff"),
      );
    } else {
      grid.append(
        dashboardCard("BROKER", data.broker_name, "Broker name", profile.type),
        dashboardCard("CAPITAL", formatMoney(data.capital), "Starting capital", profile.type),
        dashboardCard("BALANCE", formatMoney(metrics.balance), "Starting capital + realized journal P&L", profile.type, metrics.balance >= data.capital ? "positive" : "negative"),
        dashboardCard("EQUITY", formatMoney(metrics.equity), "Balance + open P&L", profile.type, metrics.equity >= data.capital ? "positive" : "negative"),
        dashboardCard("OPEN P&L", formatMoney(metrics.openPnl), "No open trades recorded", profile.type, metrics.openPnl >= 0 ? "positive" : "negative"),
        createEquityCurve(metrics.equityCurve, "#62d9a5"),
      );
    }
  }

  async function loadProfileData() {
    const [tradeData, settings, mode] = await Promise.all([
      api("/api/trades"),
      api("/api/config"),
      api("/api/mode"),
    ]);
    trades = tradeData;
    config = settings;
    $("#mode-label").textContent = mode.mode === "desktop" ? "Desktop · local data" : "Web · local data";
    renderInstrumentOptions();
    populateSettings();
    renderCustomInputs();
    renderTrades();
    await refreshGoogleStatus();
  }

  async function persistActiveProfile(profileId) {
    backtestingProfiles = await api("/api/backtesting-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: backtestingProfiles.profiles,
        active_profile_id: profileId,
      }),
    });
    renderBacktestingProfiles();
    renderProfileGate();
  }

  async function openProfileDashboard(profileId) {
    try {
      await persistActiveProfile(profileId);
      selectedProfileId = profileId;
      dateTimeDefaults();
      isEditingProfile = false;
      isNewProfile = false;
      showBacktestingProfile(selectedBacktestingProfile());
      await loadProfileData();
      showProfileDashboard();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function startProfileGateCreation() {
    $("#profile-gate-create").hidden = true;
    const form = $("#profile-gate-form");
    form.hidden = false;
    $("#profile-gate-error").textContent = "";
    form.reset();
    $("#profile-gate-type").value = "backtesting";
    delete form.dataset.submitted;
    for (const field of form.querySelectorAll("[data-profile-field]")) {
      delete field.dataset.touched;
      field.closest(".field").querySelectorAll(".field-error").forEach((error) => {
        error.textContent = "";
        error.hidden = true;
      });
    }
    setProfileFormMode(form);
    $("#profile-gate-name").focus();
  }

  function cancelProfileGateCreation() {
    $("#profile-gate-form").hidden = true;
    $("#profile-gate-create").hidden = false;
    $("#profile-gate-error").textContent = "";
  }

  async function createProfileFromGate(event) {
    event.preventDefault();
    const form = $("#profile-gate-form");
    const profile = profileFromForm(form, crypto.randomUUID());
    if (!profile) return;
    const button = $("#profile-gate-save");
    button.disabled = true;
    $("#profile-gate-error").textContent = "";
    try {
      backtestingProfiles = await api("/api/backtesting-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: [...backtestingProfiles.profiles, profile],
          active_profile_id: profile.id,
        }),
      });
      selectedProfileId = profile.id;
      isEditingProfile = false;
      isNewProfile = false;
      renderBacktestingProfiles();
      renderProfileGate();
      showBacktestingProfile(selectedBacktestingProfile());
      await loadProfileData();
      showProfileDashboard();
      showToast("Profile created. Welcome to your dashboard.");
    } catch (error) {
      $("#profile-gate-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function confirmDiscardProfileEdits() {
    return !profileDirty || window.confirm("Discard your unsaved profile changes?");
  }

  async function saveBacktestingProfile(event) {
    event.preventDefault();
    $("#profile-error").textContent = "";
    const existing = backtestingProfiles.profiles.find((item) => item.id === editingProfileId);
    const profile = profileFromForm(
      $("#backtesting-profile-form"),
      editingProfileId || crypto.randomUUID(),
      existing?.created_at,
    );
    if (!profile) return;
    const profiles = [...backtestingProfiles.profiles];
    const index = profiles.findIndex((item) => item.id === editingProfileId);
    if (index >= 0) profiles[index] = { ...profiles[index], ...profile };
    else profiles.push(profile);

    const button = $("#save-profile");
    button.disabled = true;
    const previousProfileId = selectedProfileId;
    try {
      backtestingProfiles = await api("/api/backtesting-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles,
          active_profile_id: profile.id,
        }),
      });
      selectedProfileId = profile.id;
      if (previousProfileId !== profile.id) $("#main-dashboard").hidden = true;
      isEditingProfile = false;
      isNewProfile = false;
      showBacktestingProfile(selectedBacktestingProfile());
      await loadProfileData();
      showProfileDashboard();
      showToast("Profile saved.");
    } catch (error) {
      $("#profile-error").textContent = error.message;
      if (previousProfileId !== selectedProfileId) showProfileGate();
    } finally {
      button.disabled = false;
    }
  }

  async function changeActiveBacktestingProfile(event) {
    if (!confirmDiscardProfileEdits()) {
      event.target.value = isNewProfile ? "" : backtestingProfiles.active_profile_id || "";
      return;
    }
    const activeProfileId = event.target.value || null;
    try {
      $("#main-dashboard").hidden = true;
      backtestingProfiles = await api("/api/backtesting-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles: backtestingProfiles.profiles,
          active_profile_id: activeProfileId,
        }),
      });
      selectedProfileId = activeProfileId;
      isEditingProfile = false;
      isNewProfile = false;
      showBacktestingProfile(selectedBacktestingProfile());
      if (activeProfileId) {
        await loadProfileData();
        showProfileDashboard();
      } else {
        showProfileGate();
      }
    } catch (error) {
      $("#profile-error").textContent = error.message;
      renderBacktestingProfiles();
      showProfileGate();
    }
  }

  function startNewBacktestingProfile() {
    if (!confirmDiscardProfileEdits()) return;
    isNewProfile = true;
    isEditingProfile = false;
    showBacktestingProfile();
    $("#profile-name").focus();
  }

  function editActiveBacktestingProfile() {
    if (!confirmDiscardProfileEdits()) return;
    isNewProfile = false;
    isEditingProfile = true;
    showBacktestingProfile(selectedBacktestingProfile());
    $("#profile-name").focus();
  }

  function cancelBacktestingProfileEdit() {
    isEditingProfile = false;
    isNewProfile = false;
    showBacktestingProfile(selectedBacktestingProfile());
    if (selectedBacktestingProfile()) showProfileDashboard();
    else showProfileGate();
  }

  async function deleteBacktestingProfile() {
    const profile = selectedBacktestingProfile();
    if (!profile || !window.confirm(`Delete the "${profile.name}" profile? This cannot be undone.`)) return;
    const profiles = backtestingProfiles.profiles.filter((item) => item.id !== profile.id);
    const nextActiveId = profiles[0]?.id || null;
    try {
      $("#main-dashboard").hidden = true;
      backtestingProfiles = await api("/api/backtesting-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles, active_profile_id: nextActiveId }),
      });
      selectedProfileId = nextActiveId;
      isEditingProfile = false;
      isNewProfile = false;
      showBacktestingProfile(selectedBacktestingProfile());
      if (nextActiveId) await loadProfileData();
      else {
        trades = [];
        config = {};
        renderTrades();
        showProfileGate();
      }
      showToast("Backtesting profile deleted.");
    } catch (error) {
      $("#profile-error").textContent = error.message;
      showProfileGate();
    }
  }

  function renderCustomInputs() {
    const container = $("#custom-fields");
    container.replaceChildren();
    for (const field of config.custom_fields || []) {
      const label = document.createElement("label");
      label.className = "field";
      label.textContent = field.name;
      const input = document.createElement("input");
      input.type = field.type === "number" ? "number" : field.type;
      input.step = field.type === "number" ? "any" : "";
      input.dataset.customName = field.name;
      label.appendChild(input);
      container.appendChild(label);
    }
  }

  function renderTrades() {
    renderTradeCalendar();
    renderStats();
    const profile = selectedBacktestingProfile();
    if (profile) renderModeDashboard(profile);
  }

  function localDateKey(date) {
    return dateFns.format(date, "yyyy-MM-dd");
  }

  function selectedCalendarRange() {
    const profile = selectedBacktestingProfile();
    const data = profileModeData(profile);
    if (profile?.type !== "backtesting" || !data?.date_from || !data?.date_to) return null;
    return { profileId: profile.id, dateFrom: data.date_from, dateTo: data.date_to };
  }

  function calendarTrades() {
    const range = selectedCalendarRange();
    return range
      ? trades.filter((trade) => {
        const date = String(trade.date || "").slice(0, 10);
        return date >= range.dateFrom && date <= range.dateTo;
      })
      : trades;
  }

  function signedCurrency(value) {
    const amount = Number(value) || 0;
    return amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount);
  }

  function renderTradeCalendar() {
    const profile = selectedBacktestingProfile();
    const range = selectedCalendarRange();
    const rangeKey = range
      ? `${range.profileId}:${range.dateFrom}:${range.dateTo}`
      : profile ? `${profile.id}:${profile.type}` : "";
    if (calendarProfileKey !== rangeKey) {
      calendarProfileKey = rangeKey;
      calendarSelectedDay = null;
      if (range) calendarMonth = dateFns.startOfMonth(dateFns.parseISO(range.dateFrom));
    }
    const scopedTrades = calendarTrades();
    const dateInput = $("#trade-date");
    dateInput.min = range?.dateFrom || "";
    dateInput.max = range?.dateTo || "";
    if (range && (dateInput.value < range.dateFrom || dateInput.value > range.dateTo)) {
      setTradeDate(range.dateFrom);
    }
    renderTradeDatePicker();
    $("#calendar-backtest-range").hidden = !range;
    $("#calendar-backtest-range").textContent = range
      ? `Backtest Range: ${range.dateFrom} to ${range.dateTo}`
      : "";

    const totalPnl = scopedTrades.reduce((total, trade) => total + (Number(trade.pnl) || 0), 0);
    const wins = scopedTrades.filter((trade) => Number(trade.pnl) > 0).length;
    const winRate = scopedTrades.length ? wins / scopedTrades.length * 100 : 0;
    const pairCounts = new Map();
    for (const trade of scopedTrades) {
      const label = String(trade.instrument || "").trim() || "—";
      const key = label.toLocaleLowerCase();
      const current = pairCounts.get(key);
      if (current) current.count += 1;
      else pairCounts.set(key, { label, count: 1 });
    }
    const topPair = [...pairCounts.values()].sort((left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
    )[0]?.label || "—";

    $("#calendar-total-trades").textContent = String(scopedTrades.length);
    $("#calendar-win-rate").textContent = `${winRate.toFixed(1)}%`;
    $("#calendar-win-rate").className = winRate > 50 ? "positive" : winRate < 50 ? "negative" : "";
    $("#calendar-total-pnl").textContent = formatMoney(totalPnl);
    $("#calendar-total-pnl").className = totalPnl > 0 ? "positive" : totalPnl < 0 ? "negative" : "";
    $("#calendar-top-pair").textContent = topPair;

    const monthName = dateFns.format(calendarMonth, "MMMM");
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    $("#calendar-month-label").textContent = `${monthName} ${year}`;
    const monthSelect = $("#calendar-month-select");
    if (!monthSelect.options.length) {
      for (let index = 0; index < 12; index += 1) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = dateFns.format(new Date(2020, index, 1), "MMMM");
        monthSelect.appendChild(option);
      }
    }
    monthSelect.value = String(month);
    $("#calendar-year-select").value = String(year);
    const firstOfMonth = dateFns.startOfMonth(calendarMonth);
    const monthDays = dateFns.eachDayOfInterval({
      start: firstOfMonth,
      end: dateFns.endOfMonth(calendarMonth),
    });
    const leadingDays = dateFns.getDay(firstOfMonth);
    const cellCount = Math.ceil((leadingDays + monthDays.length) / 7) * 7;
    const grouped = new Map();
    for (const trade of scopedTrades) {
      const key = String(trade.date || "").slice(0, 10);
      const dayTrades = grouped.get(key) || [];
      dayTrades.push(trade);
      grouped.set(key, dayTrades);
    }

    const grid = $("#trade-calendar-grid");
    grid.replaceChildren();
    for (let index = 0; index < cellCount; index += 1) {
      const dayIndex = index - leadingDays;
      if (dayIndex < 0 || dayIndex >= monthDays.length) {
        const blank = document.createElement("div");
        blank.className = "trade-calendar-empty";
        blank.setAttribute("aria-hidden", "true");
        grid.appendChild(blank);
        continue;
      }

      const date = monthDays[dayIndex];
      const dateKey = localDateKey(date);
      const dayTrades = grouped.get(dateKey) || [];
      const dailyPnl = dayTrades.reduce((total, trade) => total + (Number(trade.pnl) || 0), 0);
      const isInRange = !range || (dateKey >= range.dateFrom && dateKey <= range.dateTo);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.disabled = !isInRange;
      cell.className = `trade-calendar-day${isInRange && range ? " is-in-range" : ""}${!isInRange ? " is-out-of-range" : ""}${dateFns.isSameDay(date, new Date()) ? " is-today" : ""}${dateKey === calendarSelectedDay ? " is-selected" : ""}`;
      cell.dataset.calendarDate = dateKey;
      cell.setAttribute("aria-pressed", String(dateKey === calendarSelectedDay));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${date.toLocaleDateString()}, ${isInRange ? `${dayTrades.length} trades, ${signedCurrency(dailyPnl)}` : "outside backtest range"}`);

      const dateLabel = document.createElement("span");
      dateLabel.className = "trade-calendar-date";
      dateLabel.textContent = dateFns.format(date, "d");
      cell.appendChild(dateLabel);
      if (dayTrades.length) {
        const count = document.createElement("span");
        count.className = "trade-calendar-count";
        count.textContent = `${dayTrades.length} `;
        const countLabel = document.createElement("span");
        countLabel.className = "trade-calendar-count-label";
        countLabel.textContent = dayTrades.length === 1 ? "trade" : "trades";
        count.appendChild(countLabel);
        const pnl = document.createElement("strong");
        pnl.className = `trade-calendar-pnl${dailyPnl > 0 ? " positive" : dailyPnl < 0 ? " negative" : ""}`;
        pnl.textContent = signedCurrency(dailyPnl);
        cell.append(count, pnl);
      }
      grid.appendChild(cell);
    }
    renderCalendarTradeList();
  }

  function renderCalendarTradeList() {
    const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}`;
    const range = selectedCalendarRange();
    const visibleTrades = calendarTrades()
      .filter((trade) => {
        const dateKey = String(trade.date || "").slice(0, 10);
        const withinRange = !range || (dateKey >= range.dateFrom && dateKey <= range.dateTo);
        return withinRange && (calendarSelectedDay ? dateKey === calendarSelectedDay : dateKey.startsWith(monthKey));
      })
      .slice()
      .sort((left, right) =>
        `${left.date || ""}T${left.time || ""}`.localeCompare(`${right.date || ""}T${right.time || ""}`),
      );
    const title = calendarSelectedDay
      ? dateFns.format(dateFns.parseISO(calendarSelectedDay), "MMMM d, yyyy")
      : dateFns.format(calendarMonth, "MMMM yyyy");
    $("#calendar-list-title").textContent = `Trade History · ${title}`;
    if (range && (monthKey < range.dateFrom.slice(0, 7) || monthKey > range.dateTo.slice(0, 7))) {
      $("#calendar-list-empty").textContent = "This month is outside the backtest range.";
    } else {
      $("#calendar-list-empty").textContent = "No trades recorded for this month.";
    }
    $("#calendar-list-count").textContent = `${visibleTrades.length} ${visibleTrades.length === 1 ? "trade" : "trades"}`;
    $("#calendar-clear-day").hidden = !calendarSelectedDay;
    const body = $("#calendar-trade-rows");
    const cards = $("#calendar-trade-cards");
    body.replaceChildren();
    cards.replaceChildren();
    $("#calendar-list-empty").hidden = visibleTrades.length > 0;
    for (const trade of visibleTrades) {
      const row = document.createElement("tr");
      for (const value of [
        `${trade.date || "—"} ${trade.time || ""}`.trim(),
        trade.instrument || "—",
        trade.direction || "Long",
        trade.entry_price ?? "—",
        trade.exit_price ?? "—",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      }
      const pnl = document.createElement("td");
      pnl.className = Number(trade.pnl) > 0 ? "positive" : Number(trade.pnl) < 0 ? "negative" : "";
      pnl.textContent = formatMoney(trade.pnl);
      row.appendChild(pnl);
      const multiple = document.createElement("td");
      multiple.textContent = trade.r_multiple == null ? "—" : `${Number(trade.r_multiple).toFixed(2)}R`;
      row.appendChild(multiple);
      const action = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-button";
      remove.setAttribute("aria-label", `Delete ${trade.instrument || "trade"}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => void deleteTrade(trade));
      action.appendChild(remove);
      row.appendChild(action);
      body.appendChild(row);

      const card = document.createElement("article");
      card.className = "calendar-list-card";
      const heading = document.createElement("div");
      heading.className = "calendar-list-card-heading";
      const pair = document.createElement("strong");
      pair.textContent = trade.instrument || "—";
      const direction = document.createElement("span");
      direction.className = `badge ${trade.direction === "Short" ? "short" : "long"}`;
      direction.textContent = trade.direction || "Long";
      heading.append(pair, direction);
      const date = document.createElement("p");
      date.textContent = `${trade.date || "—"} ${trade.time || ""}`.trim();
      const prices = document.createElement("p");
      prices.textContent = `Entry ${trade.entry_price ?? "—"} → Exit ${trade.exit_price ?? "—"} · ${trade.r_multiple == null ? "—" : `${Number(trade.r_multiple).toFixed(2)}R`}`;
      const footer = document.createElement("div");
      footer.className = "calendar-list-card-footer";
      const cardPnl = document.createElement("strong");
      cardPnl.className = Number(trade.pnl) > 0 ? "positive" : Number(trade.pnl) < 0 ? "negative" : "";
      cardPnl.textContent = formatMoney(trade.pnl);
      const cardDelete = document.createElement("button");
      cardDelete.type = "button";
      cardDelete.className = "text-button";
      cardDelete.textContent = "Delete";
      cardDelete.addEventListener("click", () => void deleteTrade(trade));
      footer.append(cardPnl, cardDelete);
      card.append(heading, date, prices, footer);
      cards.appendChild(card);
    }
  }

  function renderStats() {
    const pnl = trades.map((trade) => Number(trade.pnl) || 0);
    const net = pnl.reduce((sum, value) => sum + value, 0);
    const wins = pnl.filter((value) => value > 0).length;
    const losingTrades = pnl.filter((value) => value < 0);
    const losses = losingTrades.length;
    const grossLoss = losingTrades.reduce((sum, value) => sum + value, 0);
    const rValues = trades.map((trade) => Number(trade.r_multiple)).filter(Number.isFinite);
    $("#net-pnl").textContent = formatMoney(net);
    $("#net-pnl").className = net < 0 ? "negative" : net > 0 ? "positive" : "";
    $("#win-rate").textContent = `${trades.length ? (wins / trades.length * 100).toFixed(1) : "0"}%`;
    $("#win-count").textContent = `${wins} wins · ${losses} losses · ${formatMoney(grossLoss)} lost`;
    $("#win-count").className = grossLoss < 0 ? "negative" : "";
    const expectancy = trades.length ? net / trades.length : 0;
    $("#expectancy").textContent = formatMoney(expectancy);
    $("#expectancy").className = expectancy < 0 ? "negative" : expectancy > 0 ? "positive" : "";
    $("#average-r").textContent = rValues.length ? `${(rValues.reduce((sum, value) => sum + value, 0) / rValues.length).toFixed(2)}R` : "—";
  }

  function renderInstrumentOptions() {
    const instruments = new Map(pairCatalog.map((item) => [item.Pair.toLocaleLowerCase(), item]));
    const addRecent = (instrument) => {
      const value = String(instrument || "").trim();
      const key = value.toLocaleLowerCase();
      if (value && !instruments.has(key)) {
        instruments.set(key, { Market: "Recent", Pair: value, Name: "" });
      }
    };
    for (const trade of trades) {
      addRecent(trade.instrument);
    }
    instrumentOptions = [...instruments.values()];
    if (!$("#instrument-options").hidden) renderInstrumentMenu();
  }

  async function loadInstrumentCatalog() {
    const response = await fetch("/all_pairs.json?v=pair-catalog-csv-v4");
    if (!response.ok) throw new Error(`Pair catalog request failed (${response.status}).`);
    const catalog = await response.json();
    if (!Array.isArray(catalog)) throw new Error("Pair catalog has an invalid format.");
    pairCatalog = catalog.filter((item) =>
      item
      && typeof item.Market === "string"
      && typeof item.Pair === "string"
      && typeof item.Name === "string"
      && item.Pair.trim(),
    );
    if (!pairCatalog.length) throw new Error("Pair catalog contains no usable instruments.");
    renderInstrumentOptions();
  }

  function closeInstrumentMenu() {
    const menu = $("#instrument-options");
    menu.hidden = true;
    $("#instrument-input").setAttribute("aria-expanded", "false");
    $("#instrument-toggle").setAttribute("aria-expanded", "false");
    highlightedInstrument = -1;
  }

  function chooseInstrument(value) {
    $("#instrument-input").value = value;
    closeInstrumentMenu();
    $("#instrument-input").focus();
    updateTradeFormValidity();
  }

  function renderInstrumentMenu() {
    const input = $("#instrument-input");
    const menu = $("#instrument-options");
    const query = input.value.trim().toLowerCase();
    const matchingOptions = instrumentOptions.filter((instrument) =>
      instrument.Pair.toLocaleLowerCase().includes(query)
      || instrument.Name.toLocaleLowerCase().includes(query));
    const exactMatch = instrumentOptions.some((instrument) =>
      instrument.Pair.toLocaleLowerCase() === query || instrument.Name.toLocaleLowerCase() === query);
    const options = matchingOptions;
    const customOption = query && !exactMatch
      ? { Market: "Custom", Pair: input.value.trim(), Name: "Use custom instrument" }
      : null;

    menu.replaceChildren();
    if (!options.length && !customOption) {
      const empty = document.createElement("div");
      empty.className = "instrument-empty";
      empty.textContent = "Type any pair or instrument";
      menu.appendChild(empty);
    } else {
      const groupedOptions = new Map();
      for (const instrument of options) {
        const group = groupedOptions.get(instrument.Market) || [];
        group.push(instrument);
        groupedOptions.set(instrument.Market, group);
      }
      let optionIndex = 0;
      groupedOptions.forEach((items, market) => {
        const heading = document.createElement("div");
        heading.className = "instrument-menu-heading";
        heading.textContent = market.toUpperCase();
        menu.appendChild(heading);
        items.forEach((instrument) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "instrument-option";
          option.id = `instrument-option-${optionIndex}`;
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(optionIndex === highlightedInstrument));
          if (market === "Custom") {
            option.classList.add("custom-instrument-option");
          }
          const icon = document.createElement("span");
          icon.className = "instrument-option-icon";
          icon.textContent = instrument.Pair.includes("/") ? "↗" : "◈";
          const name = document.createElement("span");
          name.className = "instrument-option-name instrument-option-pair";
          name.appendChild(document.createTextNode(instrument.Pair));
          if (instrument.Name) {
            const label = document.createElement("span");
            label.className = "instrument-option-label";
            label.textContent = instrument.Name;
            name.appendChild(label);
          }
          const hint = document.createElement("span");
          hint.className = "instrument-option-hint";
          hint.textContent = market === "Custom" ? "USE CUSTOM" : "SELECT";
          option.append(icon, name, hint);
          option.addEventListener("mousedown", (event) => event.preventDefault());
          option.addEventListener("click", () => chooseInstrument(instrument.Pair));
          menu.appendChild(option);
          optionIndex += 1;
        });
      });
      if (customOption) {
        const heading = document.createElement("div");
        heading.className = "instrument-menu-heading";
        heading.textContent = "CUSTOM";
        menu.appendChild(heading);
        const option = document.createElement("button");
        option.type = "button";
        option.className = "instrument-option custom-instrument-option";
        option.id = `instrument-option-${optionIndex}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-label", `Create custom pair ${customOption.Pair}`);
        option.setAttribute("aria-selected", String(optionIndex === highlightedInstrument));
        const icon = document.createElement("span");
        icon.className = "instrument-option-icon";
        icon.textContent = "◈";
        const name = document.createElement("span");
        name.className = "instrument-option-name instrument-option-pair";
        name.appendChild(document.createTextNode(customOption.Pair));
        const hint = document.createElement("span");
        hint.className = "instrument-option-hint";
        hint.textContent = "CREATE CUSTOM PAIR";
        option.append(icon, name, hint);
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("click", () => chooseInstrument(customOption.Pair));
        menu.appendChild(option);
      }
    }
    const summary = document.createElement("div");
    summary.className = "instrument-empty";
    summary.setAttribute("role", "status");
    const catalogMatchCount = pairCatalog.filter((instrument) =>
      instrument.Pair.toLocaleLowerCase().includes(query)
      || instrument.Name.toLocaleLowerCase().includes(query)).length;
    summary.textContent = query
      ? `${catalogMatchCount.toLocaleString()} matching pairs`
      : `All ${pairCatalog.length.toLocaleString()} pairs · scroll to browse`;
    menu.appendChild(summary);
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    $("#instrument-toggle").setAttribute("aria-expanded", "true");
  }

  function handleInstrumentKeydown(event) {
    if (event.key === "Escape") {
      closeInstrumentMenu();
      return;
    }
    if (event.key === "Enter" && !$("#instrument-options").hidden) {
      const selected = $("#instrument-options").querySelector(
        `[aria-selected="true"].instrument-option`
      );
      if (selected) {
        event.preventDefault();
        chooseInstrument(selected.querySelector(".instrument-option-pair").childNodes[0].textContent);
      } else {
        event.preventDefault();
        const query = $("#instrument-input").value.trim().toLocaleLowerCase();
        const exact = instrumentOptions.find((instrument) =>
          instrument.Pair.toLocaleLowerCase() === query || instrument.Name.toLocaleLowerCase() === query);
        if (exact) chooseInstrument(exact.Pair);
        else closeInstrumentMenu();
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if ($("#instrument-options").hidden) {
      renderInstrumentMenu();
      return;
    }
    const visibleOptions = $("#instrument-options").querySelectorAll(".instrument-option");
    if (!visibleOptions.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    highlightedInstrument = (highlightedInstrument + direction + visibleOptions.length) % visibleOptions.length;
    visibleOptions.forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === highlightedInstrument));
    });
    visibleOptions[highlightedInstrument].scrollIntoView({ block: "nearest" });
  }

  function updateCalculations() {
    const form = $("#trade-form");
    const entry = numeric(form, "entry_price");
    const exitPrice = numeric(form, "exit_price");
    const size = numeric(form, "size");
    const direction = new FormData(form).get("direction");
    if (
      entry != null
      && exitPrice != null
      && size != null
      && size > 0
      && Number.isFinite(entry)
      && Number.isFinite(exitPrice)
      && Number.isFinite(size)
      && !$("#pnl").dataset.edited
    ) {
      const sign = direction === "Short" ? -1 : 1;
      $("#pnl").value = ((exitPrice - entry) * size * sign).toFixed(2);
      $("#pnl").dataset.calculated = "true";
    } else if ($("#pnl").dataset.calculated && !$("#pnl").dataset.edited) {
      $("#pnl").value = "";
      $("#pnl").dataset.calculated = "";
    }
    const stop = numeric(form, "stop_loss");
    const pnl = numeric(form, "pnl");
    if (entry != null && stop != null && size != null && size > 0 && pnl != null && !$("#r-multiple").dataset.edited) {
      const risk = Math.abs(entry - stop) * size;
      $("#r-multiple").value = risk ? (pnl / risk).toFixed(2) : "";
    } else if (!$("#r-multiple").dataset.edited) {
      $("#r-multiple").value = "";
    }
    updateTradeFormValidity();
  }

  function updateTradeFormValidity() {
    const form = $("#trade-form");
    const pnl = $("#pnl");
    const hasRequiredValues = Boolean(
      $("#instrument-input").value.trim()
      && form.querySelector('[name="direction"]').value
      && $("#trade-date").value
      && $("#trade-time").value
      && pnl.value.trim()
      && Number.isFinite(Number(pnl.value)),
    );
    $("#save-trade").disabled = form.dataset.saving === "true" || !hasRequiredValues;
  }

  async function submitTrade(event) {
    event.preventDefault();
    const form = $("#trade-form");
    const error = $("#form-error");
    const button = $("#save-trade");
    error.textContent = "";
    updateTradeFormValidity();
    if (button.disabled) {
      error.textContent = "Pair, direction, date, time, and a valid P&L are required.";
      return;
    }
    form.dataset.saving = "true";
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const formData = new FormData(form);
      const trade = Object.fromEntries(formData.entries());
      const range = selectedCalendarRange();
      if (range && (trade.date < range.dateFrom || trade.date > range.dateTo)) {
        throw new Error(`Trade date must be between ${range.dateFrom} and ${range.dateTo}.`);
      }
      delete trade.screenshot;
      for (const key of ["entry_price", "exit_price", "stop_loss", "take_profit", "size", "pnl", "r_multiple"]) {
        trade[key] = trade[key] === "" ? null : Number(trade[key]);
      }
      trade.custom_fields = {};
      document.querySelectorAll("[data-custom-name]").forEach((input) => {
        trade.custom_fields[input.dataset.customName] = input.value;
      });
      const image = $("#screenshot").files[0];
      if (image) {
        if (image.size > 12 * 1024 * 1024) throw new Error("Screenshot must be smaller than 12 MB.");
        const data = await fileAsDataUrl(image);
        const uploaded = await api("/api/upload_image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: data }),
        });
        trade.image_file = uploaded.path;
      }
      const saved = await api("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      });
      trades.unshift(saved);
      form.reset();
      dateTimeDefaults();
      $("#pnl").dataset.edited = "";
      $("#pnl").dataset.calculated = "";
      $("#r-multiple").dataset.edited = "";
      renderInstrumentOptions();
      renderCustomInputs();
      renderTrades();
      showToast("Trade saved locally.");
    } catch (reason) {
      error.textContent = reason.message || String(reason);
    } finally {
      form.dataset.saving = "";
      updateTradeFormValidity();
      button.innerHTML = 'Save trade <span>↗</span>';
    }
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected screenshot."));
      reader.readAsDataURL(file);
    });
  }

  async function deleteTrade(trade) {
    if (!window.confirm(`Delete the ${trade.instrument || "selected"} trade? This cannot be undone.`)) return;
    try {
      await api(`/api/trades/${encodeURIComponent(trade.id)}`, { method: "DELETE" });
      trades = trades.filter((item) => item.id !== trade.id);
      if (calendarSelectedDay && !trades.some((item) => String(item.date || "").slice(0, 10) === calendarSelectedDay)) calendarSelectedDay = null;
      renderInstrumentOptions();
      renderTrades();
      showToast("Trade deleted.");
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function openImage(src) {
    $("#image-large").src = src;
    $("#image-dialog").showModal();
  }

  function renderCustomFieldSettings() {
    const container = $("#custom-field-list");
    container.replaceChildren();
    for (const field of config.custom_fields || []) addCustomFieldRow(field);
  }

  function addCustomFieldRow(field = { name: "", type: "text" }) {
    const row = document.createElement("div");
    row.className = "custom-field-row";
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 40;
    name.placeholder = "Field name";
    name.value = field.name;
    name.className = "custom-name";
    const type = document.createElement("select");
    type.className = "custom-type";
    for (const option of ["text", "number", "date"]) {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option[0].toUpperCase() + option.slice(1);
      item.selected = option === field.type;
      type.appendChild(item);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove custom field");
    remove.addEventListener("click", () => row.remove());
    row.append(name, type, remove);
    $("#custom-field-list").appendChild(row);
  }

  function populateSettings() {
    $("#auto-backup").checked = Boolean(config.auto_backup);
    $("#backup-interval").value = config.backup_interval_minutes || 0;
    $("#backup-directory").value = config.backup_directory || "";
    $("#google-enabled").checked = Boolean(config.google_sync?.enabled);
    $("#google-folder").value = config.google_sync?.folder_name || "TradingJournal";
    renderCustomFieldSettings();
  }

  async function saveSettings(event) {
    event.preventDefault();
    $("#settings-error").textContent = "";
    const customFields = Array.from(document.querySelectorAll(".custom-field-row")).map((row) => ({
      name: row.querySelector(".custom-name").value.trim(),
      type: row.querySelector(".custom-type").value,
    }));
    try {
      config = await api("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_backup: $("#auto-backup").checked,
          backup_interval_minutes: Number($("#backup-interval").value || 0),
          backup_directory: $("#backup-directory").value,
          custom_fields: customFields,
          google_sync: {
            enabled: $("#google-enabled").checked,
            folder_name: $("#google-folder").value.trim() || "TradingJournal",
          },
        }),
      });
      renderCustomInputs();
      $("#settings-dialog").close();
      showToast("Settings saved.");
    } catch (error) {
      $("#settings-error").textContent = error.message;
    }
  }

  async function chooseBackupFolder() {
    $("#settings-error").textContent = "";
    try {
      const result = await api("/api/backup-folder", { method: "POST" });
      if (result.path) $("#backup-directory").value = result.path;
    } catch (error) {
      $("#settings-error").textContent = error.message;
    }
  }

  async function backupNow() {
    const button = $("#backup-now");
    button.disabled = true;
    button.textContent = "Preparing backup…";
    try {
      const result = await api("/api/backup", { method: "POST" });
      window.location.href = `/api/download?path=${encodeURIComponent(result.path)}&profile_id=${encodeURIComponent(selectedProfileId)}`;
      showToast("Local backup created.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "↓ Backup now";
    }
  }

  async function restoreLocal(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!window.confirm("Restore this backup? A safety backup will be created before your local journal is replaced.")) {
      event.target.value = "";
      return;
    }
    const data = new FormData();
    data.append("file", file);
    try {
      const restored = await api("/api/restore", { method: "POST", body: data });
      trades = restored.trades;
      config = restored.config;
      renderInstrumentOptions();
      populateSettings();
      renderCustomInputs();
      renderTrades();
      showToast("Local backup restored.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      event.target.value = "";
    }
  }

  async function refreshGoogleStatus() {
    try {
      google = await api("/api/gdrive/status");
      $("#google-panel").hidden = !google.available;
      const status = $("#google-status");
      status.textContent = !google.available
        ? "Google Drive libraries are not installed."
        : !google.configured
          ? "Add credentials.json beside the app to enable Google sign-in."
          : google.connected
            ? `Connected${google.email ? ` as ${google.email}` : ""}.`
            : "Credentials are ready. Sign in to connect your account.";
      $("#google-signin").disabled = !google.configured;
      $("#google-sync").disabled = !google.connected;
      $("#google-restore").disabled = !google.connected;
      $("#google-disconnect").disabled = !google.connected;
    } catch (error) {
      $("#google-status").textContent = error.message;
      $("#google-panel").hidden = false;
    }
  }

  async function googleAction(endpoint, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try {
      const result = await api(endpoint, { method: "POST" });
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        showToast("Complete Google sign-in in your browser.");
        let attempts = 0;
        const poll = window.setInterval(async () => {
          attempts += 1;
          await refreshGoogleStatus();
          if (google.connected || attempts >= 60) window.clearInterval(poll);
          if (google.connected) showToast("Google Drive connected.");
        }, 2000);
      } else if (result.trades) {
        trades = result.trades;
        config = result.config;
        populateSettings();
        renderCustomInputs();
        renderTrades();
        showToast("Google Drive backup restored.");
      } else {
        showToast(result.message || "Google Drive updated.");
      }
      await refreshGoogleStatus();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function startGoogleSignIn() {
    const authWindow = window.open("about:blank", "_blank");
    try {
      const result = await api("/api/gdrive/auth_url", { method: "POST" });
      if (!result.url) throw new Error(result.error || "Could not start Google sign-in.");
      if (!authWindow) {
        throw new Error("Allow pop-ups for this local app, then try Google sign-in again.");
      }
      authWindow.location.href = result.url;
      showToast("Complete Google sign-in in your browser.");
      let attempts = 0;
      const poll = window.setInterval(async () => {
        attempts += 1;
        await refreshGoogleStatus();
        if (google.connected || attempts >= 60) window.clearInterval(poll);
        if (google.connected) showToast("Google Drive connected.");
      }, 2000);
    } catch (error) {
      if (authWindow) authWindow.close();
      showToast(error.message, true);
    }
  }

  async function init() {
    dateTimeDefaults();
    try {
      await loadInstrumentCatalog();
    } catch (error) {
      showToast(`Pair catalog could not be loaded: ${error.message}`, true);
    }
    for (const form of [$("#profile-gate-form"), $("#backtesting-profile-form")]) {
      form.querySelector("[data-profile-mode]").addEventListener("change", () => {
        profileDirty = form.id === "backtesting-profile-form" ? true : profileDirty;
        $(form.id === "backtesting-profile-form" ? "#profile-error" : "#profile-gate-error").textContent = "";
        for (const field of form.querySelectorAll("[data-profile-field]")) {
          delete field.dataset.touched;
          field.closest(".field").querySelectorAll(".field-error").forEach((error) => {
            error.textContent = "";
            error.hidden = true;
          });
        }
        setProfileFormMode(form);
      });
      form.addEventListener("input", (event) => {
        if (!event.target.matches("[data-profile-field]")) return;
        if (form.id === "backtesting-profile-form") profileDirty = true;
        $(form.id === "backtesting-profile-form" ? "#profile-error" : "#profile-gate-error").textContent = "";
        validateProfileForm(form);
      });
      form.addEventListener("focusout", (event) => {
        if (!event.target.matches("[data-profile-field]")) return;
        event.target.dataset.touched = "true";
        validateProfileForm(form);
      });
      setProfileFormMode(form);
    }
    $("#profile-gate-create").addEventListener("click", startProfileGateCreation);
    $("#profile-gate-cancel").addEventListener("click", cancelProfileGateCreation);
    $("#profile-gate-form").addEventListener("submit", createProfileFromGate);
    $("#trade-form").addEventListener("submit", submitTrade);
    $("#trade-date-trigger").addEventListener("click", () => toggleTradeDatePicker());
    $("#trade-date-close").addEventListener("click", () => toggleTradeDatePicker(false));
    $("#trade-date-backdrop").addEventListener("click", () => toggleTradeDatePicker(false));
    $("#trade-date-month").addEventListener("change", (event) => {
      tradeDatePickerMonth = new Date(
        tradeDatePickerMonth.getFullYear(),
        Number(event.target.value),
        1,
      );
      renderTradeDatePicker();
    });
    $("#trade-date-year").addEventListener("change", (event) => {
      const year = Number(event.target.value);
      if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        renderTradeDatePicker();
        return;
      }
      tradeDatePickerMonth = new Date(year, tradeDatePickerMonth.getMonth(), 1);
      renderTradeDatePicker();
    });
    $("#trade-date-previous").addEventListener("click", () => {
      tradeDatePickerMonth = dateFns.addMonths(tradeDatePickerMonth, -1);
      renderTradeDatePicker();
    });
    $("#trade-date-next").addEventListener("click", () => {
      tradeDatePickerMonth = dateFns.addMonths(tradeDatePickerMonth, 1);
      renderTradeDatePicker();
    });
    $("#trade-date-today").addEventListener("click", () => {
      const today = localDateKey(new Date());
      const range = selectedCalendarRange();
      const date = range
        ? today < range.dateFrom ? range.dateFrom : today > range.dateTo ? range.dateTo : today
        : today;
      setTradeDate(date);
    });
    $("#trade-date-grid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-trade-date]");
      if (!button || button.disabled) return;
      setTradeDate(button.dataset.tradeDate);
      toggleTradeDatePicker(false);
    });
    document.addEventListener("mousedown", (event) => {
      if (!$("#trade-date-picker").contains(event.target)) toggleTradeDatePicker(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#trade-date-popover").hidden) {
        toggleTradeDatePicker(false);
        $("#trade-date-trigger").focus();
      }
    });
    $("#backtesting-profile-form").addEventListener("submit", saveBacktestingProfile);
    $("#cancel-profile-edit").addEventListener("click", cancelBacktestingProfileEdit);
    $("#backtesting-profile-select").addEventListener("change", changeActiveBacktestingProfile);
    $("#switch-profile").addEventListener("click", () => {
      if (confirmDiscardProfileEdits()) showProfileGate();
    });
    $("#new-profile").addEventListener("click", startNewBacktestingProfile);
    $("#edit-profile").addEventListener("click", editActiveBacktestingProfile);
    $("#delete-profile").addEventListener("click", deleteBacktestingProfile);
    $("#instrument-input").addEventListener("focus", renderInstrumentMenu);
    $("#instrument-input").addEventListener("input", () => {
      highlightedInstrument = -1;
      renderInstrumentMenu();
    });
    $("#instrument-input").addEventListener("keydown", handleInstrumentKeydown);
    $("#instrument-toggle").addEventListener("mousedown", (event) => event.preventDefault());
    $("#instrument-toggle").addEventListener("click", () => {
      if ($("#instrument-options").hidden) {
        $("#instrument-input").focus();
        renderInstrumentMenu();
      } else {
        const input = $("#instrument-input");
        if (input.value.trim()) chooseInstrument(input.value.trim());
        else closeInstrumentMenu();
      }
    });
    document.addEventListener("mousedown", (event) => {
      if (!$("#instrument-picker").contains(event.target)) closeInstrumentMenu();
    });
    $("#calendar-previous").addEventListener("click", () => {
      calendarMonth = dateFns.addMonths(calendarMonth, -1);
      calendarSelectedDay = null;
      renderTrades();
    });
    $("#calendar-next").addEventListener("click", () => {
      calendarMonth = dateFns.addMonths(calendarMonth, 1);
      calendarSelectedDay = null;
      renderTrades();
    });
    $("#calendar-month-select").addEventListener("change", (event) => {
      calendarMonth = new Date(calendarMonth.getFullYear(), Number(event.target.value), 1);
      calendarSelectedDay = null;
      renderTrades();
    });
    $("#calendar-year-select").addEventListener("change", (event) => {
      const year = Number(event.target.value);
      if (!Number.isInteger(year) || year < 1900 || year > 9999) return;
      calendarMonth = new Date(year, calendarMonth.getMonth(), 1);
      calendarSelectedDay = null;
      renderTrades();
    });
    $("#calendar-today").addEventListener("click", () => {
      const now = new Date();
      calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      calendarSelectedDay = null;
      renderTrades();
    });
    $("#calendar-clear-day").addEventListener("click", () => {
      calendarSelectedDay = null;
      renderTradeCalendar();
    });
    $("#trade-calendar-grid").addEventListener("click", (event) => {
      const day = event.target.closest("[data-calendar-date]");
      if (day && !day.disabled) {
        calendarSelectedDay = calendarSelectedDay === day.dataset.calendarDate ? null : day.dataset.calendarDate;
        renderTradeCalendar();
      }
    });
    ["entry-price", "exit-price", "stop-loss", "position-size"].forEach((id) =>
      $(`#${id}`).addEventListener("input", updateCalculations));
    $("#trade-form").querySelector('[name="direction"]').addEventListener("change", updateCalculations);
    $("#pnl").addEventListener("input", () => {
      $("#pnl").dataset.edited = "true";
      $("#pnl").dataset.calculated = "";
      updateCalculations();
    });
    $("#pnl").addEventListener("change", () => {
      if ($("#pnl").value) return;
      $("#pnl").dataset.edited = "";
      updateCalculations();
    });
    $("#r-multiple").addEventListener("input", () => {
      $("#r-multiple").dataset.edited = $("#r-multiple").value ? "true" : "";
    });
    $("#instrument-input").addEventListener("input", updateTradeFormValidity);
    $("#trade-time").addEventListener("input", updateTradeFormValidity);
    $("#settings-open").addEventListener("click", () => {
      populateSettings();
      $("#settings-dialog").showModal();
    });
    document.querySelectorAll("[data-close]").forEach((button) =>
      button.addEventListener("click", () => button.closest("dialog").close()));
    $("#add-custom-field").addEventListener("click", () => addCustomFieldRow());
    $("#settings-form").addEventListener("submit", saveSettings);
    $("#choose-backup-folder").addEventListener("click", chooseBackupFolder);
    $("#backup-now").addEventListener("click", backupNow);
    $("#restore-file").addEventListener("change", restoreLocal);
    $("#google-signin").addEventListener("click", startGoogleSignIn);
    $("#google-sync").addEventListener("click", () => googleAction("/api/gdrive/sync"));
    $("#google-restore").addEventListener("click", () => googleAction(
      "/api/gdrive/restore", "Restore the latest Drive backup? A safety backup of current local data will be created first."));
    $("#google-disconnect").addEventListener("click", () => googleAction("/api/gdrive/disconnect"));
    try {
      const [mode, profiles] = await Promise.all([
        api("/api/mode"), api("/api/backtesting-profiles"),
      ]);
      backtestingProfiles = profiles;
      $("#mode-label").textContent = mode.mode === "desktop" ? "Desktop · local data" : "Web · local data";
      showBacktestingProfile(selectedBacktestingProfile());
      showProfileGate();
      renderTrades();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

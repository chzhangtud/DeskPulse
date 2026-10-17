(function (root) {
  "use strict";
  const groups = {
    chips: [
      ["NVDA", "NVIDIA", "英伟达"], ["AMD", "AMD", "超威半导体"],
      ["ARM", "Arm", "安谋"], ["QCOM", "Qualcomm", "高通"],
      ["TSM", "TSMC", "台积电"], ["AVGO", "Broadcom", "博通"],
      ["INTC", "Intel", "英特尔"], ["MU", "Micron", "美光"],
      ["ASML", "ASML", "阿斯麦"], ["AMAT", "Applied Materials", "应用材料"],
    ],
    tech: [
      ["AAPL", "Apple", "苹果"], ["MSFT", "Microsoft", "微软"],
      ["GOOGL", "Alphabet", "谷歌母公司"], ["AMZN", "Amazon", "亚马逊"],
      ["META", "Meta", "Meta"], ["ORCL", "Oracle", "甲骨文"],
    ],
    other: [
      ["TSLA", "Tesla", "特斯拉"], ["NFLX", "Netflix", "奈飞"],
      ["COST", "Costco", "开市客"], ["JPM", "JPMorgan Chase", "摩根大通"],
      ["XOM", "ExxonMobil", "埃克森美孚"], ["KO", "Coca-Cola", "可口可乐"],
    ],
  };
  const capacities = { "5d": 8, "10d": 13, "1m": 26, "3m": 70, "6m": 136 };
  function seriesFor(data, range) {
    const bars = ((data && data.series) || []).filter(
      (bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && Number.isFinite(bar.close) && bar.close > 0,
    ).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!bars.length) return [];
    if (range === "5d" || range === "10d") return bars.slice(-parseInt(range, 10));
    const end = new Date(bars[bars.length - 1].date + "T00:00:00Z");
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() - parseInt(range, 10));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
    return bars.filter((bar) => bar.date >= end.toISOString().slice(0, 10));
  }
  function summary(data, range) {
    const bars = ((data && data.series) || []).filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isFinite(b.close) && b.close > 0)
      .slice().sort((a, b) => a.date.localeCompare(b.date));
    if (bars.length < 2) return null;
    const visible = range ? seriesFor({ series: bars }, range) : [],
      start = visible.length ? bars.findIndex((bar) => bar.date === visible[0].date) : bars.length - 1;
    const last = bars[bars.length - 1], previous = bars[Math.max(0, start - 1)];
    return { date: last.date, close: last.close, change: last.close - previous.close,
      percent: ((last.close - previous.close) / previous.close) * 100, baseline: previous.date };
  }
  function create(options) {
    const $ = (id) => document.getElementById(id),
      cache = options.cache || {}, errors = new Map(), busy = new Set(), rows = new Map();
    let nextCheck = 0, requested = "", lastKey = "";
    const settings = options.settings, tr = options.translate;
    const measure = document.createElement("canvas").getContext("2d");
    function fitSelect(select) {
      const css = getComputedStyle(select);
      measure.font = css.fontSize + " " + css.fontFamily;
      select.style.width = Math.max(48, Math.ceil(measure.measureText(select.selectedOptions[0].textContent).width) + 26) + "px";
    }
    $("stockCategory").onchange = () => {
      settings().stockCategory = $("stockCategory").value;
      options.save(); requested = ""; $("stocks").scrollTop = 0; render(); tick(true);
    };
    $("stockRange").onchange = () => {
      settings().stockRange = $("stockRange").value;
      options.save(); requested = ""; render(); tick(true);
    };
    function render() {
      const s = settings(), entries = groups[s.stockCategory], range = s.stockRange;
      $("stockRange").value = range;
      $("stockCategory").value = s.stockCategory;
      fitSelect($("stockCategory")); fitSelect($("stockRange"));
      const key = JSON.stringify([s.language, s.stockCategory, range,
        entries.map(([symbol]) => [cache[symbol], errors.get(symbol), busy.has(symbol)])]);
      if (lastKey === key) return;
      lastKey = key;
      const target = $("stocks"), scroll = target.scrollTop;
      target.replaceChildren();
      const sources = new Set(), dates = [], fromDates = [];
      let failed = 0, loading = 0, incomplete = 0;
      for (const [symbol, en, zh] of entries) {
        const data = cache[symbol], value = summary(data, range), series = seriesFor(data, range), name = s.language === "zh" ? zh : en;
        let row = rows.get(symbol);
        if (!row) {
          row = document.createElement("div"); row.className = "stock-row";
          const label = document.createElement("div"), ticker = document.createElement("b"), company = document.createElement("small");
          label.append(ticker, company);
          const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          chart.setAttribute("viewBox", "0 0 48 24"); chart.setAttribute("aria-hidden", "true");
          chart.setAttribute("preserveAspectRatio", "none");
          const line = document.createElementNS(chart.namespaceURI, "polyline"); chart.append(line);
          const quote = document.createElement("div"), price = document.createElement("b"), change = document.createElement("small");
          quote.className = "stock-quote"; quote.append(price, change); row.append(label, chart, quote);
          rows.set(symbol, row);
        }
        row.firstElementChild.firstElementChild.textContent = symbol;
        DeskPulseOverflow.set(row.firstElementChild.lastElementChild, name);
        const quote = row.lastElementChild, change = quote.lastElementChild;
        row.classList.toggle("stock-cached", errors.has(symbol));
        row.title = name + (value ? " · " + value.date + " · " + data.source : "");
        quote.firstElementChild.textContent = value ? "$" + value.close.toFixed(2) : "—";
        change.className = value ? value.change > 0 ? "stock-up" : value.change < 0 ? "stock-down" : "" : "";
        change.textContent = data && data.capacity < capacities[range] ? tr(busy.has(symbol) ? "Loading…" : "Short history")
          : value ? (value.change > 0 ? "↑ +" : value.change < 0 ? "↓ " : "") + value.percent.toFixed(2) + "%"
          : tr(busy.has(symbol) ? "Loading…" : "Unavailable");
        const chart = row.children[1], line = chart.firstElementChild;
        const prices = series.map((b) => b.close), min = Math.min(...prices), max = Math.max(...prices), span = max - min || 1;
        line.setAttribute("points", prices.map((price, index) =>
          (prices.length === 1 ? 24 : index * 46 / (prices.length - 1) + 1) + "," + (22 - (price - min) * 20 / span)).join(" "));
        chart.className.baseVal = value ? value.change > 0 ? "stock-up" : value.change < 0 ? "stock-down" : "" : "";
        if (data) { sources.add(data.source); if (value) dates.push(value.date); if (series.length) fromDates.push(series[0].date); }
        if (errors.has(symbol)) failed++;
        if (busy.has(symbol)) loading++;
        if (data && data.capacity < capacities[range]) incomplete++;
        target.append(row);
      }
      target.scrollTop = scroll;
      const datesText = dates.length ? (new Set(dates).size === 1 ? dates[0] : tr("Dates vary")) : "—";
      $("stockPeriod").textContent = tr("Period change · USD") + " · " + datesText;
      $("stockStatus").textContent = loading ? tr("Loading daily history…") : failed ? tr("Some data unavailable · cached closes retained")
        : incomplete ? tr("Shorter cached history") : Array.from(sources).map(tr).join(" / ") || tr("Awaiting daily data");
      $("stockStatus").title = fromDates.length ? fromDates.sort()[0] + " → " + dates.sort().slice(-1)[0] + " · " + tr("Change versus the close before the selected period") : "";
      options.refreshScrollbar();
    }
    function tick(visible) {
      if (!visible) return;
      const s = settings(), key = s.stockCategory + ":" + s.stockRange;
      if (key === requested && Date.now() < nextCheck) return;
      requested = key; nextCheck = Date.now() + 3600000;
      const symbols = groups[s.stockCategory].map(([symbol]) => symbol);
      symbols.forEach((symbol) => busy.add(symbol));
      if (options.request) options.request(JSON.stringify(symbols), s.stockRange);
      else symbols.forEach((symbol) => busy.delete(symbol));
      render();
    }
    return {
      render, tick,
      update(data) {
        if (!Object.values(groups).some((group) => group.some(([symbol]) => symbol === data.symbol))) return;
        cache[data.symbol] = data; busy.delete(data.symbol); errors.delete(data.symbol); render();
      },
      error(data) { if (data.symbol) { busy.delete(data.symbol); errors.set(data.symbol, data.message); render(); } },
    };
  }
  const api = { groups, capacities, seriesFor, summary, create };
  if (typeof module !== "undefined") module.exports = api;
  root.DeskPulseStocks = api;
})(typeof window !== "undefined" ? window : globalThis);

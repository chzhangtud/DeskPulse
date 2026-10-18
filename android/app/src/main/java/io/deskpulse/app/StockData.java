package io.deskpulse.app;

import android.content.SharedPreferences;
import org.json.*;
import javax.net.ssl.HttpsURLConnection;
import java.net.*;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BiConsumer;

/** Bounded, direct HTTPS daily bars; independent of desktop telemetry and public RSS. */
final class StockData {
    static final Set<String> SYMBOLS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "ARM", "NVDA", "TSM", "AVGO", "AMD", "QCOM", "INTC", "MU", "ASML", "AMAT",
        "AAPL", "MSFT", "GOOGL", "AMZN", "META", "ORCL", "TSLA", "NFLX", "COST", "JPM", "XOM", "KO")));
    static final Set<String> NYSE = new HashSet<>(Arrays.asList("TSM", "ORCL", "JPM", "XOM", "KO"));
    final SharedPreferences prefs;
    final BiConsumer<String, Object> emit;
    final ExecutorService executor = Executors.newFixedThreadPool(2);
    final Set<String> pending = ConcurrentHashMap.newKeySet();
    final Map<String, Long> retryAfter = new ConcurrentHashMap<>();
    final Object cacheLock = new Object();

    StockData(SharedPreferences prefs, BiConsumer<String, Object> emit) { this.prefs = prefs; this.emit = emit; }
    void close() { executor.shutdownNow(); }
    JSONObject cache() throws JSONException {
        JSONObject result = new JSONObject();
        for (String symbol : SYMBOLS) {
            String stored = prefs.getString("stock." + symbol, "");
            if (!stored.isEmpty()) try { result.put(symbol, new JSONObject(stored)); } catch (JSONException ignored) { }
        }
        return result;
    }
    static int capacity(String range) {
        switch (range) {
            case "5d": return 8;
            case "10d": return 13;
            case "1m": return 26;
            case "3m": return 70;
            case "6m": return 136;
            default: throw new IllegalArgumentException("Invalid daily history range");
        }
    }
    static LocalDate completedThrough() {
        ZonedDateTime now = ZonedDateTime.now(ZoneId.of("America/New_York"));
        // Conservatively wait until 16:30 ET, excluding intraday and after-hours quotes.
        LocalDate date = now.toLocalDate();
        if (now.toLocalTime().isBefore(LocalTime.of(16, 30))) date = date.minusDays(1);
        while (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) date = date.minusDays(1);
        return date;
    }
    void refresh(String requested, String range) {
        try {
            int count = capacity(range);
            JSONArray symbols = new JSONArray(requested);
            if (symbols.length() > 10) throw new JSONException("Too many symbols");
            for (int i = 0; i < symbols.length(); i++) {
                String symbol = symbols.getString(i);
                if (!SYMBOLS.contains(symbol)) throw new JSONException("Unsupported symbol");
                String key = symbol + ":" + count;
                if (pending.add(key)) executor.execute(() -> {
                    try { fetch(symbol, count); } finally { pending.remove(key); }
                });
            }
        } catch (Exception e) { emit.accept("stockError", new JSONObject()); }
    }
    void fetch(String symbol, int count) {
        try {
            LocalDate through = completedThrough();
            JSONObject cached = new JSONObject(prefs.getString("stock." + symbol, "{}"));
            if (through.toString().equals(cached.optString("checkedThrough")) && cached.optInt("capacity") >= count) {
                emit.accept("stock", cached); return;
            }
            if (System.currentTimeMillis() < retryAfter.getOrDefault(symbol, 0L)) {
                throw new IOException("Daily data unavailable. Cached closes retained.");
            }
            JSONArray bars;
            String source;
            try { bars = eastmoney(symbol, count, through); source = "Eastmoney"; }
            catch (Exception primary) { bars = tencent(symbol, count, through); source = "Tencent Finance"; }
            JSONObject result = new JSONObject().put("symbol", symbol).put("currency", "USD").put("source", source)
                .put("series", bars).put("capacity", count).put("checkedThrough", through.toString()).put("fetchedAt", System.currentTimeMillis());
            synchronized (cacheLock) {
                JSONObject previous = new JSONObject(prefs.getString("stock." + symbol, "{}"));
                if (through.toString().equals(previous.optString("checkedThrough")) && previous.optInt("capacity") > count) result = previous;
                else prefs.edit().putString("stock." + symbol, result.toString()).apply();
            }
            retryAfter.remove(symbol);
            emit.accept("stock", result);
        } catch (Exception e) {
            retryAfter.put(symbol, System.currentTimeMillis() + 3600000);
            try { emit.accept("stockError", new JSONObject().put("symbol", symbol).put("message", "Daily data unavailable. Cached closes retained.")); } catch (JSONException ignored) { }
        }
    }
    static String get(String url) throws Exception {
        // Public market data goes straight to its provider; no proxy, API key or collector hop.
        HttpsURLConnection connection = (HttpsURLConnection)new URL(url).openConnection(Proxy.NO_PROXY);
        connection.setConnectTimeout(8000); connection.setReadTimeout(8000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("User-Agent", "DeskPulse/0.2.0 (personal daily stock display)");
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Stock source HTTP " + connection.getResponseCode());
            return MainActivity.read(connection.getInputStream(), 500000);
        } finally { connection.disconnect(); }
    }
    static JSONArray eastmoney(String symbol, int count, LocalDate through) throws Exception {
        String market = NYSE.contains(symbol) ? "106" : "105";
        String url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + market + "." + symbol
            + "&klt=101&fqt=0&lmt=" + count + "&end=" + through.toString().replace("-", "")
            + "&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56";
        JSONArray input = new JSONObject(get(url)).getJSONObject("data").getJSONArray("klines");
        JSONArray bars = new JSONArray();
        for (int i=0; i<input.length(); i++) {
            String[] values = input.getString(i).split(",");
            if (values.length >= 3) append(bars, values[0], values[2], through);
        }
        if (bars.length() < 2) throw new IOException("No completed daily closes");
        return bars;
    }
    static JSONArray tencent(String symbol, int count, LocalDate through) throws Exception {
        String code = "us" + symbol + (NYSE.contains(symbol) ? ".N" : ".OQ");
        JSONObject data = new JSONObject(get("https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=" + code + ",day,,," + count + ",qfq"))
            .getJSONObject("data").getJSONObject(code);
        // Prefer unadjusted closes consistently with Eastmoney fqt=0; never mix adjustment conventions.
        JSONArray input = data.optJSONArray("day");
        if (input == null) throw new IOException("Unadjusted daily closes unavailable");
        JSONArray bars = new JSONArray();
        for (int i=0; i<input.length(); i++) {
            JSONArray values = input.getJSONArray(i);
            if (values.length() >= 3) append(bars, values.getString(0), values.getString(2), through);
        }
        if (bars.length() < 2) throw new IOException("No completed daily closes");
        return bars;
    }
    static void append(JSONArray bars, String date, String value, LocalDate through) throws Exception {
        double close = Double.parseDouble(value);
        LocalDate day = LocalDate.parse(date);
        if (!day.isAfter(through) && Double.isFinite(close) && close > 0)
            bars.put(new JSONObject().put("date", date).put("close", close));
    }
}

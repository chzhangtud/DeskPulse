package io.deskpulse.app;

import android.app.Activity;
import android.content.*;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.*;
import android.os.*;
import android.provider.DocumentsContract;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import org.json.*;
import org.xmlpull.v1.XmlPullParser;
import android.util.Xml;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    WebView web;
    SharedPreferences prefs;
    StockData stocks;
    final ExecutorService io = Executors.newFixedThreadPool(3);
    final ExecutorService infoIo = Executors.newFixedThreadPool(2);
    final Handler handler = new Handler(Looper.getMainLooper());
    final List<Uri> wallpapers = new ArrayList<>();
    int wallpaperIndex = -1;
    volatile boolean destroyed;
    volatile String credential = "";
    static final String ORIGIN = "https://app.deskpulse.local/";

    @Override protected void attachBaseContext(Context base) {
        String language = "en";
        try { language = object(base.getSharedPreferences("deskpulse", MODE_PRIVATE).getString("settings", "{}")).optString("language", "en"); } catch (Exception ignored) { }
        Locale locale = "zh".equals(language) ? Locale.SIMPLIFIED_CHINESE : Locale.US;
        Locale.setDefault(locale);
        Configuration configuration = new Configuration(base.getResources().getConfiguration());
        configuration.setLocales(new LocaleList(locale));
        super.attachBaseContext(base.createConfigurationContext(configuration));
    }

    @android.annotation.SuppressLint("SetJavaScriptEnabled") // Only bundled assets can load in this WebView; external requests are blocked.
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("deskpulse", MODE_PRIVATE);
        stocks = new StockData(prefs, this::emit);
        try { credential = decrypt(prefs.getString("credential", "")); } catch (Exception ignored) { }
        String incoming = getIntent().getStringExtra("setup");
        if (incoming != null) prefs.edit().putString("incoming", incoming).apply();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        WindowManager.LayoutParams windowParams = getWindow().getAttributes();
        windowParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(windowParams);
        immersive();
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) handler.postDelayed(() -> { if (!destroyed && hasWindowFocus()) immersive(); }, 2500);
        });
        web = new WebView(this);
        web.setBackgroundColor(0xff071419);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !req.getUrl().toString().startsWith(ORIGIN);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if (!req.getUrl().toString().startsWith(ORIGIN)) return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                String path = req.getUrl().getPath();
                try {
                    if ("/wallpaper".equals(path)) return new WebResourceResponse("image/jpeg", null, openFileInput("wallpaper.jpg"));
                    if (path == null || path.contains("..")) throw new IOException();
                    String asset = path.equals("/") ? "index.html" : path.substring(1);
                    String mime = asset.endsWith(".css") ? "text/css" : asset.endsWith(".js") ? "application/javascript" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open(asset));
                } catch (IOException e) { return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0])); }
            }
        });
        setContentView(web);
        web.loadUrl(ORIGIN);
        io.execute(() -> scanFolder(false));
    }

    void immersive() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION); }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) immersive(); }
    @Override protected void onResume() { super.onResume(); immersive(); if (web != null) { web.onResume(); web.evaluateJavascript("window.onResume&&window.onResume()", null); } }
    @Override protected void onPause() { super.onPause(); if (web != null) { web.evaluateJavascript("window.onPause&&window.onPause()", null); web.onPause(); } }
    @Override protected void onDestroy() { destroyed = true; io.shutdownNow(); infoIo.shutdownNow(); stocks.close(); web.removeJavascriptInterface("Native"); web.destroy(); super.onDestroy(); }
    @Override public void onBackPressed() { web.evaluateJavascript("window.closeSettings&&window.closeSettings()", null); }

    void emit(String event, Object value) {
        if (destroyed) return;
        handler.post(() -> { if (!destroyed) web.evaluateJavascript("window.nativeEvent(" + JSONObject.quote(event) + "," + (value instanceof JSONObject || value instanceof JSONArray ? value.toString() : JSONObject.quote(String.valueOf(value))) + ")", null); });
    }
    static JSONObject object(String text) throws JSONException { return new JSONObject(text); }
    static String read(InputStream input, int limit) throws IOException {
        try (input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int n;
            while ((n = input.read(buffer)) != -1) { if (bytes.size() + n > limit) throw new IOException("Response too large"); bytes.write(buffer, 0, n); }
            return bytes.toString("UTF-8");
        }
    }

    JSONObject config() throws JSONException { return object(prefs.getString("config", "{}")); }
    static String fingerprint(X509Certificate cert) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
        StringBuilder result = new StringBuilder(); for (byte b : hash) result.append(String.format(Locale.US, "%02X", b)); return result.toString();
    }
    @android.annotation.SuppressLint("CustomX509TrustManager") // Explicit enrollment pins the complete certificate; a mismatch fails before credentials are sent.
    String request(JSONObject config, String path, String body, String token) throws Exception {
        String host = config.getString("host");
        InetAddress address = InetAddress.getByName(host);
        if (!(address.isSiteLocalAddress() || address.isLoopbackAddress()) || !(address instanceof Inet4Address)) throw new IOException("Host must resolve to a private LAN IPv4 address");
        String pin = config.getString("fingerprint");
        if (!pin.matches("(?i)[0-9a-f]{64}")) throw new IOException("Invalid certificate fingerprint");
        TrustManager[] trust = { new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] chain, String auth) throws java.security.cert.CertificateException { throw new java.security.cert.CertificateException("Client certificate not supported"); }
            public void checkServerTrusted(X509Certificate[] chain, String auth) throws java.security.cert.CertificateException {
                try { chain[0].checkValidity(); if (!fingerprint(chain[0]).equalsIgnoreCase(pin)) throw new Exception(); }
                catch (Exception e) { throw new java.security.cert.CertificateException("Collector certificate changed. Import a new setup code.", e); }
            }
        }};
        SSLContext ssl = SSLContext.getInstance("TLS"); ssl.init(null, trust, new SecureRandom());
        HttpsURLConnection conn = (HttpsURLConnection) new URL("https://" + address.getHostAddress() + ":" + config.getInt("port") + path).openConnection(java.net.Proxy.NO_PROXY);
        conn.setSSLSocketFactory(ssl.getSocketFactory());
        // Identity is the exact, explicitly imported certificate pin rather than a public DNS name.
        conn.setHostnameVerifier((name, session) -> { try { return fingerprint((X509Certificate)session.getPeerCertificates()[0]).equalsIgnoreCase(pin); } catch (Exception e) { return false; } });
        conn.setInstanceFollowRedirects(false); conn.setConnectTimeout(3000); conn.setReadTimeout(3000);
        if (!token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (body != null) { conn.setRequestMethod("POST"); conn.setDoOutput(true); conn.setRequestProperty("Content-Type", "application/json"); try (OutputStream out = conn.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); } }
            int status = conn.getResponseCode();
            if (status != 200) throw new IOException(status == 401 ? "Pairing expired or revoked. Import a new setup code." : "Collector HTTP " + status);
            return read(conn.getInputStream(), 512000);
        } finally { conn.disconnect(); }
    }

    SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("deskpulse")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("deskpulse", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry)store.getEntry("deskpulse", null)).getSecretKey();
    }
    String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    String decrypt(String value) throws Exception {
        if (value.isEmpty()) return "";
        String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], 0)));
        return new String(cipher.doFinal(Base64.decode(parts[1], 0)), StandardCharsets.UTF_8);
    }

    public class Bridge {
        @JavascriptInterface public String bootstrap() {
            try {
                JSONObject result = new JSONObject(); result.put("config", config()); result.put("settings", object(prefs.getString("settings", "{}")));
                result.put("paired", !credential.isEmpty()); result.put("incoming", prefs.getString("incoming", ""));
                result.put("weather", object(prefs.getString("weather", "{}"))); result.put("news", object(prefs.getString("news", "{}")));
                result.put("stocks", stocks.cache());
                result.put("folder", prefs.getString("folder", "")); return result.toString();
            } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void saveSettings(String json) {
            try {
                JSONObject next = object(json);
                String previousLanguage = object(prefs.getString("settings", "{}")).optString("language", "en");
                String nextLanguage = next.optString("language", "en");
                if (!"en".equals(nextLanguage) && !"zh".equals(nextLanguage)) throw new JSONException("Invalid language");
                prefs.edit().putString("settings", json).apply();
                if (!previousLanguage.equals(nextLanguage)) handler.post(() -> { if (!destroyed) recreate(); });
            } catch (Exception e) { emit("error", "Invalid settings"); }
        }
        @JavascriptInterface public void updateHost(String host) {
            try { JSONObject c = config(); c.put("host", host.trim()); prefs.edit().putString("config", c.toString()).apply(); } catch (Exception e) { emit("error", "Invalid host"); }
        }
        @JavascriptInterface public void pair(String setup) {
            io.execute(() -> {
                try {
                    if (!setup.trim().startsWith("deskpulse:")) throw new IOException("Expected a DeskPulse setup code");
                    JSONObject c = object(new String(Base64.decode(setup.trim().substring(10), Base64.DEFAULT), StandardCharsets.UTF_8));
                    if (c.getInt("version") != 1) throw new IOException("Unsupported setup version");
                    JSONObject result = object(request(c, "/api/v1/pair", new JSONObject().put("secret", c.getString("secret")).toString(), ""));
                    String token = result.getString("token"); String encrypted = encrypt(token); c.remove("secret");
                    prefs.edit().putString("config", c.toString()).putString("credential", encrypted).remove("incoming").apply();
                    credential = token; emit("paired", c);
                } catch (Exception e) { emit("pairError", message(e)); }
            });
        }
        @JavascriptInterface public void poll() {
            io.execute(() -> { try { if (credential.isEmpty()) throw new IOException("Import a setup code to pair"); emit("sample", object(request(config(), "/api/v1/sample", null, credential))); }
                catch (Exception e) { ConnectivityManager cm = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE); emit("pollError", cm.getActiveNetwork() == null ? "Network disconnected" : message(e)); } });
        }
        @JavascriptInterface public void pickSetup() { runOnUiThread(() -> { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(i, 40); }); }
        @JavascriptInterface public void pickFolder() { runOnUiThread(() -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION), 41)); }
        @JavascriptInterface public void wallpaper(int direction, boolean shuffle) { io.execute(() -> rotateWallpaper(direction, shuffle)); }
        @JavascriptInterface public void resetWallpaper() {
            io.execute(() -> {
                synchronized (wallpapers) {
                    String folder = prefs.getString("folder", "");
                    if (!folder.isEmpty()) { try { getContentResolver().releasePersistableUriPermission(Uri.parse(folder), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { } }
                    prefs.edit().remove("folder").apply(); wallpapers.clear(); wallpaperIndex = -1;
                    deleteFile("wallpaper.jpg"); deleteFile("wallpaper.next"); emit("wallpaperReset", "Built-in background restored");
                }
            });
        }
        @JavascriptInterface public void refreshInfo(String city, String feed) {
            infoIo.execute(() -> fetchWeather(city));
            infoIo.execute(() -> fetchNews(feed, "news"));
        }
        @JavascriptInterface public void refreshStocks(String symbols, String range) { stocks.refresh(symbols, range); }
        @JavascriptInterface public void openLink(String url) { runOnUiThread(() -> { try { Uri uri = Uri.parse(url); if ("https".equals(uri.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { } }); }
    }
    static String message(Exception e) {
        if (e instanceof SSLException) {
            for (Throwable cause = e; cause != null; cause = cause.getCause()) {
                if (cause instanceof java.security.cert.CertificateException || cause instanceof java.security.cert.CertPathValidatorException)
                    return "TLS verification failed. Check the setup code and phone clock.";
            }
            return "Secure connection interrupted. Retrying.";
        }
        if (e instanceof java.net.SocketTimeoutException) return "Connection timed out. Check the host address and LAN firewall.";
        if (e instanceof java.net.ConnectException) return "Cannot reach collector. Check that it is running.";
        if (e instanceof java.net.UnknownHostException) return "Host address could not be resolved.";
        return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
    }

    @Override protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (req == 40) io.execute(() -> { try { emit("setup", read(getContentResolver().openInputStream(uri), 8192)); } catch (Exception e) { emit("error", message(e)); } });
        if (req == 41) {
            try {
                getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String previous = prefs.getString("folder", "");
                prefs.edit().putString("folder", uri.toString()).apply();
                if (!previous.isEmpty() && !previous.equals(uri.toString())) { try { getContentResolver().releasePersistableUriPermission(Uri.parse(previous), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) { } }
                io.execute(() -> scanFolder(true));
            } catch (Exception e) { emit("error", "Folder access denied"); }
        }
    }

    void scanFolder(boolean show) {
        String folder = prefs.getString("folder", ""); if (folder.isEmpty()) return;
        synchronized (wallpapers) {
            wallpapers.clear();
            try {
                Uri tree = Uri.parse(folder);
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                try (Cursor cursor = getContentResolver().query(children, new String[]{"document_id", "mime_type", "_display_name"}, null, null, "_display_name ASC")) {
                    if (cursor != null) while (cursor.moveToNext()) {
                        String mime = cursor.getString(1);
                        if (mime != null && Arrays.asList("image/jpeg", "image/png", "image/webp").contains(mime) && wallpapers.size() < 2000) wallpapers.add(DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)));
                    }
                }
                wallpaperIndex = -1;
                if (show) rotateWallpaper(1, false);
            } catch (Exception e) { deleteFile("wallpaper.jpg"); emit("wallpaperError", "Folder unavailable. Select the folder again."); }
        }
    }
    void rotateWallpaper(int direction, boolean shuffle) {
        synchronized (wallpapers) {
            if (wallpapers.isEmpty()) { if (!prefs.getString("folder", "").isEmpty()) { deleteFile("wallpaper.jpg"); emit("wallpaperError", "No supported images in folder"); } return; }
            for (int tries = 0; tries < wallpapers.size(); tries++) {
                wallpaperIndex = shuffle && wallpapers.size() > 1 ? (wallpaperIndex + 1 + new Random().nextInt(wallpapers.size() - 1)) % wallpapers.size() : Math.floorMod(wallpaperIndex + direction, wallpapers.size());
                Uri uri = wallpapers.get(wallpaperIndex);
                try {
                    BitmapFactory.Options opts = new BitmapFactory.Options(); opts.inJustDecodeBounds = true;
                    try (InputStream stream = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(stream, null, opts); }
                    if (opts.outWidth <= 0 || opts.outHeight <= 0) continue;
                    opts.inJustDecodeBounds = false; opts.inSampleSize = 1;
                    while (Math.max(opts.outWidth / opts.inSampleSize, opts.outHeight / opts.inSampleSize) > 2048) opts.inSampleSize *= 2;
                    Bitmap bitmap;
                    try (InputStream stream = getContentResolver().openInputStream(uri)) { bitmap = BitmapFactory.decodeStream(stream, null, opts); }
                    if (bitmap == null) continue;
                    try (FileOutputStream out = openFileOutput("wallpaper.next", MODE_PRIVATE)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out); } finally { bitmap.recycle(); }
                    if (!new File(getFilesDir(), "wallpaper.next").renameTo(new File(getFilesDir(), "wallpaper.jpg"))) throw new IOException("Image cache unavailable");
                    emit("wallpaper", (wallpaperIndex + 1) + " / " + wallpapers.size()); return;
                } catch (Exception ignored) { }
            }
            deleteFile("wallpaper.jpg"); emit("wallpaperError", "Images unreadable. Choose another folder.");
        }
    }

    String publicGet(String url) throws Exception {
        URL target = new URL(url);
        if (!"https".equals(target.getProtocol()) || target.getUserInfo() != null) throw new IOException("Use an HTTPS feed URL");
        HttpsURLConnection c = (HttpsURLConnection)target.openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setInstanceFollowRedirects(false); c.setRequestProperty("User-Agent", "DeskPulse/0.2.0 (personal information display)");
        try { if (c.getResponseCode() != 200) throw new IOException("Source HTTP " + c.getResponseCode()); return read(c.getInputStream(), 1500000); } finally { c.disconnect(); }
    }
    void fetchWeather(String city) {
        try {
            JSONObject geo = object(publicGet("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=" + URLEncoder.encode(city, "UTF-8")));
            JSONArray results = geo.optJSONArray("results"); if (results == null || results.length() == 0) throw new IOException("City not found");
            JSONObject place = results.getJSONObject(0);
            JSONObject weather = object(publicGet("https://api.open-meteo.com/v1/forecast?latitude=" + place.getDouble("latitude") + "&longitude=" + place.getDouble("longitude") + "&current=temperature_2m,weather_code&hourly=temperature_2m&forecast_days=2&timezone=auto"));
            weather.put("city", place.getString("name")); weather.put("country", place.optString("country")); weather.put("query", city); weather.put("fetchedAt", System.currentTimeMillis());
            prefs.edit().putString("weather", weather.toString()).apply(); emit("weather", weather);
        } catch (Exception e) { emit("weatherError", message(e)); }
    }
    void fetchNews(String feed, String slot) {
        try {
            String xml = publicGet(feed);
            XmlPullParser parser = Xml.newPullParser(); parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false); parser.setInput(new StringReader(xml));
            JSONArray items = new JSONArray(); JSONObject item = null; String capture = ""; StringBuilder value = new StringBuilder();
            String sourceTitle = ""; boolean captureSourceTitle = false; StringBuilder titleValue = new StringBuilder();
            for (int event = parser.getEventType(); event != XmlPullParser.END_DOCUMENT; event = parser.next()) {
                String name = parser.getName();
                if (event == XmlPullParser.START_TAG) {
                    if ("item".equals(name) || "entry".equals(name)) item = new JSONObject();
                    else if (item == null && sourceTitle.isEmpty() && "title".equals(name)) { captureSourceTitle = true; titleValue.setLength(0); }
                    else if (item != null && Arrays.asList("title", "link", "pubDate", "published", "updated").contains(name)) {
                        capture = name; value.setLength(0);
                        if ("link".equals(name) && parser.getAttributeValue(null, "href") != null && !"self".equals(parser.getAttributeValue(null, "rel"))) item.put("url", parser.getAttributeValue(null, "href"));
                    }
                } else if (event == XmlPullParser.TEXT && captureSourceTitle) titleValue.append(parser.getText());
                else if (event == XmlPullParser.END_TAG && captureSourceTitle && "title".equals(name)) { sourceTitle = titleValue.toString().trim(); captureSourceTitle = false; }
                else if (event == XmlPullParser.TEXT && !capture.isEmpty()) value.append(parser.getText());
                else if (event == XmlPullParser.END_TAG && item != null) {
                    if (name.equals(capture)) {
                        String v = value.toString().trim();
                        if (name.equals("title")) item.put("title", v);
                        else if (name.equals("link") && !v.isEmpty()) item.put("url", v);
                        else if (!name.equals("link")) item.put("published", v);
                        capture = "";
                    }
                    if ("item".equals(name) || "entry".equals(name)) { if (item.has("title") && item.optString("url").startsWith("https://")) items.put(item); item = null; if (items.length() >= 20) break; }
                }
            }
            if (items.length() == 0) throw new IOException("No readable RSS/Atom entries");
            JSONObject news = new JSONObject().put("items", items).put("source", new URL(feed).getHost()).put("title", sourceTitle).put("feed", feed).put("fetchedAt", System.currentTimeMillis());
            prefs.edit().putString(slot, news.toString()).apply(); emit(slot, news);
        } catch (Exception e) { emit(slot + "Error", message(e)); }
    }
}

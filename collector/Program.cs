using System.Net;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using DeskPulse;

if (!OperatingSystem.IsWindows() && !OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("The collector supports Windows and Linux.");
var builder = WebApplication.CreateBuilder(args);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
var statePath = Path.GetFullPath(builder.Configuration["state"] ?? Path.Combine(AppContext.BaseDirectory, "state"));
Directory.CreateDirectory(statePath);
if (OperatingSystem.IsLinux()) File.SetUnixFileMode(statePath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
var listen = builder.Configuration["listen"] ?? NetworkInterface.GetAllNetworkInterfaces()
    .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211)
    .Where(n => n.GetIPProperties().GatewayAddresses.Count > 0)
    .SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(n => n.Address)
    .FirstOrDefault(n => n.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && Security.IsLan(n))?.ToString() ?? "127.0.0.1";
if (!IPAddress.TryParse(listen, out var address) || !Security.IsLan(address)) throw new ArgumentException("--listen must be a private LAN IPv4 address or loopback.");
var port = int.Parse(builder.Configuration["port"] ?? "9443");
var certFile = Path.Combine(statePath, "collector.pfx");
if (!File.Exists(certFile))
{
    using var key = RSA.Create(2048);
    var req = new CertificateRequest("CN=DeskPulse", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
    req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
    using var created = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(5));
    File.WriteAllBytes(certFile, created.Export(X509ContentType.Pfx));
}
using var cert = new X509Certificate2(certFile);
if (OperatingSystem.IsLinux()) File.SetUnixFileMode(certFile, UnixFileMode.UserRead | UnixFileMode.UserWrite);
var fingerprint = cert.GetCertHashString(HashAlgorithmName.SHA256);
var auth = new Security(statePath);
builder.WebHost.ConfigureKestrel(k =>
{
    k.Limits.MaxRequestBodySize = 8192;
    k.Listen(address, port, o => o.UseHttps(cert));
});
builder.Services.AddSingleton<Telemetry>();
builder.Services.AddHostedService(s => s.GetRequiredService<Telemetry>());
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("pair", policy =>
{
    policy.PermitLimit = 10;
    policy.Window = TimeSpan.FromMinutes(1);
    policy.QueueLimit = 0;
    policy.AutoReplenishment = true;
}));
var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    if (context.Connection.RemoteIpAddress is not { } ip || !Security.IsLan(ip))
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next(context);
});
app.UseRateLimiter();
app.MapGet("/health", () => Results.Json(new { name = "DeskPulse", schemaVersion = 1, host = Environment.MachineName }));
app.MapPost("/api/v1/pair", (PairRequest request) =>
{
    var token = auth.Pair(request.Secret);
    return token is null ? Results.Unauthorized() : Results.Json(new { token, host = Environment.MachineName, schemaVersion = 1 });
}).RequireRateLimiting("pair");
app.MapGet("/api/v1/sample", (HttpContext context, Telemetry telemetry) =>
{
    if (!auth.Authorize(context.Request.Headers.Authorization.ToString())) return Results.Unauthorized();
    var sample = telemetry.Latest;
    return sample is null ? Results.StatusCode(503) : Results.Json(new
    {
        schemaVersion = 1,
        sampleAgeMs = Math.Max(0, (DateTimeOffset.UtcNow - sample.SampledAt).TotalMilliseconds),
        sample
    });
});
var setup = JsonSerializer.Serialize(new { version = 1, host = listen, port, fingerprint, secret = auth.PairingSecret });
var pairing = "deskpulse:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(setup));
var pairingPath = Path.Combine(statePath, "pairing.txt");
File.WriteAllText(pairingPath, pairing);
if (OperatingSystem.IsLinux()) File.SetUnixFileMode(pairingPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
Console.WriteLine($"\nDeskPulse {typeof(Program).Assembly.GetName().Version?.ToString(3)} | HTTPS {listen}:{port}\nCertificate SHA-256: {fingerprint}\n");
Console.WriteLine($"On the phone, import this file in Settings:\n{pairingPath}\n");
if (!bool.TryParse(builder.Configuration["quiet-pairing"], out var quietPairing) || !quietPairing) Console.WriteLine(pairing + "\n");
Console.WriteLine("Pairing expires in 10 minutes and is single-use. Restart to generate a new setup code.");
Console.WriteLine("Allow only this executable, TCP port, LAN address and local subnet. Do not forward this port.\n");
await app.RunAsync();

record PairRequest(string Secret);

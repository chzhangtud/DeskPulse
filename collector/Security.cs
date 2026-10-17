using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DeskPulse;

public sealed class Security
{
    readonly string path;
    readonly object gate = new();
    readonly HashSet<string> hashes;
    readonly DateTimeOffset expires = DateTimeOffset.UtcNow.AddMinutes(10);
    bool used;
    public string PairingSecret { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));

    public Security(string statePath)
    {
        path = Path.Combine(statePath, "clients.json");
        hashes = File.Exists(path) ? JsonSerializer.Deserialize<HashSet<string>>(File.ReadAllText(path))! : [];
    }

    public string? Pair(string? secret)
    {
        lock (gate)
        {
            if (used || DateTimeOffset.UtcNow > expires || !Equal(secret ?? "", PairingSecret)) return null;
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            hashes.Add(Hash(token));
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(hashes));
            File.Move(path + ".tmp", path, true);
            used = true;
            return token;
        }
    }

    public bool Authorize(string header)
    {
        if (!header.StartsWith("Bearer ", StringComparison.Ordinal) || header.Length > 100) return false;
        lock (gate) return hashes.Contains(Hash(header[7..]));
    }

    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static bool Equal(string a, string b) => CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    public static bool IsLan(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        return IPAddress.IsLoopback(address) || (bytes.Length == 4 &&
            (bytes[0] == 10 || bytes[0] == 192 && bytes[1] == 168 || bytes[0] == 172 && bytes[1] is >= 16 and <= 31));
    }
}

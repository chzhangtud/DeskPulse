using System.Globalization;

namespace DeskPulse;

public sealed class LinuxMetrics : IHostMetrics
{
    readonly string procRoot;
    (ulong Total, ulong Idle)? previous;
    public LinuxMetrics() : this("/proc") { }
    internal LinuxMetrics(string procRoot) => this.procRoot = procRoot;
    public string CpuSource => "Linux /proc/stat; aggregate CPU; idle includes iowait";
    public string MemorySource => "Linux /proc/meminfo; MemTotal minus MemAvailable";
    public double? UptimeSeconds => double.TryParse(Read("uptime")?.Split(' ')[0], CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) && value >= 0 ? value : null;

    public double? ReadCpuPercent()
    {
        var current = ParseCpu(Read("stat"));
        var before = previous;
        previous = current;
        if (current is not { } now || before is not { } last || now.Total <= last.Total || now.Idle < last.Idle || now.Idle - last.Idle > now.Total - last.Total) return null;
        return 100.0 * (now.Total - last.Total - (now.Idle - last.Idle)) / (now.Total - last.Total);
    }

    public MemoryReading? ReadMemory() => ParseMemory(Read("meminfo"));
    public DiskReading[] ReadDisks() => DiskMetrics.Read(MountPoints(Read("self/mountinfo")));

    internal static string[] MountPoints(string? text)
    {
        var paths = new List<string>();
        foreach (var line in (text ?? "").Split('\n'))
        {
            var halves = line.Split(" - ", 2);
            if (halves.Length != 2) continue;
            var mount = halves[0].Split(' ');
            var fs = halves[1].Split(' ')[0];
            if (mount.Length < 5) continue;
            var path = mount[4].Replace("\\040", " ").Replace("\\011", "\t").Replace("\\012", "\n").Replace("\\134", "\\");
            if (new[] { "/proc/", "/sys/", "/dev/", "/run/", "/usr/lib/wsl/", "/mnt/wslg/" }.Any(prefix => path.StartsWith(prefix, StringComparison.Ordinal))) continue;
            // Exclude pseudo, remote, loop-image and duplicate bind mounts.
            if (path != "/" && mount[3] != "/") continue;
            if (path == "/" || fs is "ext2" or "ext3" or "ext4" or "xfs" or "btrfs" or "zfs" or "f2fs" or "bcachefs" or "ntfs3" or "ntfs" or "exfat" or "vfat" or "9p" or "drvfs") paths.Add(path);
        }
        return paths.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    }

    string? Read(string file)
    {
        try { return File.ReadAllText(Path.Combine(procRoot, file)); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return null; }
    }

    internal static (ulong Total, ulong Idle)? ParseCpu(string? text)
    {
        var fields = text?.Split('\n')[0].Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (fields is null || fields.Length < 5 || fields[0] != "cpu") return null;
        var counters = new ulong[8];
        for (var i = 0; i < Math.Min(8, fields.Length - 1); i++)
            if (!ulong.TryParse(fields[i + 1], CultureInfo.InvariantCulture, out counters[i])) return null;
        try
        {
            ulong total = 0;
            foreach (var counter in counters) total = checked(total + counter);
            // guest/guest_nice are already included in user/nice; do not count them twice.
            return (total, checked(counters[3] + counters[4]));
        }
        catch (OverflowException) { return null; }
    }

    internal static MemoryReading? ParseMemory(string? text)
    {
        if (text is null) return null;
        var values = new Dictionary<string, ulong>();
        foreach (var line in text.Split('\n'))
        {
            var parts = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 3 && parts[2] == "kB" && ulong.TryParse(parts[1], CultureInfo.InvariantCulture, out var n)) values[parts[0].TrimEnd(':')] = n;
        }
        if (!values.TryGetValue("MemTotal", out var total) || total == 0 || total > ulong.MaxValue / 1024) return null;
        if (!values.TryGetValue("MemAvailable", out var available)) return null;
        if (available > total) return null;
        var used = total - available;
        return new(used * 1024, total * 1024, 100.0 * used / total);
    }
}

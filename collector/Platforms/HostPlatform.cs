namespace DeskPulse;

public sealed record CpuThermalReading(double? ValueC, string Source, DateTimeOffset SampledAt);

public interface ICpuTemperature
{
    CpuThermalReading Latest { get; }
    Task RunAsync(CancellationToken cancel);
}

public interface IHostMetrics
{
    double? ReadCpuPercent();
    MemoryReading? ReadMemory();
    DiskReading[] ReadDisks();
    double? UptimeSeconds { get; }
    string CpuSource { get; }
    string MemorySource { get; }
}

internal static class DiskMetrics
{
    internal static DiskReading[] Read(IEnumerable<string> paths) => paths.Distinct(StringComparer.Ordinal).Select(path =>
    {
        try { var d = new DriveInfo(path); return new DiskReading(path, d.IsReady ? d.AvailableFreeSpace : null, d.IsReady ? d.TotalSize : null); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException) { return new DiskReading(path, null, null); }
    }).ToArray();
}

public static class HostPlatform
{
    public static IHostMetrics CreateMetrics() => OperatingSystem.IsLinux() ? new LinuxMetrics() : new WindowsMetrics();

    public static ICpuTemperature CreateTemperature()
    {
        if (OperatingSystem.IsLinux()) return new LinuxCpuTemperature();
#if WINDOWS_SENSORS
        if (OperatingSystem.IsWindows()) return new WindowsCpuTemperature();
#endif
        throw new PlatformNotSupportedException("This build does not include sensors for this platform.");
    }
}

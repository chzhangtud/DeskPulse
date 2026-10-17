using System.Globalization;

namespace DeskPulse;

public sealed class LinuxCpuTemperature : ICpuTemperature
{
    readonly string sysRoot;
    CpuThermalReading latest = new(null, "Waiting for CPU temperature sensor", DateTimeOffset.UtcNow);
    public LinuxCpuTemperature() : this("/sys") { }
    internal LinuxCpuTemperature(string sysRoot) => this.sysRoot = sysRoot;
    public CpuThermalReading Latest
    {
        get
        {
            var value = Volatile.Read(ref latest);
            return DateTimeOffset.UtcNow - value.SampledAt <= TimeSpan.FromSeconds(10)
                ? value : new(null, "Unavailable: CPU temperature sensor stopped updating", value.SampledAt);
        }
    }

    public async Task RunAsync(CancellationToken cancel)
    {
        try
        {
            while (!cancel.IsCancellationRequested)
            {
                Volatile.Write(ref latest, Read());
                await Task.Delay(2000, cancel);
            }
        }
        catch (OperationCanceledException) when (cancel.IsCancellationRequested) { }
    }

    internal CpuThermalReading Read()
    {
        var readings = new List<(double Value, string Source, int Rank)>();
        foreach (var folder in Directories("class/hwmon", "hwmon*"))
        {
            var driver = Text(Path.Combine(folder, "name"));
            if (driver is not ("coretemp" or "k10temp" or "k8temp" or "zenpower" or "cpu_thermal" or "cpu-thermal")) continue;
            foreach (var file in Files(folder, "temp*_input"))
            {
                var label = Text(file[..^6] + "_label") ?? Path.GetFileName(file)[..^6];
                if (Temperature(Text(file)) is { } value)
                    readings.Add((value, "Linux sysfs · " + driver + " · " + label,
                        label.Contains("Package", StringComparison.OrdinalIgnoreCase) || label is "Tctl" or "Tdie" ? 0 : 1));
            }
        }
        if (readings.Count == 0)
            foreach (var folder in Directories("class/thermal", "thermal_zone*"))
            {
                var type = Text(Path.Combine(folder, "type"));
                if (type is "x86_pkg_temp" or "cpu-thermal" or "cpu_thermal")
                    if (Temperature(Text(Path.Combine(folder, "temp"))) is { } value)
                        readings.Add((value, "Linux sysfs · " + type, 0));
            }
        var best = readings.OrderBy(x => x.Rank).ThenByDescending(x => x.Value).FirstOrDefault();
        return readings.Count > 0 ? new(best.Value, best.Source, DateTimeOffset.UtcNow)
            : new(null, "Unavailable: Linux CPU temperature sensor not exposed or not readable", DateTimeOffset.UtcNow);
    }

    static double? Temperature(string? text) => double.TryParse(text, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n) && n > 0 && n <= 125000 ? n / 1000 : null;
    static string? Text(string path) { try { return File.ReadAllText(path).Trim(); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return null; } }
    string[] Directories(string relative, string pattern) { try { return Directory.GetDirectories(Path.Combine(sysRoot, relative), pattern); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return []; } }
    static string[] Files(string folder, string pattern) { try { return Directory.GetFiles(folder, pattern); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return []; } }
}

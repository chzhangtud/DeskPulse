using System.Globalization;

namespace DeskPulse;

internal static class NvidiaSensor
{
    internal static string Command => OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "nvidia-smi.exe")
        : File.Exists("/usr/lib/wsl/lib/nvidia-smi") ? "/usr/lib/wsl/lib/nvidia-smi" : "nvidia-smi";

    internal static GpuReading? Parse(string output)
    {
        // NVIDIA names may contain commas; the final five columns are numeric fields.
        var first = output.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (first is null) return null;
        var fields = first.Split(',').Select(x => x.Trim()).ToArray();
        if (fields.Length < 6) return null;
        var start = fields.Length - 5;
        static double? Number(string text, double max) => double.TryParse(text, CultureInfo.InvariantCulture, out var n) && double.IsFinite(n) && n >= 0 && n <= max ? n : null;
        return new(string.Join(", ", fields.Take(start)), Number(fields[start], 100), Number(fields[start + 1], 150),
            Number(fields[start + 2], double.MaxValue), Number(fields[start + 3], double.MaxValue), Number(fields[start + 4], double.MaxValue), DateTimeOffset.UtcNow);
    }
}

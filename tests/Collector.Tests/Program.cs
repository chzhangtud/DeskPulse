using DeskPulse;

var count = 0;
void Check(bool condition, string reason) { if (!condition) throw new Exception(reason); count++; }
var fixture = Path.Combine(Path.GetTempPath(), "deskpulse-fixtures-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(fixture);
void Write(string file, string content) { var path = Path.Combine(fixture, file); Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllText(path, content); }
try
{
    Check(LinuxMetrics.ParseCpu("cpu 100 10 20 500 30 4 6 2 50 10") == (672UL, 530UL), "Guest counters must not be counted twice");
    Check(LinuxMetrics.ParseCpu("cpu 1 bad 3 4") is null, "Malformed counters must be unavailable");
    Check(LinuxMetrics.ParseCpu("cpu 18446744073709551615 1 0 0") is null, "Overflow must not wrap");
    var cpu = new LinuxMetrics(fixture);
    Write("stat", "cpu 100 0 0 900 0 0 0 0");
    Check(cpu.ReadCpuPercent() is null, "First CPU sample needs a baseline");
    Write("stat", "cpu 150 0 0 950 0 0 0 0");
    Check(cpu.ReadCpuPercent() == 50, "CPU delta must report actual busy time");
    Write("stat", "cpu 1 0 0 9 0 0 0 0");
    Check(cpu.ReadCpuPercent() is null, "Counter reset needs a new baseline");
    Write("stat", "cpu 2 0 0 18 0 0 0 0");
    Check(cpu.ReadCpuPercent() == 10, "CPU sampling must recover after reset");
    Write("meminfo", "MemTotal: 8192 kB\nMemFree: 512 kB\nMemAvailable: 2048 kB\n");
    var memory = cpu.ReadMemory();
    Check(memory is { TotalBytes: 8388608, UsedBytes: 6291456, Percent: 75 }, "Memory must use available memory and KiB units");
    Check(LinuxMetrics.ParseMemory("MemTotal: 0 kB\nMemAvailable: 0 kB") is null, "Zero total is unavailable");
    Check(LinuxMetrics.ParseMemory("MemTotal: 4 kB\nMemAvailable: 5 kB") is null, "Impossible available memory is unavailable");
    Check(LinuxMetrics.ParseMemory("MemTotal: 4 kB") is null, "Missing MemAvailable must not invent used memory");
    Write("uptime", "1234.50 2000.00");
    Check(cpu.UptimeSeconds == 1234.5, "Use Linux boot uptime, not collector uptime");
    Write("uptime", "not available");
    Check(cpu.UptimeSeconds is null, "Missing boot uptime must not become a fabricated zero");
    var mounts = LinuxMetrics.MountPoints("1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /proc rw - proc proc rw\n3 1 8:2 / /media/My\\040Disk rw - ext4 /dev/sdb rw\n4 1 0:4 / /remote rw - nfs server:/ rw\n5 1 8:2 /sub /duplicate rw - ext4 /dev/sdb rw\n");
    Check(mounts.SequenceEqual(new[] { "/", "/media/My Disk" }), "Disks must skip pseudo/remote/bind mounts and decode mount paths");
    var thermal = new LinuxCpuTemperature(fixture);
    Write("class/hwmon/hwmon0/name", "nvme");
    Write("class/hwmon/hwmon0/temp1_input", "45000");
    Check(thermal.Read().ValueC is null, "NVMe must not become CPU temperature");
    Write("class/thermal/thermal_zone0/type", "acpitz");
    Write("class/thermal/thermal_zone0/temp", "45000");
    Check(thermal.Read().ValueC is null, "An unknown board thermal zone must not become CPU temperature");
    Write("class/hwmon/hwmon1/name", "coretemp");
    Write("class/hwmon/hwmon1/temp1_label", "Package id 0");
    Write("class/hwmon/hwmon1/temp1_input", "52000");
    Write("class/hwmon/hwmon1/temp2_label", "Core 0");
    Write("class/hwmon/hwmon1/temp2_input", "61000");
    Check(thermal.Read().ValueC == 52 && thermal.Read().Source.Contains("coretemp"), "Prefer CPU package over core fallback");
    Write("class/hwmon/hwmon1/temp1_input", "200000");
    Check(thermal.Read().ValueC == 61, "Reject out-of-range sensor values");
    Write("class/hwmon/hwmon1/temp2_input", "nan");
    Write("class/thermal/thermal_zone0/type", "x86_pkg_temp");
    Write("class/thermal/thermal_zone0/temp", "49000");
    Check(thermal.Read().ValueC == 49, "Use a CPU-labelled thermal zone when hwmon is unavailable");
    var gpu = NvidiaSensor.Parse("Example GPU, 25, 48, 1024, 8192, [Not Supported]\n");
    Check(gpu is { UtilizationPercent: 25, TemperatureC: 48, UsedMemoryMiB: 1024, PowerW: null }, "Unsupported GPU fields stay null");
    Check(NvidiaSensor.Parse("Example GPU, N/A, 999, -1, 8192, NaN") is { UtilizationPercent: null, TemperatureC: null, UsedMemoryMiB: null, PowerW: null }, "Invalid GPU fields stay null");
    Check(NvidiaSensor.Parse("") is null, "Empty NVIDIA output is unavailable");
    Check(NvidiaSensor.Parse("Vendor, Example GPU, 20, 40, 1024, 8192, 50")?.Name == "Vendor, Example GPU", "GPU model commas must not shift sensor columns");
    Console.WriteLine($"PASS {count} collector fixture checks (CPU, memory, uptime, mounts, CPU temperature, NVIDIA parsing)");
}
finally { Directory.Delete(fixture, true); }

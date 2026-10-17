using System.Runtime.InteropServices;

namespace DeskPulse;

public sealed class WindowsMetrics : IHostMetrics
{
    ulong lastIdle, lastTotal;
    bool haveCpu;
    public string CpuSource => "Windows GetSystemTimes";
    public string MemorySource => "Windows GlobalMemoryStatusEx";
    public double? UptimeSeconds => Environment.TickCount64 / 1000.0;
    public DiskReading[] ReadDisks() => DiskMetrics.Read(DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed).Select(d => d.Name));

    public double? ReadCpuPercent()
    {
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) { haveCpu = false; return null; }
        var total = kernel + user;
        double? value = haveCpu && total > lastTotal && idle >= lastIdle && idle - lastIdle <= total - lastTotal
            ? 100.0 * (total - lastTotal - (idle - lastIdle)) / (total - lastTotal) : null;
        lastIdle = idle; lastTotal = total; haveCpu = true;
        return value;
    }

    public MemoryReading? ReadMemory()
    {
        var status = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
        return GlobalMemoryStatusEx(ref status) && status.TotalPhys > 0
            ? new(status.TotalPhys - status.AvailPhys, status.TotalPhys, 100.0 * (status.TotalPhys - status.AvailPhys) / status.TotalPhys) : null;
    }

    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetSystemTimes(out ulong idle, out ulong kernel, out ulong user);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [StructLayout(LayoutKind.Sequential)]
    struct MemoryStatus
    {
        public uint Length, MemoryLoad;
        public ulong TotalPhys, AvailPhys, TotalPageFile, AvailPageFile, TotalVirtual, AvailVirtual, AvailExtendedVirtual;
    }
}

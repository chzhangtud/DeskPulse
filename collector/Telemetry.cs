using System.Diagnostics;
using System.Net.NetworkInformation;

namespace DeskPulse;

public record MemoryReading(ulong UsedBytes, ulong TotalBytes, double Percent);
public record NetworkReading(double? DownloadBytesPerSecond, double? UploadBytesPerSecond, string[] Interfaces, string[] InterfaceKinds);
public record DiskReading(string Name, long? FreeBytes, long? TotalBytes);
public record ProcessReading(string Name, double CpuPercent, long MemoryBytes);
public record GpuReading(string Name, double? UtilizationPercent, double? TemperatureC, double? UsedMemoryMiB, double? TotalMemoryMiB, double? PowerW, DateTimeOffset SampledAt);
public record Sample(long Sequence, DateTimeOffset SampledAt, string Host, double? CpuPercent, double? CpuTemperatureC,
    MemoryReading? Memory, NetworkReading Network, DiskReading[] Disks, ProcessReading[] Processes,
    GpuReading? Gpu, string GpuStatus, double? UptimeSeconds, Dictionary<string, string> Capabilities, ProcessReading[] ProcessesByMemory);

public sealed class Telemetry : BackgroundService
{
    Sample? latest;
    public Sample? Latest => Volatile.Read(ref latest);
    long sequence;
    double lastTime;
    Dictionary<string, (long Down, long Up)> lastNet = [];
    Dictionary<int, (DateTime Start, double Seconds)> lastProcesses = [];
    GpuReading? gpu;
    string gpuStatus = "Waiting for sensor";
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly ILogger<Telemetry> logger;
    readonly ICpuTemperature cpuTemperature = HostPlatform.CreateTemperature();
    readonly IHostMetrics hostMetrics = HostPlatform.CreateMetrics();
    public Telemetry(ILogger<Telemetry> logger) => this.logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        var gpuTask = ReadGpuLoop(stoppingToken);
        var cpuTask = Task.Run(() => cpuTemperature.RunAsync(stoppingToken), stoppingToken);
        try
        {
            do
            {
                try { Volatile.Write(ref latest, Collect()); }
                catch (Exception e) { logger.LogWarning("Sample failed: {Reason}", e.Message); }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        await Task.WhenAll(gpuTask, cpuTask);
    }

    Sample Collect()
    {
        var now = clock.Elapsed.TotalSeconds;
        var elapsed = now - lastTime;
        var cpu = hostMetrics.ReadCpuPercent();
        var memory = hostMetrics.ReadMemory();
        var nets = new Dictionary<string, (long Down, long Up)>();
        var names = new List<string>();
        var kinds = new HashSet<string>();
        double down = 0, up = 0;
        var haveDelta = false;
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            try
            {
                if (adapter.OperationalStatus != OperationalStatus.Up || adapter.NetworkInterfaceType is not (NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211) || adapter.GetIPProperties().GatewayAddresses.Count == 0) continue;
                var stats = adapter.GetIPv4Statistics();
                nets[adapter.Id] = (stats.BytesReceived, stats.BytesSent);
                names.Add(adapter.Name);
                kinds.Add(adapter.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "Wi-Fi" : "Ethernet");
                if (elapsed > 0 && lastNet.TryGetValue(adapter.Id, out var previous) && stats.BytesReceived >= previous.Down && stats.BytesSent >= previous.Up)
                {
                    down += (stats.BytesReceived - previous.Down) / elapsed;
                    up += (stats.BytesSent - previous.Up) / elapsed;
                    haveDelta = true;
                }
            }
            catch (NetworkInformationException) { }
        }
        lastNet = nets;
        var disks = hostMetrics.ReadDisks();
        var processes = new List<ProcessReading>();
        var current = new Dictionary<int, (DateTime Start, double Seconds)>();
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try
                {
                    var seconds = process.TotalProcessorTime.TotalSeconds;
                    var started = process.StartTime;
                    current[process.Id] = (started, seconds);
                    if (elapsed > 0 && lastProcesses.TryGetValue(process.Id, out var before) && started == before.Start && seconds >= before.Seconds)
                        processes.Add(new(process.ProcessName, Math.Clamp((seconds - before.Seconds) * 100 / elapsed / Environment.ProcessorCount, 0, 100), process.WorkingSet64));
                }
                catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException) { }
            }
        }
        lastProcesses = current;
        lastTime = now;
        var gpuValue = Volatile.Read(ref gpu);
        if (gpuValue is not null && DateTimeOffset.UtcNow - gpuValue.SampledAt > TimeSpan.FromSeconds(10)) gpuValue = null;
        var thermal = cpuTemperature.Latest;
        return new(++sequence, DateTimeOffset.UtcNow, Environment.MachineName, cpu, thermal.ValueC, memory,
            new(haveDelta ? down : null, haveDelta ? up : null, names.ToArray(), kinds.Order().ToArray()), disks,
            processes.OrderByDescending(p => p.CpuPercent).ThenByDescending(p => p.MemoryBytes).ThenBy(p => p.Name, StringComparer.Ordinal).Take(5).ToArray(), gpuValue, gpuStatus,
            hostMetrics.UptimeSeconds, new()
            {
                ["cpu"] = hostMetrics.CpuSource, ["memory"] = hostMetrics.MemorySource,
                ["network"] = "Physical Ethernet/Wi-Fi adapters with a gateway; bytes/sec",
                ["gpu"] = gpuValue is null ? gpuStatus : "NVIDIA nvidia-smi; first GPU; sampled every 3s",
                ["cpuTemperature"] = thermal.Source,
                ["diskIo"] = "Unavailable", ["fans"] = "Unavailable", ["perCore"] = "Unavailable"
            }, processes.OrderByDescending(p => p.MemoryBytes).ThenByDescending(p => p.CpuPercent).ThenBy(p => p.Name, StringComparer.Ordinal).Take(5).ToArray());
    }

    async Task ReadGpuLoop(CancellationToken cancel)
    {
        while (!cancel.IsCancellationRequested)
        {
            try
            {
                // nvidia-smi is optional and uses the locally installed NVIDIA driver.
                using var process = new Process { StartInfo = new()
                {
                    FileName = NvidiaSensor.Command,
                    Arguments = "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw --format=csv,noheader,nounits",
                    UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
                }};
                process.Start();
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                var outputTask = process.StandardOutput.ReadToEndAsync(timeout.Token);
                var errorTask = process.StandardError.ReadToEndAsync(timeout.Token);
                try { await process.WaitForExitAsync(timeout.Token); }
                catch (OperationCanceledException) { if (!process.HasExited) process.Kill(true); throw; }
                var output = await outputTask;
                await errorTask;
                if (process.ExitCode != 0) throw new InvalidOperationException("NVIDIA sensor command failed");
                Volatile.Write(ref gpu, NvidiaSensor.Parse(output) ?? throw new InvalidOperationException("NVIDIA sensor response unsupported"));
                gpuStatus = "Available";
            }
            catch (Exception e) when (e is not OutOfMemoryException)
            {
                Volatile.Write(ref gpu, null);
                gpuStatus = "Unavailable: NVIDIA sensor not accessible";
            }
            try { await Task.Delay(3000, cancel); } catch (OperationCanceledException) { break; }
        }
    }

}

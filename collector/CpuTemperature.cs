using System.Security.Principal;
using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.PawnIo;

namespace DeskPulse;

public sealed record CpuThermalReading(double? ValueC, string Source, DateTimeOffset SampledAt);

// Keep optional hardware/driver work off the 1 Hz OS sampler and HTTP request path.
public sealed class CpuTemperature
{
    CpuThermalReading latest = new(null, "Waiting for CPU temperature sensor", DateTimeOffset.UtcNow);
    public CpuThermalReading Latest
    {
        get
        {
            var reading = Volatile.Read(ref latest);
            return !reading.ValueC.HasValue || DateTimeOffset.UtcNow - reading.SampledAt <= TimeSpan.FromSeconds(10)
                ? reading : new(null, "Unavailable: CPU temperature sensor stopped updating", reading.SampledAt);
        }
    }

    public async Task RunAsync(CancellationToken cancel)
    {
        Computer? computer = null;
        try
        {
            while (!cancel.IsCancellationRequested)
            {
                try
                {
                    if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Windows is required");
                    if (!PawnIo.IsInstalled) throw new InvalidOperationException("Install the signed PawnIO driver for CPU temperature");
                    using var identity = WindowsIdentity.GetCurrent();
                    if (!new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
                        throw new InvalidOperationException("Run the collector as administrator for CPU temperature");
                    if (computer is null)
                    {
                        computer = new Computer { IsCpuEnabled = true };
                        computer.Open();
                    }
                    var sensors = new List<ISensor>();
                    foreach (var hardware in computer.Hardware.Where(h => h.HardwareType == HardwareType.Cpu))
                    {
                        hardware.Update();
                        sensors.AddRange(hardware.Sensors.Where(s => s.SensorType == SensorType.Temperature
                            && s.Value is > 0 and <= 125 && float.IsFinite(s.Value.Value)));
                    }
                    // Prefer package/die values; the hottest CPU sensor is the explicit fallback.
                    var sensor = sensors.OrderBy(s => Rank(s.Name)).ThenByDescending(s => s.Value).FirstOrDefault();
                    Volatile.Write(ref latest, sensor is null
                        ? new(null, "Unavailable: no accessible CPU temperature sensor", DateTimeOffset.UtcNow)
                        : new(sensor.Value, "LibreHardwareMonitor · " + sensor.Name, DateTimeOffset.UtcNow));
                }
                catch (Exception e) when (e is not OutOfMemoryException)
                {
                    Volatile.Write(ref latest, new(null, "Unavailable: " + e.Message, DateTimeOffset.UtcNow));
                    if (computer is not null)
                    {
                        try { computer.Close(); } catch (Exception) { }
                        computer = null;
                    }
                }
                await Task.Delay(Latest.ValueC.HasValue ? 2000 : 10000, cancel);
            }
        }
        catch (OperationCanceledException) when (cancel.IsCancellationRequested) { }
        finally
        {
            try { computer?.Close(); } catch (Exception) { }
        }
    }

    static int Rank(string name) => name switch
    {
        "Core (Tctl/Tdie)" or "CPU Package" => 0,
        "Core (Tdie)" => 1,
        "Core Max" => 2,
        _ => 3
    };
}

# Linux 安装与运维

[English / 完整技术说明](LINUX.md) · [返回中文 README](../README.zh-CN.md)

Linux 采集器与 Windows 共用配对协议和 Android 界面，支持 CPU、内存、网络、磁盘容量、进程排行、NVIDIA、温度及用户登录后自动恢复。缺少硬件传感器时显示不可用。Linux 没有独立桌面 GUI，显示端是 Android 应用。

## 下载、依赖与启动

从 [v0.2.0 Release](https://github.com/chzhangtud/DeskPulse/releases/tag/v0.2.0) 下载 Android APK、`SHA256SUMS.txt` 和对应 Linux 包：`uname -m` 为 `x86_64` 选 `linux-x64`，为 `aarch64` / `arm64` 选 `linux-arm64`。x64 已在 Ubuntu 24.04 WSL 中运行验证；ARM64 已交叉构建和检查包结构，尚未实机运行。

需要 glibc Linux，例如 Ubuntu 22.04/24.04 或 Debian 12；不支持 Alpine/musl 和 32 位系统。包内包含 .NET / ASP.NET Core，无需另装 SDK。仍需操作系统运行库：Ubuntu 24.04 可安装以下依赖，其他发行版请看 [英文依赖说明及官方链接](LINUX.md#download-and-install)。

v0.2.0 内置 .NET / ASP.NET Core 8.0.32。自包含运行时需通过更新 DeskPulse 包升级，单独更新系统 .NET 不会替换包内运行时。源码发布可用 `DESKPULSE_RUNTIME_VERSION=8.0.32 bash scripts/linux/build.sh` 指定已验证补丁版。

```bash
sudo apt-get update
sudo apt-get install ca-certificates libc6 libgcc-s1 libgssapi-krb5-2 libicu74 libssl3t64 libstdc++6 tzdata zlib1g
# 可选：systemd / 防火墙辅助脚本使用 Python 3
sudo apt-get install python3
```

在下载目录校验并解压：

```bash
grep '  DeskPulse-0.2.0-linux-x64.tar.gz$' SHA256SUMS.txt | sha256sum --check --strict
mkdir -p "$HOME/Applications/DeskPulse-0.2.0"
tar -xzf DeskPulse-0.2.0-linux-x64.tar.gz -C "$HOME/Applications/DeskPulse-0.2.0"
cd "$HOME/Applications/DeskPulse-0.2.0"
./start-collector.sh --listen 192.168.1.20 --port 9443
```

ARM64 请替换文件名。保留解压后的完整目录，使用允许执行文件的本地文件系统。用 `ip -4 address` / `ip route` 选择手机可达的本机私有 IPv4，替换示例地址；不要使用仅容器或 VPN 可达的地址。保持终端开启，Ctrl+C 停止手动运行的实例。建议固定 DHCP 租约。

将 APK 安装到 Android 10+ 手机，私下传输 `state/pairing.txt`，在 **Settings → Connection → Import setup file** 导入，再点击 **Pair computer**。配对码十分钟内单次有效；预览 APK 使用开发签名。不要公开配对文件、证书、客户端记录或含真实主机信息的日志。Linux 状态目录为 0700，凭据文件为 0600；`--state /private/path` 可指定其他私有目录。

## 防火墙与手机连接

手机与主机必须在网络上互通，访客 Wi-Fi 或客户端隔离可能阻断访问。只开放指定地址、端口和来源，先检查命令再应用：

```bash
./allow-lan.sh --listen 192.168.1.20 --remote 192.168.1.0/24 --backend ufw --dry-run
sudo ./allow-lan.sh --listen 192.168.1.20 --remote 192.168.1.0/24 --backend ufw
```

替换两处示例地址，使用 firewalld 时换成 `--backend firewalld`。脚本不启用被禁用的防火墙，不修改全局网络策略。其他防火墙自行设置等效规则；不要关闭防火墙或配置公网端口转发。`/health` 会暴露机器名，不能用它代替认证与配对验收。

## systemd、自启动与升级

停止手动实例后，从解压目录执行：

```bash
./install-service.sh --listen 192.168.1.20 --dry-run
./install-service.sh --listen 192.168.1.20
systemctl --user status deskpulse.service
journalctl --user -u deskpulse.service -n 50 --no-pager
```

安装不需要 sudo，使用当前用户的 XDG 目录：程序默认在 `~/.local/share/deskpulse/app`，服务在 `~/.config/systemd/user/deskpulse.service`，私有状态在 `~/.local/state/deskpulse`。设置了对应的 `XDG_DATA_HOME` / `XDG_CONFIG_HOME` / `XDG_STATE_HOME` 时按其路径存放。服务登录后启动、异常退出后重启、等待指定地址可用，日志不打印配对字符串。手机应导入服务状态目录下的 `pairing.txt`。

手动目录中的既有状态不会自动迁移。保留原配对时，先停止手动实例和新服务，再私下复制旧 `collector.pfx` 与 `clients.json` 到服务状态目录，最后启动服务；不要在进程运行时编辑或复制凭据。详情见 [状态迁移](LINUX.md#user-sign-in-startup)。

升级前停止 `systemctl --user stop deskpulse.service` 并私下备份原状态，将新包解压到另一个目录，再运行新目录的安装脚本。保留 XDG 状态目录即可保持证书和配对。回退时停止服务，从保存的旧版本目录重新运行安装脚本，继续使用原状态。地址或端口变化后同步更新手机端和防火墙。

手动安装升级时停止旧进程，在新目录启动并用 `--state /absolute/path/to/previous/state` 指向原状态。Android 使用相同签名的 APK 覆盖升级；不要自动卸载应用造成配对丢失。

停用：`systemctl --user disable --now deskpulse.service`。移除注册时，仅移除对应用户服务文件并运行 `systemctl --user daemon-reload`，保留状态，除非明确要撤销配对。用户 systemd 管理器不可用时可前台运行；安装脚本不会自动启用 systemd 或 lingering。登出后继续运行 / 登录前启动需要管理员另外选择配置 `loginctl enable-linger`。

## 传感器、WSL 与排查

CPU 温度来自内核 CPU 标记的 hwmon/thermal；查看 `/sys/class/hwmon`，确认对应内核驱动和服务用户读取权限。Linux 不安装 PawnIO，不把 GPU、硬盘或 NVMe 温度代作 CPU 温度。NVIDIA 依赖已有驱动和 `nvidia-smi`；不支持的计数器保持空值。AMD/Intel GPU 传感器、风扇、逐核心图表和磁盘 I/O 尚未提供。

WSL 显示 Linux 虚拟机指标，不能代替 Windows 主机指标，通常不暴露 CPU 温度。WSL 2 NAT 地址通常不能直接从手机访问；需要单独选择受支持的网络方案，例如 Windows 11 镜像网络和相应防火墙规则。本仓库测试不改 `.wslconfig`、路由或 Windows 防火墙，loopback 测试成功不代表手机局域网已连通。相关 [微软 WSL 网络说明](https://learn.microsoft.com/windows/wsl/networking)。

| 问题 | 检查 |
| --- | --- |
| `Exec format error` | 包架构是否匹配 `uname -m` |
| 文件存在却提示找不到 | 是否为 glibc 系统，ELF 加载器是否可用 |
| ICU / OpenSSL 错误 | 安装发行版对应的系统依赖 |
| 无执行权限 | 检查解压权限和 `noexec` 挂载，改用本地可执行目录 |
| 地址不可用 / 端口占用 | 检查 `ip -4 address` 和 `ss -ltn '( sport = :9443 )'`，只停止目标旧实例 |
| 手机超时 | 检查 LAN 地址、路由、Wi-Fi 隔离、防火墙及 WSL 网络 |
| 配对被拒绝 | 使用当前未消费且未超时的私有配对文件；既有配对优先恢复原状态 |
| 用户服务无法连接 / 反复重启 | 检查实际用户会话、systemd 管理器、依赖、地址及服务日志；分享前去掉个人路径和主机名 |

## 从源码构建与测试

仓库根目录执行 `bash scripts/linux/build.sh`，需要 .NET 8 SDK、Git、Bash、Python 3；输出在 `artifacts/linux-x64/` 或 `artifacts/linux-arm64/` 和对应版本 tarball。用发布 APK 时无需在 Linux 上构建 Android。

完整的逻辑、已发布程序、安装包及真实用户服务测试命令见 [英文测试章节](LINUX.md#tests)。真实服务测试使用自己的临时服务和状态；验证证书固定、单次配对、真实指标、崩溃恢复以及升级保留配对。没有实际手机或 ARM64 硬件时必须明确报告验证边界。

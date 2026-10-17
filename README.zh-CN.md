<div align="center">

# ⚡ DeskPulse

**让闲置 Android 手机，成为桌面上的电脑监控屏。**

A landscape PC monitor and independent desk display for Android.

[English](README.md) | **简体中文**

[![下载 Android APK](https://img.shields.io/badge/下载-Android_APK-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/chzhangtud/DeskPulse/releases/download/v0.1.0/DeskPulse-0.1.0.apk)
[![下载 Windows x64](https://img.shields.io/badge/下载-Windows_x64_ZIP-0078D4?style=for-the-badge)](https://github.com/chzhangtud/DeskPulse/releases/download/v0.1.0/DeskPulse-0.1.0-windows-x64.zip)

[v0.1.0 预览版 · 发布说明与 SHA-256 校验文件](https://github.com/chzhangtud/DeskPulse/releases/tag/v0.1.0)

[![Android](https://img.shields.io/badge/Android-10%2B-3DDC84?style=flat-square&logo=android&logoColor=white)](android/)
[![Windows](https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=flat-square)](collector/)
[![Linux](https://img.shields.io/badge/Linux-x64%20%2F%20ARM64-FCC624?style=flat-square&logo=linux&logoColor=black)](docs/LINUX.md)
[![.NET](https://img.shields.io/badge/.NET-8-512BD4?style=flat-square&logo=dotnet&logoColor=white)](collector/DeskPulse.Collector.csproj)
[![Languages](https://img.shields.io/badge/UI-English%20%2F%20简体中文-62D8D2?style=flat-square)](#配置)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[🚀 快速开始](#快速开始) · [🖼️ 界面预览](#界面预览) · [⚙️ 配置](#配置) · [🤖 Agent 部署](docs/AGENT_DEPLOY.md)

</div>

![DeskPulse 监控界面](docs/images/monitor.png)

## 能做什么

- **实时监控**：CPU、NVIDIA GPU、物理内存、网络速率、磁盘容量，以及独立的 CPU / RAM 进程排行。1 Hz 采样、60 秒曲线。
- **独立信息屏**：电脑离线后显示时钟、天气、每日美股走势与 RSS 新闻；连接恢复后自动回到监控。
- **适合常驻桌面**：横屏沉浸显示、深浅主题与定时切换、本地壁纸轮播、英语 / 简体中文。
- **局域网配对**：固定证书的 HTTPS、十分钟内单次有效的配对码、Android Keystore 加密保存凭据。
- **可选温度与自启动**：Windows 使用签名驱动，Linux 读取内核温度传感器；Windows 登录任务和 Linux 用户 systemd 服务均支持自动恢复。

采集器支持 Windows 和 Linux，使用相同的 Android 配对协议。不支持的传感器明确显示不可用。Windows CPU 温度需要 PawnIO 和管理员权限；Linux 从内核 hwmon/thermal 读取 CPU 温度。GPU 传感器目前支持 NVIDIA。

## 界面预览

### 离线也能用的信息屏

![时钟、天气、股票与新闻](docs/images/information.png)

### 主题、语言与壁纸设置

![外观设置](docs/images/settings.png)

展示图使用 Android 应用自带的 HTML/CSS/JavaScript 界面，在相同横屏比例下渲染。主机、硬件、进程、行情、天气和新闻均为公开示例数据，不代表真实设备或实时行情。

## 快速开始

### Linux（从当前源码构建）

需要 glibc Linux、.NET 8 SDK、Bash 和 Python 3。构建结果包含 .NET 运行时。

```bash
bash scripts/linux/build.sh
bash scripts/linux/start-collector.sh --listen 192.168.1.20 --port 9443
```

将示例地址换成本机局域网地址，私下将 `artifacts/linux-x64/state/pairing.txt` 导入手机配对。ARM64 主机使用对应的 `linux-arm64` 目录。详见 [Linux 安装、温度、局域网防火墙和 systemd 指南](docs/LINUX.md)。

现有 v0.1.0 下载按钮仍为此前发布的 Windows/Android 预览版；Linux 请从当前源码构建，原 Android APK 可继续使用。WSL 测试验证 Linux 虚拟机内的指标和服务；CPU 温度可能不暴露，NAT 模式下手机也不能直接访问 WSL 地址。

### 直接下载安装

1. 点击上方 **Windows x64 ZIP**，完整解压到同一目录，运行 `DeskPulse.Collector.exe`，无需另装 .NET。
2. 在该目录打开管理员 PowerShell，运行 `./Allow-Lan.ps1 -Program "$PWD/DeskPulse.Collector.exe" -LocalAddress 192.168.1.20`，将示例地址替换为采集器打印的本机局域网地址。
3. 点击上方 **Android APK**，安装到 Android 10+ 手机。本预览版使用开发签名证书。
4. 私下将采集器的 `state/pairing.txt` 传到手机，在 **Settings → Connection → Import setup file** 中导入，再点击 **Pair computer**。请在采集器启动后十分钟内完成配对。

电脑与手机需要在局域网内互通。升级时保留采集器的 `state/` 文件夹。Release 附有 `SHA256SUMS.txt`，可用 `Get-FileHash -Algorithm SHA256` 校验下载文件。

### 1. 构建 Windows / Android

需要 Windows 10/11 x64、Git、.NET 8 SDK、JDK 17+、Android SDK Platform / Build-tools 35、Node.js 18+。Python 3.10+ 用于采集器集成测试。将 `ANDROID_HOME` 和 `JAVA_HOME` 指向本机 SDK / JDK，或通过构建脚本参数传入。

```powershell
git clone git@github.com:chzhangtud/DeskPulse.git
cd DeskPulse
./scripts/Build.ps1
```

无需构建工具即可使用上方 Release 安装包。自行从源码构建时，会生成以下本地文件：

| 输出 | 用途 |
| --- | --- |
| `artifacts/android/DeskPulse-0.1.0.apk` | 安装到 Android 10+ 手机 |
| `artifacts/collector/` | 完整的 Windows 采集器目录 |
| `artifacts/DeskPulse-0.1.0-windows-x64.zip` | Windows 分发包，不包含配对状态 |

当前脚本生成开发签名 APK；公开分发正式 APK 前需配置自己的发布签名。Windows 采集器为自包含构建，运行时无需另装 .NET。

### 2. 启动采集器并允许局域网连接

普通 PowerShell：

```powershell
./scripts/Start-Collector.ps1
```

采集器会打印监听地址。管理员 PowerShell 中设置防火墙规则，下面的地址仅为示例，请替换为打印出的本机局域网地址：

```powershell
./scripts/Allow-Lan.ps1 -Program "$PWD/artifacts/collector/DeskPulse.Collector.exe" -LocalAddress 192.168.1.20
```

电脑与手机需要能够在局域网内互通。不要为此服务配置公网端口转发。

### 3. 安装 Android 应用并配对

将 APK 传到手机安装，或使用已授权的 USB 调试连接：

```powershell
adb install -r artifacts/android/DeskPulse-0.1.0.apk
adb shell am start -W -n io.deskpulse.app/.MainActivity
```

私下将 `artifacts/collector/state/pairing.txt` 传到手机，在 **Settings → Connection → Import setup file** 导入，再点击 **Pair computer**。也可粘贴配对字符串。配对码启动后十分钟失效且只能使用一次；已配对手机在重启后仍可连接。

详细操作、登录自启动、CPU 温度和升级步骤见 [安装指南](docs/INSTALL.md)。

## 配置

应用内 **Settings** 修改显示配置，无需编辑源码。

| 位置 | 可配置项 / 默认值 |
| --- | --- |
| Connection | 导入配对码、修改采集器地址 |
| Appearance | English / 简体中文；默认深色；定时模式默认 07:00 / 19:00 |
| Wallpaper | 本地文件夹、轮播、固定当前图片、cover / contain；默认五分钟轮换 |
| Appearance | 背板透明度 86%，图片压暗 30% |
| Information | 天气城市默认为示例城市 London；RSS 默认为 Ars Technica，可修改 |
| Stocks | 半导体 / 科技 / 其他；默认半导体、10 个交易日；支持 5 日与 1/3/6 月 |
| Health rules | 内存 85/95%；CPU 温度 85/95°C；GPU 温度 80/88°C；磁盘剩余 15/5% |
| Active processes | CPU / RAM 分别选取占用最高的五个进程 |

采集器可指定地址和端口：

```powershell
./scripts/Start-Collector.ps1 -ListenAddress 192.168.1.20 -Port 9443
```

也可直接运行 EXE，使用 `--state` 指向自选的私有状态目录。手机里的端口来自配对码；修改端口后需导入更新后的配对码，并更新防火墙规则。

天气与新闻由手机直接获取，每 15 分钟刷新；股票为已完成交易日的日线收盘数据，保留来源和日期。没有互联网时继续显示成功缓存，首次无缓存时显示不可用。行情百分比对应所选周期，使用未复权价格且不含分红。

## 给 Agent 的部署入口

读取 [AGENTS.md](AGENTS.md)，然后执行 [Agent 部署步骤](docs/AGENT_DEPLOY.md)：环境检查 → 构建 → 启动 / 防火墙 → 手机安装与私密配对 → 验证。文档也包含保留配对状态的升级流程和验收条件。

## 开发与验证

```powershell
node --test tests/core.test.cjs tests/i18n.test.cjs tests/stocks.test.cjs
dotnet run --project tests/Collector.Tests -c Release
dotnet build collector -c Release
python tests/collector_integration.py
./android/gradlew.bat -p android assembleDebug lintDebug
```

Node 测试不需要设备或网络。采集器集成测试使用独立的临时 loopback 实例。需要真实手机的网络中断测试会切换 Wi-Fi、重启测试采集器，请先阅读 [安装指南中的测试说明](docs/INSTALL.md#tests)。

## 项目结构

```text
android/       Android 应用与打包在 APK 内的界面
collector/     跨平台采集器、Platforms/ 系统实现与 HTTPS API
scripts/       Windows 构建与部署；linux/ 下为 Bash/systemd 部署
tests/        逻辑、采集器和真机验证脚本
docs/         安装、Agent 部署、架构及公开展示图
licenses/     第三方许可原文
```

## 隐私与依赖

配对码、客户端状态、证书、日志、构建产物及内部计划均不纳入 Git。不要将 `state/`、控制台中的配对字符串或含真实主机信息的截图附到公开 Issue。`/health` 会向局域网请求方返回机器名；遥测样本还包含硬件、进程和网卡信息。

Android 无第三方运行库依赖。Windows 使用 LibreHardwareMonitor；可选驱动、天气、新闻与行情来源见 [第三方声明](THIRD_PARTY_NOTICES.md)。第三方许可仅适用于相应组件，具体实现与信任边界见 [架构说明](docs/ARCHITECTURE.md)。

## 许可证

本项目原创代码采用 [MIT 许可证](LICENSE)。
第三方组件保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

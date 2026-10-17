(function (root) {
  "use strict";
  // Only application-owned copy is translated. Host/process names and publisher content stay original.
  const zh = {
    Stocks: "股价",
    "Period change · USD": "区间涨跌 · 美元",
    "Short history": "历史不足",
    "Change versus the close before the selected period": "相对于所选周期开始前的收盘价计算涨跌",
    Chips: "半导体",
    Tech: "科技",
    Other: "其他",
    "Daily US stocks": "美股日线",
    "Daily history range": "日线时间范围",
    "Stock categories": "股票分类",
    "Stock daily closes": "股票每日收盘价",
    "5 trading days": "近 5 个交易日",
    "10 trading days": "近 10 个交易日",
    "1 month": "近 1 个月",
    "3 months": "近 3 个月",
    "6 months": "近半年",
    "Daily close · USD": "日收盘 · 美元",
    "Daily close change; charts show selected period": "涨跌幅对比前一收盘日；曲线显示所选时间范围",
    "Loading daily history…": "正在加载日线…",
    "Awaiting daily data": "等待日线数据",
    "Loading…": "加载中…",
    "Some data unavailable · cached closes retained": "部分数据不可用 · 保留缓存收盘价",
    "Shorter cached history": "显示较短的缓存历史",
    "Dates vary": "收盘日期不同",
    "Choose a stock category and daily history range": "请选择股票分类和日线时间范围",
    Eastmoney: "东方财富",
    "Tencent Finance": "腾讯财经",
    Language: "界面语言",
    English: "英语",
    "Chinese (Simplified)": "简体中文",
    "LOCAL WORKSTATION": "本地电脑",
    "Show clock, weather and news": "显示时钟、天气和新闻",
    "Show computer monitoring": "显示电脑监控",
    "Open settings": "打开设置",
    "Close settings": "关闭设置",
    "Settings sections": "设置分类",
    Settings: "设置",
    Info: "资讯",
    Monitor: "监控",
    Processor: "处理器",
    Graphics: "显卡",
    Memory: "内存",
    Network: "网络",
    Load: "负载",
    Pressure: "压力",
    Traffic: "流量",
    "CPU utilization": "CPU 使用率",
    "GPU utilization": "GPU 使用率",
    "Physical memory": "物理内存",
    "60 s": "60 秒",
    "↓ Solid / ↑ Dashed": "↓ 实线 / ↑ 虚线",
    "Processor utilization over the last 60 seconds":
      "最近 60 秒的处理器使用率",
    "Graphics utilization over the last 60 seconds": "最近 60 秒的显卡使用率",
    "Physical memory utilization over the last 60 seconds":
      "最近 60 秒的物理内存使用率",
    "Download as a solid line and upload as a dashed line over 60 seconds":
      "最近 60 秒的下载实线和上传虚线",
    "Waiting for sample": "等待采样",
    "Waiting for a genuine sample": "等待真实采样数据",
    "Physical interfaces": "物理网卡",
    "Physical adapters": "物理网卡",
    "No physical interface available": "没有可用的物理网卡",
    Ethernet: "以太网",
    "Active processes": "活跃进程",
    "Process order": "进程排序",
    "Sort processes by CPU, descending": "按 CPU 使用率降序排列进程",
    "Sort processes by memory, descending": "按内存占用降序排列进程",
    "RAM ↓": "内存 ↓",
    "Choose CPU or RAM process order": "请选择按 CPU 或内存排列进程",
    "RAM ranking needs a collector update": "内存排名需要更新电脑采集器",
    "CPU / RAM": "CPU / 内存",
    Storage: "存储",
    "Free / total": "可用 / 总量",
    System: "系统",
    Hardware: "硬件",
    Uptime: "运行时间",
    "GPU power": "显卡功耗",
    "CPU temp": "CPU 温度",
    "CPU temperature": "CPU 温度",
    "Your desk, at a glance": "桌面信息，一目了然",
    "Pair your computer to begin monitoring.": "配对电脑后即可开始监控。",
    "The clock, weather and news work independently.":
      "时钟、天气和新闻可独立运行。",
    Weather: "天气",
    London: "伦敦",
    "United Kingdom": "英国",
    "No cached weather yet": "暂无天气缓存",
    "Tech / wire": "科技资讯",
    "No cached headlines yet. Internet access is required for the first update.":
      "暂无新闻缓存，首次更新需要连接互联网。",
    "Make it yours": "个性化设置",
    "DeskPulse settings": "DeskPulse 设置",
    Connection: "连接",
    "Your computer": "你的电脑",
    Appearance: "外观",
    "Theme & wallpaper": "主题和壁纸",
    Information: "资讯",
    "Weather & news": "天气和新闻",
    "Health rules": "健康规则",
    "Limits & alerts": "阈值和告警",
    "Connect your computer": "连接你的电脑",
    "Run the Windows collector. Import its": "运行 Windows 采集器，导入生成的",
    "or paste the setup code below. It contains the collector's identity and a single-use pairing secret. Transfer it privately.":
      "或在下方粘贴配置码。配置码包含采集器身份和一次性配对密钥，请私密传输。",
    "Import setup file": "导入配置文件",
    "Pair computer": "配对电脑",
    "Host address (after pairing)": "电脑地址（配对后）",
    "Appearance & wallpaper": "外观和壁纸",
    "Wallpaper controls": "壁纸操作",
    "Previous wallpaper": "上一张壁纸",
    "Next wallpaper": "下一张壁纸",
    "Built-in background": "内置背景",
    "Pin current": "固定当前壁纸",
    Theme: "主题",
    Scheduled: "按时间切换",
    "Fixed night": "固定深色",
    "Fixed day": "固定浅色",
    "Day starts": "浅色开始时间",
    "Night starts": "深色开始时间",
    "Day starts (24h)": "浅色开始时间（24小时）",
    "Night starts (24h)": "深色开始时间（24小时）",
    "Backing opacity %": "底板不透明度 %",
    "Image dimming %": "壁纸暗化程度 %",
    "Image fit": "壁纸适配",
    cover: "铺满",
    contain: "完整显示",
    "Focal position %": "水平焦点位置 %",
    "Rotation interval / sec": "轮换间隔 / 秒",
    "Choose phone folder": "选择手机文件夹",
    "Use built-in background": "使用内置背景",
    Shuffle: "随机轮换",
    "JPEG / PNG / WebP in the selected folder (no subfolders, up to 2,000 images). Invalid images are skipped. Decoding is bounded to 2048 px. Folder access stays on the phone.":
      "读取所选文件夹中的 JPEG / PNG / WebP 图片，不含子文件夹，最多 2,000 张。自动跳过无效图片，解码尺寸上限为 2048 像素。文件夹访问仅在手机本地进行。",
    "Independent information": "独立资讯",
    "Weather city": "天气城市",
    "RSS / Atom feed (HTTPS)": "RSS / Atom 订阅地址（HTTPS）",
    "First RSS / Atom feed (HTTPS)": "第一资讯源 RSS / Atom 地址（HTTPS）",
    "Second RSS / Atom feed (HTTPS)": "第二资讯源 RSS / Atom 地址（HTTPS）",
    "Source 1": "资讯源一",
    "Source 2": "资讯源二",
    "First news source": "第一资讯源，可上下滑动",
    "Second news source": "第二资讯源，可上下滑动",
    headlines: "条资讯",
    "Open-Meteo weather refreshes every 15 minutes; headlines every 15 minutes. Cached content is marked with its update time. Open-Meteo data: CC BY 4.0. Headlines link to the original publisher.":
      "天气和新闻每 15 分钟更新一次，缓存内容会标注更新时间。Open-Meteo 数据采用 CC BY 4.0 许可；新闻标题链接至原始发布者。",
    "Waiting for CPU sensor status": "等待 CPU 传感器状态",
    "For CPU temperature, run Install-CpuSensor.ps1 once on Windows as administrator, then start the collector as administrator. Monitoring continues when the optional sensor is unavailable.":
      "读取 CPU 温度需在 Windows 上以管理员身份运行一次 Install-CpuSensor.ps1，然后以管理员身份启动采集器。传感器不可用时，其他监控仍会继续。",
    "Load and traffic are neutral measurements. Warnings apply to sustained memory pressure, disk free space and CPU/GPU temperature. Temperature defaults are provisional; adjust for your hardware.":
      "负载和流量本身不代表异常。告警针对持续内存压力、磁盘可用空间及 CPU / GPU 温度。默认温度阈值仅供起始配置，请按硬件调整。",
    "CPU warning °C": "CPU 告警温度 °C",
    "CPU critical °C": "CPU 严重温度 °C",
    "Memory warning %": "内存告警阈值 %",
    "Memory critical %": "内存严重阈值 %",
    "Disk free warning %": "磁盘可用空间告警 %",
    "Disk free critical %": "磁盘可用空间严重 %",
    "GPU warning °C": "GPU 告警温度 °C",
    "GPU critical °C": "GPU 严重温度 °C",
    "Sustained duration / sec": "持续时间 / 秒",
    "Recovery margin / points or °C": "恢复余量 / 百分点或 °C",
    "Connection help": "连接帮助",
    "Use the computer's LAN IPv4 address. Both devices need a working LAN route; guest Wi-Fi isolation may block access. Allow the collector's TCP port through Windows Firewall for the intended LAN only. A timeout means the host cannot be reached; it does not prove the computer is powered off.":
      "使用电脑的局域网 IPv4 地址。两台设备需要可互通的局域网路由，访客 Wi-Fi 隔离可能阻止连接。仅为目标局域网放行 Windows 防火墙中的采集器 TCP 端口。超时表示无法连接电脑，不代表电脑一定已关机。",
    "Save changes": "保存更改",
    "Not paired": "未配对",
    Connecting: "连接中",
    Live: "实时",
    Stale: "数据过期",
    Unreachable: "无法连接",
    "Retrying connection": "正在重试连接",
    "Pair your computer in Setup. The clock, weather and news work independently.":
      "请在设置中配对电脑。时钟、天气和新闻可独立运行。",
    "Connecting to your computer…": "正在连接你的电脑…",
    "Computer connected. Monitoring continues in the background.":
      "电脑已连接，监控在后台继续运行。",
    "Cannot reach host. Retrying automatically. Last success: ":
      "无法连接电脑，正在自动重试。上次成功：",
    "Updated ": "更新于 ",
    "updated ": "更新于 ",
    "awaiting first update": "等待首次更新",
    "Awaiting first update": "等待首次更新",
    "s ago": "秒前",
    "m ago": "分钟前",
    "h ago": "小时前",
    never: "从未",
    "CACHED / STALE": "缓存 / 已过期",
    "Pinned certificate SHA-256: ": "固定证书 SHA-256：",
    "No collector paired": "尚未配对采集器",
    "Pairing is available in the Android app": "请在 Android 应用中配对",
    "Verifying collector…": "正在验证采集器…",
    "Paired securely": "已安全配对",
    "Computer paired. Waiting for live telemetry.":
      "电脑已配对，等待实时数据。",
    "Unsupported or stale telemetry": "数据格式不受支持或已过期",
    "Phone wallpaper": "手机壁纸",
    "Wallpaper ": "壁纸 ",
    "CPU sensor setup needed": "需要启用 CPU 传感器",
    "CPU sensor needs admin access": "CPU 传感器需要管理员权限",
    "Temperature unavailable": "温度不可用",
    "CPU temperature unavailable": "CPU 温度不可用",
    "Temp unavailable": "温度不可用",
    "Sensor unavailable": "传感器不可用",
    "Process readings unavailable": "进程数据不可用",
    CRITICAL: "严重",
    WARNING: "告警",
    "LOW FREE": "可用空间不足",
    UNAVAILABLE: "不可用",
    Unavailable: "不可用",
    "1 Hz sampling · 60s history": "每秒采样 · 60 秒历史",
    "STALE: values are historical; traces paused":
      "数据过期：当前为历史读数，曲线已暂停",
    "Core (Tctl/Tdie)": "核心（Tctl/Tdie）",
    "Core (Tdie)": "核心（Tdie）",
    "CPU Package": "CPU 封装",
    "Install the signed PawnIO driver for CPU temperature":
      "读取 CPU 温度需要安装签名 PawnIO 驱动",
    "Run the collector as administrator for CPU temperature":
      "读取 CPU 温度需要以管理员身份运行采集器",
    "no accessible CPU temperature sensor": "没有可访问的 CPU 温度传感器",
    "CPU temperature sensor stopped updating": "CPU 温度传感器已停止更新",
    "Waiting for CPU temperature sensor": "等待 CPU 温度传感器",
    "NVIDIA sensor not accessible": "无法访问 NVIDIA 传感器",
    "Clear sky": "晴朗",
    "Mainly clear": "大部晴朗",
    "Partly cloudy": "局部多云",
    Overcast: "阴天",
    Fog: "雾",
    "Rime fog": "雾凇",
    "Light drizzle": "轻微毛毛雨",
    Drizzle: "毛毛雨",
    "Dense drizzle": "较强毛毛雨",
    "Heavy drizzle": "较强毛毛雨",
    "Freezing drizzle": "冻毛毛雨",
    "Light rain": "小雨",
    Rain: "雨",
    "Heavy rain": "大雨",
    "Freezing rain": "冻雨",
    "Light snow": "小雪",
    Snow: "雪",
    "Heavy snow": "大雪",
    "Snow grains": "米雪",
    "Rain showers": "阵雨",
    Showers: "阵雨",
    "Heavy showers": "强阵雨",
    "Snow showers": "阵雪",
    Thunderstorm: "雷暴",
    "Thunderstorm with hail": "雷暴伴冰雹",
    "Weather code ": "天气代码 ",
    "Publication time unavailable": "发布时间不可用",
    "Choose English or Simplified Chinese": "请选择英语或简体中文",
    "Invalid theme": "无效的主题",
    "Day and night times must be different valid times":
      "浅色和深色开始时间必须有效且互不相同",
    "Enter valid numbers": "请输入有效数字",
    "Memory: 0 < warning < critical ≤ 100%": "内存：0 < 告警 < 严重 ≤ 100%",
    "Disk free: 0 ≤ critical < warning ≤ 100%":
      "磁盘可用空间：0 ≤ 严重 < 告警 ≤ 100%",
    "CPU temperature: 0 < warning < critical ≤ 125°C":
      "CPU 温度：0 < 告警 < 严重 ≤ 125°C",
    "GPU temperature: 0 < warning < critical ≤ 120°C":
      "GPU 温度：0 < 告警 < 严重 ≤ 120°C",
    "Duration must be 0–300s; hysteresis 0–20":
      "持续时间须为 0–300 秒；恢复余量须为 0–20",
    "Hysteresis must be smaller than each threshold gap":
      "恢复余量必须小于每组阈值的间距",
    "Rotation must be 10–86400 seconds": "轮换间隔须为 10–86400 秒",
    "Appearance values must be 0–100%": "外观参数须为 0–100%",
    "Enter a city (up to 100 characters)": "请输入城市，最多 100 个字符",
    "News feed must use HTTPS": "新闻订阅地址必须使用 HTTPS",
    "Enter a valid HTTPS feed URL": "请输入有效的 HTTPS 订阅地址",
    "Invalid settings": "无效的设置",
    "Invalid host": "无效的电脑地址",
    "Response too large": "响应内容过大",
    "Host must resolve to a private LAN IPv4 address":
      "电脑地址必须解析为局域网 IPv4 地址",
    "Invalid certificate fingerprint": "无效的证书指纹",
    "Collector certificate changed. Import a new setup code.":
      "采集器证书已改变，请导入新的配置码。",
    "Pairing expired or revoked. Import a new setup code.":
      "配对已失效或被撤销，请导入新的配置码。",
    "Expected a DeskPulse setup code": "请输入 DeskPulse 配置码",
    "Unsupported setup version": "不支持此配置版本",
    "Import a setup code to pair": "请导入配置码以配对",
    "Network disconnected": "网络已断开",
    "TLS verification failed. Check the setup code and phone clock.":
      "TLS 验证失败，请检查配置码和手机时间。",
    "Secure connection interrupted. Retrying.": "安全连接已中断，正在重试。",
    "Connection timed out. Check the host address and LAN firewall.":
      "连接超时，请检查电脑地址和局域网防火墙。",
    "Cannot reach collector. Check that it is running.":
      "无法连接采集器，请确认其正在运行。",
    "Host address could not be resolved.": "无法解析电脑地址。",
    "Request timed out": "请求超时",
    "Built-in background restored": "已恢复内置背景",
    "Folder access denied": "文件夹访问被拒绝",
    "Folder unavailable. Select the folder again.":
      "文件夹不可用，请重新选择。",
    "No supported images in folder": "文件夹中没有支持的图片",
    "Images unreadable. Choose another folder.":
      "图片无法读取，请选择其他文件夹。",
    "Use an HTTPS feed URL": "请使用 HTTPS 订阅地址",
    "City not found": "未找到城市",
    "No feed entries found": "订阅中没有内容",
    "Source HTTP ": "资讯源 HTTP ",
    "Collector HTTP ": "采集器 HTTP ",
    "Unavailable: Linux CPU temperature sensor not exposed or not readable":
      "不可用：Linux 内核未暴露 CPU 温度传感器，或当前用户没有读取权限",
  };
  const keys = Object.keys(zh).sort((a, b) => b.length - a.length);
  const fragments = new RegExp(
    "(^|[^A-Za-z])(" +
      keys
        .map(
          (key) =>
            key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            (/[A-Za-z]$/.test(key) ? "(?![A-Za-z])" : ""),
        )
        .join("|") +
      ")",
    "g",
  );
  function translate(value, language) {
    const text = String(value == null ? "" : value);
    if (language !== "zh") return text;
    if (Object.prototype.hasOwnProperty.call(zh, text)) return zh[text];
    // Compose trusted status fragments, e.g. update ages and sensor capability reasons.
    return text.replace(fragments, (_, prefix, key) => prefix + zh[key]);
  }
  function capture(element) {
    const nodes = [],
      attrs = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest("script,style")) continue;
      const source = node.nodeValue.trim().replace(/\s+/g, " ");
      if (source)
        nodes.push({
          node,
          source,
          leading: node.nodeValue.match(/^\s*/)[0],
          trailing: node.nodeValue.match(/\s*$/)[0],
        });
    }
    for (const target of element.querySelectorAll("[aria-label],[placeholder]"))
      for (const name of ["aria-label", "placeholder"])
        if (target.hasAttribute(name))
          attrs.push({ target, name, source: target.getAttribute(name) });
    return (language) => {
      for (const item of nodes)
        item.node.nodeValue =
          item.leading + translate(item.source, language) + item.trailing;
      for (const item of attrs)
        item.target.setAttribute(item.name, translate(item.source, language));
    };
  }
  const api = {
    translate,
    capture,
    locale: (language) => (language === "zh" ? "zh-CN" : "en-US"),
  };
  if (typeof module !== "undefined") module.exports = api;
  root.DeskPulseI18n = api;
})(typeof window !== "undefined" ? window : globalThis);

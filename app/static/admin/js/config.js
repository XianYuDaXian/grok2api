let apiKey = '';
let currentConfig = {};
let modelRoutingMeta = { models: [], pools: ['ssoBasic', 'ssoSuper', 'ssoHeavy'] };
let modelRoutingAssignments = {};
let modelRoutingDragId = '';
let currentConfigTab = 'runtime';
let statsigRefreshInFlight = false;
let currentStatsigInfo = {
  enabled: false,
  x_statsig_id: '',
  manual_statsig_id: '',
  effective_statsig_id: '',
  captured_at: '',
  user_agent: '',
  header_keys: [],
  seed: { value: '', present: false, updated_at: '', updated_mode: 'none', updated_mode_label: '未设置', source: 'none' },
  hex: { value: '', present: false, updated_at: '', updated_mode: 'none', updated_mode_label: '未设置', source: 'none' },
  xid: { value: '', present: false, updated_at: '', updated_mode: 'none', updated_mode_label: '未设置', source: 'none' },
  statsig_pure_enabled: false
};

function formatStatsigRefreshMode(mode, modeLabel) {
  const m = String(mode || '').toLowerCase();
  if (m === 'manual') return '手动刷新';
  if (m === 'auto') return '自动刷新';
  if (modeLabel) return String(modeLabel);
  return '未记录';
}

function formatStatsigValuePreview(value, maxLen = 18) {
  const v = String(value || '').trim();
  if (!v) return '未配置';
  if (v.length <= maxLen) return v;
  return `${v.slice(0, maxLen)}…`;
}

function buildStatsigValueStatusCard(title, item, options = {}) {
  const card = document.createElement('div');
  card.className = 'rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 space-y-2';
  const present = item && item.present;
  const modeText = formatStatsigRefreshMode(item && item.updated_mode, item && item.updated_mode_label);
  const at = formatLocalDateTime(item && item.updated_at);
  const preview = options.previewLabel
    ? options.previewLabel
    : formatStatsigValuePreview(item && item.value, options.maxLen || 20);
  const state = present ? '已配置' : '未配置';
  card.innerHTML = `
    <div class="text-sm font-medium">${escapeHtml(title)}</div>
    <div class="text-[11px] text-[var(--accents-4)]">状态：${escapeHtml(state)}</div>
    <div class="text-[11px] text-[var(--accents-4)]">最近更新：${escapeHtml(modeText)}</div>
    <div class="text-[11px] text-[var(--accents-4)]">时间：${escapeHtml(at || '—')}</div>
    <div class="text-xs font-mono break-all text-[var(--accents-5)]">${escapeHtml(preview)}</div>
  `;
  return card;
}

function refreshStatsigStatusPanel() {
  const summary = byId('statsig-value-summary');
  if (!summary) return;
  summary.replaceChildren();
  const pure = !!currentStatsigInfo.statsig_pure_enabled;
  const xidItem = currentStatsigInfo.xid || {};
  const xidCardOptions = {};
  if (!xidItem.present && pure && currentStatsigInfo.seed && currentStatsigInfo.seed.present && currentStatsigInfo.hex && currentStatsigInfo.hex.present) {
    xidCardOptions.previewLabel = '由 seed/hex 本地生成（每次请求计算）';
  }
  summary.appendChild(buildStatsigValueStatusCard('Seed', currentStatsigInfo.seed || {}));
  summary.appendChild(buildStatsigValueStatusCard('HEX', currentStatsigInfo.hex || {}));
  summary.appendChild(buildStatsigValueStatusCard('x-statsig-id', xidItem, xidCardOptions));

  const input = byId('statsig-value');
  if (input) {
    input.value = currentStatsigInfo.effective_statsig_id || '';
  }
  const sourceEl = byId('statsig-source-summary');
  if (sourceEl) {
    const src = currentStatsigInfo.source === 'manual'
      ? '手动覆盖'
      : (currentStatsigInfo.source === 'browser' ? '浏览器捕获' : (currentStatsigInfo.source === 'config' ? '配置 / seed·hex 生成' : '未生效'));
    const headerCount = Array.isArray(currentStatsigInfo.header_keys) ? currentStatsigInfo.header_keys.length : 0;
    sourceEl.textContent = `汇总：${src}；捕获 Header ${headerCount} 个；桥接 ${currentStatsigInfo.enabled ? '已启用' : '未启用'}`;
  }
}


const byId = (id) => document.getElementById(id);
const CONFIG_TAB_GROUPS = [
  { id: 'runtime', label: '系统配置', sections: ['app', 'chat', 'video', 'voice'] },
  { id: 'generation', label: '生成与资源', sections: ['image', 'asset', 'nsfw', 'usage'] },
  { id: 'scheduling', label: '任务调度', sections: ['token', 'retry', 'model_routing'] },
  { id: 'network', label: '网络代理', sections: ['proxy', 'cloakbrowser', '__statsig__'] },
  { id: 'storage', label: '缓存存储', sections: ['cache'] }
];
const NUMERIC_FIELDS = new Set([
  'timeout',
  'max_retry',
  'retry_backoff_base',
  'retry_backoff_factor',
  'retry_backoff_max',
  'retry_budget',
  'refresh_interval_hours',
  'super_refresh_interval_hours',
  'heavy_refresh_interval_hours',
  'fail_threshold',
  'limit_mb',
  'save_delay_ms',
  'upload_concurrent',
  'upload_timeout',
  'download_concurrent',
  'download_timeout',
  'list_concurrent',
  'list_timeout',
  'list_batch_size',
  'delete_concurrent',
  'delete_timeout',
  'delete_batch_size',
  'reload_interval_sec',
  'stream_timeout',
  'final_timeout',
  'final_min_bytes',
  'medium_min_bytes',
  'concurrent',
  'batch_size',
  'bridge_port',
  'nav_timeout_ms',
  'ready_timeout_ms',
  'idle_page_ms',
  'max_pages',
  'prewarm_concurrency',
  'wait_probe_timeout',
  'probe_cache_ttl_seconds'
]);

const LOCALE_MAP = {
  "app": {
    "label": "应用设置",
    "api_key": { title: "API 密钥", desc: "调用 Grok2API 服务的 Token（可选）。" },
    "app_key": { title: "后台密码", desc: "登录 Grok2API 管理后台的密码（必填）。" },
    "public_enabled": { title: "启用功能玩法", desc: "是否启用功能玩法入口（关闭则功能玩法页面不可访问）。" },
    "public_key": { title: "Public 密码", desc: "功能玩法页面的访问密码（可选）。" },
    "app_url": { title: "应用地址", desc: "当前 Grok2API 服务的外部访问 URL，用于文件链接访问。" },
    "image_format": { title: "图片格式", desc: "默认生成的图片格式（url 或 base64）。" },
    "video_format": { title: "视频格式", desc: "默认生成的视频格式（html 或 url，url 为处理后的链接）。" },
    "continue_conversation": { title: "沿用官网对话", desc: "开启后，Chat 页面会保存 Grok 官网会话编号，并在同一会话里继续提问。已上传过的附件会复用官网文件编号，减少重复上传。" },
    "reuse_grok_conversation": { title: "沿用官网对话", desc: "开启后，Chat 页面会保存 Grok 官网会话编号，并在同一会话里继续提问。已上传过的附件会复用官网文件编号，减少重复上传。" },
    "temporary": { title: "临时对话", desc: "是否默认启用临时对话模式。" },
    "disable_memory": { title: "禁用记忆", desc: "是否默认禁用 Grok 记忆功能。" },
    "stream": { title: "流式响应", desc: "是否默认启用流式输出。" },
    "thinking": { title: "思维链", desc: "是否默认启用思维链输出。" },
    "dynamic_statsig": { title: "动态指纹", desc: "是否默认启用动态生成 Statsig 指纹。" },
    "filter_tags": { title: "过滤标签", desc: "设置自动过滤 Grok 响应中的特殊标签。" },
    "app_log_enabled": { title: "应用运行日志", desc: "控制是否将服务运行日志写入 logs/app_YYYY-MM-DD.log，用于排查启动、接口错误和系统异常。" },
    "chat_capture_enabled": { title: "对话抓包日志", desc: "控制是否记录对话上游原始响应到抓包文件，用于排查图片来源、卡片附件和搜索结果关联问题。" },
    "chat_capture_file": { title: "对话抓包文件", desc: "对话抓包日志的写入路径，建议保留在 logs 目录下统一管理。" }
  },


  "proxy": {
    "label": "FlareSolverr 与代理",
    "base_proxy_url": { title: "基础代理 URL", desc: "代理请求到 Grok 官网的基础服务地址。" },
    "asset_proxy_url": { title: "资源代理 URL", desc: "代理请求到 Grok 官网的静态资源（图片/视频）地址。" },
    "enabled": { title: "启用 CF 自动刷新", desc: "启用后将通过 FlareSolverr 自动获取 cf_clearance。" },
    "flaresolverr_url": { title: "FlareSolverr 地址", desc: "FlareSolverr 服务的 HTTP 地址（如 http://flaresolverr:8191）。" },
    "refresh_interval": { title: "刷新间隔（秒）", desc: "自动刷新 cf_clearance 的时间间隔，建议不低于 300 秒。" },
    "timeout": { title: "挑战超时（秒）", desc: "等待 FlareSolverr 解决 CF 挑战的最大时间。" },
    "cf_clearance": { title: "CF Clearance", desc: "Cloudflare Clearance Cookie，用于绕过反爬虫验证。启用自动刷新时由系统自动管理。" },
    "browser": { title: "浏览器指纹", desc: "curl_cffi 浏览器指纹标识（如 chrome136）。启用自动刷新时由系统自动管理。" },
    "user_agent": { title: "User-Agent", desc: "HTTP 请求的 User-Agent 字符串。启用自动刷新时由系统自动管理。" },
    "statsig_pure_enabled": { title: "使用 seed/hex 生成 xid", desc: "开启后使用 Statsig Seed 与 Statsig HEX 在本地生成新的 x-statsig-id。当前推荐开启。" },
    "statsig_id": { title: "固定 x-statsig-id", desc: "手动固定完整 xid。填写后会直接使用该值。一般留空，优先使用 seed/hex 生成。" },
    "statsig_seed": { title: "Statsig Seed", desc: "真实页面捕获到的 seed。可以手动填写，也可以通过浏览器 probe 自动刷新。必须与 HEX 成对使用。" },
    "statsig_hex": { title: "Statsig HEX", desc: "真实页面捕获到的 HEX。可以手动填写，也可以通过浏览器 probe 自动刷新。必须与 Seed 成对使用。" },
    "statsig_use_browser_capture": { title: "使用浏览器捕获 xid", desc: "开启后优先使用浏览器请求中捕获到的完整 x-statsig-id。默认关闭。" }
  },


  "retry": {
    "label": "重试策略",
    "max_retry": { title: "最大重试次数", desc: "请求 Grok 服务失败时的最大重试次数。" },
    "retry_status_codes": { title: "重试状态码", desc: "触发重试的 HTTP 状态码列表。" },
    "retry_backoff_base": { title: "退避基数", desc: "重试退避的基础延迟（秒）。" },
    "retry_backoff_factor": { title: "退避倍率", desc: "重试退避的指数放大系数。" },
    "retry_backoff_max": { title: "退避上限", desc: "单次重试等待的最大延迟（秒）。" },
    "retry_budget": { title: "退避预算", desc: "单次请求的最大重试总耗时（秒）。" }
  },


  "chat": {
    "label": "对话配置",
    "concurrent": { title: "并发上限", desc: "Reverse 接口并发上限。" },
    "timeout": { title: "请求超时", desc: "Reverse 接口超时时间（秒）。" },
    "stream_timeout": { title: "流空闲超时", desc: "流式空闲超时时间（秒）。" }
  },


  "video": {
    "label": "视频配置",
    "concurrent": { title: "并发上限", desc: "Reverse 接口并发上限。" },
    "timeout": { title: "请求超时", desc: "Reverse 接口超时时间（秒）。" },
    "stream_timeout": { title: "流空闲超时", desc: "流式空闲超时时间（秒）。" }
  },


  "image": {
    "label": "图像配置",
    "timeout": { title: "请求超时", desc: "WebSocket 请求超时时间（秒）。" },
    "stream_timeout": { title: "流空闲超时", desc: "WebSocket 流式空闲超时时间（秒）。" },
    "final_timeout": { title: "最终图超时", desc: "收到中等图后等待最终图的超时秒数。" },
    "nsfw": { title: "NSFW 模式", desc: "WebSocket 请求是否启用 NSFW。" },
    "medium_min_bytes": { title: "中等图最小字节", desc: "判定中等质量图的最小字节数。" },
    "final_min_bytes": { title: "最终图最小字节", desc: "判定最终图的最小字节数（通常 JPG > 100KB）。" },
    "edit_return_first_image_immediately": { title: "编辑首图直返", desc: "开启后，管理页图片编辑接口拿到第一张结果图就立即返回，不再等待后续第二张图。" }
  },


  "asset": {
    "label": "资产配置",
    "upload_concurrent": { title: "上传并发", desc: "上传接口的最大并发数。推荐 30。" },
    "upload_timeout": { title: "上传超时", desc: "上传接口超时时间（秒）。推荐 60。" },
    "download_concurrent": { title: "下载并发", desc: "下载接口的最大并发数。推荐 30。" },
    "download_timeout": { title: "下载超时", desc: "下载接口超时时间（秒）。推荐 60。" },
    "list_concurrent": { title: "查询并发", desc: "资产查询接口的最大并发数。推荐 10。" },
    "list_timeout": { title: "查询超时", desc: "资产查询接口超时时间（秒）。推荐 60。" },
    "list_batch_size": { title: "查询批次大小", desc: "单次查询可处理的 Token 数量。推荐 10。" },
    "delete_concurrent": { title: "删除并发", desc: "资产删除接口的最大并发数。推荐 10。" },
    "delete_timeout": { title: "删除超时", desc: "资产删除接口超时时间（秒）。推荐 60。" },
    "delete_batch_size": { title: "删除批次大小", desc: "单次删除可处理的 Token 数量。推荐 10。" },
    "create_public_share_link": { title: "创建公共分享链接", desc: "开启后，图片、图片编辑和视频生成成功时会自动创建公共分享链接并写入元数据。" }
  },


  "voice": {
    "label": "语音配置",
    "timeout": { title: "请求超时", desc: "Voice 请求超时时间（秒）。" },
    "livekit_url": { title: "LiveKit 地址", desc: "优先使用的 LiveKit 信令地址，留空则使用上游返回值。" },
    "livekit_urls": { title: "LiveKit 地址列表", desc: "可配置多个信令地址，连接时会按顺序回退。" },
    "signal_proxy_enabled": { title: "Signal 代理", desc: "开启后返回同域 WebSocket 代理地址，移动端可优先尝试。" },
    "signal_proxy_url": { title: "代理地址", desc: "同域 signal 代理的自定义地址，留空将自动按当前域名生成。" }
  },


  "token": {
    "label": "Token 池管理",
    "auto_refresh": { title: "自动刷新", desc: "是否开启 Token 自动刷新机制。" },
    "refresh_interval_hours": { title: "刷新间隔", desc: "普通 Token 刷新的时间间隔（小时）。" },
    "super_refresh_interval_hours": { title: "Super 刷新间隔", desc: "Super Token 刷新的时间间隔（小时）。" },
    "heavy_refresh_interval_hours": { title: "Heavy 刷新间隔", desc: "Heavy Token 刷新的时间间隔（小时）。" },
    "refresh_unavailable_once": { title: "无可用 Token 时强刷一次", desc: "开启后，当请求首次检测到没有可用 Token 时，会对候选池中的异常 Token 强制刷新一次额度，然后立即再重试一次。" },
    "fail_threshold": { title: "失败阈值", desc: "单个 Token 连续失败多少次后被标记为不可用。" },
    "save_delay_ms": { title: "保存延迟", desc: "Token 变更合并写入的延迟（毫秒）。" },
    "reload_interval_sec": { title: "同步间隔", desc: "多 worker 场景下 Token 状态刷新间隔（秒）。" }
  },


  "model_routing": {
    "label": "模型池路由",
    "model_pools": { title: "模型到 Token 池映射", desc: "为每个模型手动指定使用哪个 Token 池。值支持字符串或字符串数组，例如 {\"grok-4.20-expert\":\"ssoSuper\",\"grok-4.20-auto\":[\"ssoBasic\",\"ssoSuper\"]}。" }
  },


  "cache": {
    "label": "缓存管理",
    "enable_auto_clean": { title: "自动清理", desc: "是否启用缓存自动清理，开启后按上限自动回收。" },
    "limit_mb": { title: "清理阈值", desc: "缓存大小阈值（MB），超过阈值会触发清理。" }
  },


  "nsfw": {
    "label": "NSFW 配置",
    "concurrent": { title: "并发上限", desc: "批量开启 NSFW 模式时的并发请求上限。推荐 10。" },
    "batch_size": { title: "批次大小", desc: "批量开启 NSFW 模式的单批处理数量。推荐 50。" },
    "timeout": { title: "请求超时", desc: "NSFW 开启相关请求的超时时间（秒）。推荐 60。" }
  },


  "usage": {
    "label": "Usage 配置",
    "concurrent": { title: "并发上限", desc: "批量刷新用量时的并发请求上限。推荐 10。" },
    "batch_size": { title: "批次大小", desc: "批量刷新用量的单批处理数量。推荐 50。" },
    "timeout": { title: "请求超时", desc: "用量查询接口的超时时间（秒）。推荐 60。" }
  },


  "cloakbrowser": {
    "label": "浏览器桥",
    "enabled": { title: "启用浏览器桥", desc: "开启后可使用真实浏览器刷新 seed/hex、捕获 xid 或同步会话。" },
    "headless": { title: "无头模式", desc: "关闭后可看到真实浏览器窗口，便于手动过验证和观察页面状态。" },
    "global_probe": { title: "全局 Probe", desc: "启用后同一份 x-statsig-id 和请求头可被多个 SSO 复用。" },
    "refresh_probe_on_403": { title: "403 时刷新 Probe", desc: "当 chat 请求返回 403 时，强制重新抓取一次真实浏览器 probe 并重试。" },
    "statsig_auto_refresh_enabled": { title: "自动刷新 seed/hex", desc: "开启后按间隔调用浏览器 probe，自动抓取并写回 Statsig Seed 与 HEX。" },
    "statsig_refresh_interval": { title: "seed/hex 刷新间隔（秒）", desc: "自动刷新 seed/hex 的间隔。建议 1800 秒或更长，过短会频繁拉起浏览器。" },
    "sync_session": { title: "同步真实会话", desc: "启用后将浏览器抓到的 Cookie、UA 和请求头同步给 HTTP reverse。默认关闭，优先使用上游动态 Statsig 方案。" },
    "profile_session": { title: "复用浏览器 Profile", desc: "允许直接使用浏览器 profile 中已登录的 Grok 会话。" },
    "session_cookies_json": { title: "会话 Cookies JSON", desc: "用于初始化浏览器桥会话。浏览器 probe 或浏览器桥对话成功后，会自动写回最新 cookies；Cookie 失效后也可以重新粘贴。" },
    "manual_statsig_id": { title: "临时 x-statsig-id", desc: "临时手动覆盖完整 xid。浏览器成功捕获有效值后会自动清空手动值并改用捕获结果。" },
    "prewarm_on_start": { title: "启动预热", desc: "服务启动时自动准备浏览器会话与 probe。默认关闭，避免无必要拉起浏览器。" },
    "prewarm_blocking": { title: "阻塞预热", desc: "启用后应用启动完成前会等待浏览器预热结束。通常不建议开启。" },
    "prewarm_mode": { title: "预热模式", desc: "session 只同步会话，probe 还会抓一份可复用的真实 chat headers。" },
    "refresh_probe_on_sse_start": { title: "SSE 开始后自动刷新", desc: "收到流式响应开头时就后台刷新下一份 probe。建议关闭，优先长期复用当前有效 statsig。" },
    "wait_probe_before_request": { title: "请求前等待 Probe", desc: "若后台正在刷新 probe，请求发起前短暂等待其完成。" },
    "wait_probe_timeout": { title: "等待 Probe 超时", desc: "请求前等待后台 probe 完成的最长时间（秒）。" },
    "refresh_probe_after_success": { title: "成功后自动刷新", desc: "每次 chat 成功结束后刷新下一份 probe。建议关闭，避免无必要轮换 x-statsig-id。" },
    "private_chat_url": { title: "Probe 入口 URL", desc: "浏览器抓取 probe 时优先进入的页面地址。" },
    "probe_message": { title: "Probe 文本", desc: "触发真实浏览器 app-chat 请求时发送的探针文本。" },
    "use_system_proxy": { title: "复用系统代理", desc: "让 CloakBrowser 与 FlareSolverr 使用相同的 proxy.base_proxy_url 出口，保证 cf_clearance 与浏览器 IP 一致。" },
    "cf_before_probe": { title: "Probe 前按需刷新 CF", desc: "仅在 cf_clearance 缺失、过期或上次 probe 因 CF 失败时，才通过 FlareSolverr 刷新并注入浏览器。" },
    "keep_bridge_alive": { title: "Bridge 常驻", desc: "probe 完成后保持 CloakBrowser Bridge 进程运行，复用已过 CF 的页面与 profile。" },
    "minimal_page_load": { title: "最少加载", desc: "不等页面全部资源加载完成，只等待聊天输入框出现；并拦截统计脚本等，避免转圈导致 xid probe 超时。" },
    "retain_static_cache": { title: "保留静态资源缓存", desc: "开启后图片/字体/样式等会正常加载并写入浏览器 profile 磁盘缓存，二次 probe 更快。关闭则 abort 静态资源以进一步减负。" },
    "chat_input_timeout_ms": { title: "输入框等待超时（毫秒）", desc: "最少加载模式下等待聊天输入框出现的超时时间。默认 15000。" }
  }
};

// 配置部分说明（可选）
const SECTION_DESCRIPTIONS = {
  "proxy": "这里配置 FlareSolverr 与代理。服务首次请求 Grok 时的 IP 必须与获取 CF Clearance 时的 IP 一致。",
  "model_routing": "这里可以手动指定每个模型优先走哪个 Token 池。未配置的模型仍会按系统默认路由。",
  "cloakbrowser": "浏览器桥只负责提供真实浏览器环境。Statsig 的 seed、hex 与 xid 在下方 Statsig 修复区域统一管理。"
};

// CF 自动刷新联动禁用字段（全部在 proxy section 内）
const CF_MANAGED_PROXY_KEYS = ['cf_clearance', 'browser', 'user_agent'];
const CF_REFRESH_SUB_KEYS = ['flaresolverr_url', 'refresh_interval', 'timeout'];
const STATSIG_REFRESH_SUB_KEYS = ['statsig_refresh_interval'];

const SECTION_ORDER = new Map(Object.keys(LOCALE_MAP).map((key, index) => [key, index]));
const HIDDEN_CONFIG_KEYS = new Map([
  ['app', new Set(['reuse_grok_conversation', 'dynamic_statsig'])],
  ['chat', new Set(['capture_enabled', 'capture_file'])],
  ['proxy', new Set([
    'statsig_pure_enabled',
    'statsig_id',
    'statsig_seed',
    'statsig_hex',
    'statsig_use_browser_capture'
  ])],
  ['cloakbrowser', new Set([
    'mode',
    'auto_install_bridge_deps',
    'deps_install_timeout',
    'auto_install_system_deps',
    'chrome_cookie_sync',
    'bridge_host',
    'bridge_port',
    'timeout',
    'nav_timeout_ms',
    'ready_timeout_ms',
    'idle_page_ms',
    'max_pages',
    'chat_first',
    'global_probe',
    'refresh_probe_on_403',
    'statsig_auto_refresh_enabled',
    'statsig_refresh_interval',
    'sync_session',
    'profile_session',
    'prewarm_on_start',
    'prewarm_blocking',
    'prewarm_mode',
    'refresh_probe_on_sse_start',
    'wait_probe_before_request',
    'wait_probe_timeout',
    'refresh_probe_after_success',
    'private_chat_url',
    'probe_message',
    'cf_before_probe',
    'keep_bridge_alive',
    'minimal_page_load',
    'retain_static_cache',
    'prewarm_concurrency',
    'probe_cache_file',
    'probe_cache_ttl_seconds',
    'probe_consume_upstream',
    'node_binary',
    'executable_path',
    'profile_dir',
    'manual_statsig_id',
    'chat_input_timeout_ms'
  ])],
]);

function getText(section, key) {
  if (LOCALE_MAP[section] && LOCALE_MAP[section][key]) {
    return LOCALE_MAP[section][key];
  }
  return {
    title: key.replace(/_/g, ' '),
    desc: '暂无说明，请参考配置文档。'
  };
}

function getSectionLabel(section) {
  return (LOCALE_MAP[section] && LOCALE_MAP[section].label) || `${section} 设置`;
}

function sortByOrder(keys, orderMap) {
  if (!orderMap) return keys;
  return keys.sort((a, b) => {
    const ia = orderMap.get(a);
    const ib = orderMap.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return 0;
  });
}

function setInputMeta(input, section, key) {
  input.dataset.section = section;
  input.dataset.key = key;
}

function createOption(value, text, selectedValue) {
  const option = document.createElement('option');
  option.value = value;
  option.text = text;
  if (selectedValue !== undefined && selectedValue === value) option.selected = true;
  return option;
}

function buildBooleanInput(section, key, val) {
  const label = document.createElement('label');
  label.className = 'relative inline-flex items-center cursor-pointer';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = val;
  input.className = 'sr-only peer';
  setInputMeta(input, section, key);

  const slider = document.createElement('div');
  slider.className = "w-9 h-5 bg-[var(--accents-2)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black";

  label.appendChild(input);
  label.appendChild(slider);

  return { input, node: label };
}

function buildSelectInput(section, key, val, options) {
  const input = document.createElement('select');
  input.className = 'geist-input h-[34px]';
  setInputMeta(input, section, key);
  options.forEach(opt => {
    input.appendChild(createOption(opt.val, opt.text, val));
  });
  return { input, node: input };
}

function buildJsonInput(section, key, val) {
  const input = document.createElement('textarea');
  input.className = 'geist-input font-mono text-xs';
  input.rows = 4;
  input.value = JSON.stringify(val, null, 2);
  setInputMeta(input, section, key);
  input.dataset.type = 'json';
  return { input, node: input };
}

function buildTextInput(section, key, val) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'geist-input';
  input.value = val;
  setInputMeta(input, section, key);
  return { input, node: input };
}

function buildSecretInput(section, key, val) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'geist-input flex-1 h-[34px]';
  input.value = val;
  setInputMeta(input, section, key);

  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2';

  const genBtn = document.createElement('button');
  genBtn.className = 'flex-none w-[32px] h-[32px] flex items-center justify-center bg-black text-white rounded-md hover:opacity-80 transition-opacity';
  genBtn.type = 'button';
  genBtn.title = '生成';
  genBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>`;
  genBtn.onclick = () => {
    input.value = randomKey(16);
  };

  const copyBtn = document.createElement('button');
  copyBtn.className = 'flex-none w-[32px] h-[32px] flex items-center justify-center bg-black text-white rounded-md hover:opacity-80 transition-opacity';
  copyBtn.type = 'button';
  copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.onclick = () => copyToClipboard(input.value, copyBtn);

  wrapper.appendChild(input);
  wrapper.appendChild(genBtn);
  wrapper.appendChild(copyBtn);

  return { input, node: wrapper };
}

function randomKey(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const out = [];
  if (window.crypto && window.crypto.getRandomValues) {
    const buf = new Uint8Array(len);
    window.crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) {
      out.push(chars[buf[i] % chars.length]);
    }
    return out.join('');
  }
  for (let i = 0; i < len; i++) {
    out.push(chars[Math.floor(Math.random() * chars.length)]);
  }
  return out.join('');
}

async function init() {
  apiKey = await ensureAdminKey();
  if (apiKey === null) return;
  await loadModelRoutingMeta();
  await loadStatsigStatus();
  loadData();
}

async function loadStatsigStatus() {
  try {
    const res = await fetch('/v1/admin/config/statsig', {
      headers: buildAuthHeaders(apiKey)
    });
    if (!res.ok) return;
    const data = await res.json();
    currentStatsigInfo = data && data.data ? data.data : currentStatsigInfo;
    refreshStatsigStatusPanel();
  } catch (e) {
    console.warn('x-statsig-id 状态加载失败', e);
  }
}

async function loadModelRoutingMeta() {
  try {
    const res = await fetch('/v1/admin/model-routing/meta', {
      headers: buildAuthHeaders(apiKey)
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.models)) {
      modelRoutingMeta.models = data.models;
    }
    if (Array.isArray(data.pools) && data.pools.length) {
      modelRoutingMeta.pools = data.pools;
    }
  } catch (e) {
    console.warn('模型池路由元数据加载失败', e);
  }
}

async function loadData() {
  try {
    const res = await fetch('/v1/admin/config', {
      headers: buildAuthHeaders(apiKey)
    });
    if (res.ok) {
      currentConfig = await res.json();
      ensureConfigShape(currentConfig);
      renderConfig(currentConfig);
    } else if (res.status === 401) {
      logout();
    }
  } catch (e) {
    showToast('连接失败', 'error');
  }
}

function ensureConfigShape(data) {
  if (!data || typeof data !== 'object') return;
  if (!data.cloakbrowser || typeof data.cloakbrowser !== 'object') {
    data.cloakbrowser = {};
  }
  if (!Object.prototype.hasOwnProperty.call(data.cloakbrowser, 'statsig_auto_refresh_enabled')) {
    data.cloakbrowser.statsig_auto_refresh_enabled = false;
  }
  if (!Object.prototype.hasOwnProperty.call(data.cloakbrowser, 'statsig_refresh_interval')) {
    data.cloakbrowser.statsig_refresh_interval = 1800;
  }
}

function renderConfig(data) {
  const container = byId('config-container');
  if (!container) return;
  container.replaceChildren();
  renderConfigTabs();

  const sections = sortByOrder(Object.keys(data), SECTION_ORDER);
  const sectionCardMap = new Map();
  sections.forEach(section => {
    const card = buildSectionCard(section, data[section]);
    if (card) {
      sectionCardMap.set(section, card);
    }
  });

  CONFIG_TAB_GROUPS.forEach(group => {
    const panel = document.createElement('section');
    panel.className = `config-panel${group.id === currentConfigTab ? ' active' : ''}`;
    panel.dataset.tab = group.id;

    group.sections.forEach(section => {
      if (section === '__statsig__') {
        panel.appendChild(buildStatsigSectionCard());
        return;
      }
      const card = sectionCardMap.get(section);
      if (card) {
        panel.appendChild(card);
      }
    });

    if (!panel.children.length) {
      const empty = document.createElement('div');
      empty.className = 'text-center py-12 text-[var(--accents-4)]';
      empty.textContent = '当前分类暂无配置项。';
      panel.appendChild(empty);
    }

    container.appendChild(panel);
  });

  // 初始化 CF 自动刷新联动状态
  const cfEnabled = data.proxy && data.proxy.enabled;
  applyCfRefreshState(cfEnabled);
  const statsigRefreshEnabled = data.cloakbrowser && data.cloakbrowser.statsig_auto_refresh_enabled;
  applyStatsigRefreshState(statsigRefreshEnabled);
}

function renderConfigTabs() {
  const tabs = byId('config-tabs');
  if (!tabs) return;
  tabs.replaceChildren();

  CONFIG_TAB_GROUPS.forEach(group => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `config-tab${group.id === currentConfigTab ? ' active' : ''}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', group.id === currentConfigTab ? 'true' : 'false');
    btn.textContent = group.label;
    btn.addEventListener('click', () => {
      currentConfigTab = group.id;
      renderConfigTabs();
      document.querySelectorAll('.config-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === currentConfigTab);
      });
    });
    tabs.appendChild(btn);
  });
}

function buildSectionCard(section, items) {
  const localeSection = LOCALE_MAP[section];
  const keyOrder = localeSection ? new Map(Object.keys(localeSection).map((k, i) => [k, i])) : null;

  const allKeys = sortByOrder(Object.keys(items), keyOrder);
  const hiddenKeys = HIDDEN_CONFIG_KEYS.get(section) || new Set();
  const visibleKeys = allKeys.filter(key => !(section === 'proxy' && key === 'cf_cookies') && !hiddenKeys.has(key));
  if (!visibleKeys.length) {
    return null;
  }

  const card = document.createElement('div');
  card.className = 'config-section';

  const header = document.createElement('div');
  header.innerHTML = `<div class="config-section-title">${getSectionLabel(section)}</div>`;

  if (section === 'proxy') {
    const actionRow = document.createElement('div');
    actionRow.className = 'config-section-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.id = 'cf-refresh-btn';
    refreshBtn.className = 'geist-button-outline gap-2';
    refreshBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 2v6h-6"></path>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
        <path d="M3 22v-6h6"></path>
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
      </svg>
      手动刷新 CF
    `;
    refreshBtn.addEventListener('click', manualRefreshCfClearance);
    actionRow.appendChild(refreshBtn);
    header.appendChild(actionRow);
  }

  if (SECTION_DESCRIPTIONS[section]) {
    const descP = document.createElement('p');
    descP.className = 'text-[var(--accents-4)] text-sm mt-1 mb-4';
    descP.textContent = SECTION_DESCRIPTIONS[section];
    header.appendChild(descP);
  }

  card.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'config-grid';
  visibleKeys.forEach(key => {
    const fieldCard = buildFieldCard(section, key, items[key]);
    grid.appendChild(fieldCard);
  });
  card.appendChild(grid);

  if (section === 'app') {
    const footerActions = document.createElement('div');
    footerActions.className = 'config-footer-actions';
    const clearLogsBtn = document.createElement('button');
    clearLogsBtn.type = 'button';
    clearLogsBtn.id = 'clear-logs-btn';
    clearLogsBtn.className = 'geist-button-danger gap-2';
    clearLogsBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18"></path>
        <path d="M8 6V4h8v2"></path>
        <path d="M19 6l-1 14H6L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
      </svg>
      清空日志文件夹
    `;
    clearLogsBtn.addEventListener('click', clearLogsDirectory);
    card.appendChild(footerActions);
    footerActions.appendChild(clearLogsBtn);
  }

  return card;
}

function buildStatsigSectionCard() {
  const card = document.createElement('div');
  card.className = 'config-section';

  const header = document.createElement('div');
  header.innerHTML = `<div class="config-section-title">Statsig 修复</div>`;

  const descP = document.createElement('p');
  descP.className = 'text-[var(--accents-4)] text-sm mt-1 mb-4';
  descP.textContent = '这里集中管理 seed、hex 与 x-statsig-id。seed/hex 用于本地生成 xid，完整 xid 可手动固定或由浏览器捕获。';
  header.appendChild(descP);

  card.appendChild(header);
  card.appendChild(buildStatsigPanel());
  return card;
}

function buildStatsigConfigGroup(title, desc, fields) {
  const group = document.createElement('div');
  group.className = 'rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3';

  const titleEl = document.createElement('div');
  titleEl.className = 'text-sm font-medium';
  titleEl.textContent = title;
  group.appendChild(titleEl);

  if (desc) {
    const descEl = document.createElement('p');
    descEl.className = 'text-xs text-[var(--accents-4)]';
    descEl.textContent = desc;
    group.appendChild(descEl);
  }

  const grid = document.createElement('div');
  grid.className = 'config-grid';
  fields.forEach(item => {
    const sectionConfig = currentConfig && currentConfig[item.section];
    if (!sectionConfig || !Object.prototype.hasOwnProperty.call(sectionConfig, item.key)) {
      return;
    }
    grid.appendChild(buildFieldCard(item.section, item.key, sectionConfig[item.key]));
  });

  if (!grid.children.length) {
    return null;
  }

  group.appendChild(grid);
  return group;
}

async function manualRefreshCfClearance() {
  const btn = byId('cf-refresh-btn');
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    刷新中...
  `;
  try {
    const res = await fetch('/v1/admin/config/cf-refresh', {
      method: 'POST',
      headers: buildAuthHeaders(apiKey)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) {
      throw new Error(data.detail || data.message || '已有刷新任务进行中');
    }
    throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    }
    showToast(data.message || 'CF Clearance 已刷新', 'success');
    await loadData();
  } catch (e) {
    showToast(`刷新失败: ${e.message || e}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function buildStatsigPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3';

  const top = document.createElement('div');
  top.className = 'flex flex-col gap-1';

  const titleBox = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'text-sm font-medium';
  title.textContent = '当前状态';
  const desc = document.createElement('div');
  desc.className = 'text-xs text-[var(--accents-4)] mt-1';
  desc.textContent = currentStatsigInfo.enabled
    ? '这里显示当前实际生效的 xid 来源。seed/hex 是推荐路径，完整 xid 只作为覆盖兜底。'
    : '当前未启用浏览器桥，无法自动刷新 seed/hex 或捕获完整 xid。';
  titleBox.appendChild(title);
  titleBox.appendChild(desc);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'statsig-refresh-btn';
  btn.className = 'geist-button-outline gap-2 w-full md:w-auto justify-center';
  btn.disabled = !currentStatsigInfo.enabled;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 2v6h-6"></path>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
      <path d="M3 22v-6h6"></path>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
    </svg>
    手动刷新 seed/hex
  `;
  btn.addEventListener('click', manualRefreshStatsig);

  top.appendChild(titleBox);

  const summary = document.createElement('div');
  summary.id = 'statsig-value-summary';
  summary.className = 'grid gap-3 md:grid-cols-1 lg:grid-cols-3';
  summary.appendChild(buildStatsigValueStatusCard('Seed', currentStatsigInfo.seed || {}));
  summary.appendChild(buildStatsigValueStatusCard('HEX', currentStatsigInfo.hex || {}));
  summary.appendChild(buildStatsigValueStatusCard('x-statsig-id', currentStatsigInfo.xid || {}, (
    (!currentStatsigInfo.xid || !currentStatsigInfo.xid.present) && currentStatsigInfo.statsig_pure_enabled
      ? { previewLabel: '由 seed/hex 本地生成（每次请求计算）' }
      : {}
  )));

  const sourceSummary = document.createElement('div');
  sourceSummary.id = 'statsig-source-summary';
  sourceSummary.className = 'text-xs text-[var(--accents-4)]';
  const headerCount = Array.isArray(currentStatsigInfo.header_keys) ? currentStatsigInfo.header_keys.length : 0;
  const srcLabel = currentStatsigInfo.source === 'manual'
    ? '手动覆盖'
    : (currentStatsigInfo.source === 'browser' ? '浏览器捕获' : (currentStatsigInfo.source === 'config' ? '配置 / seed·hex 生成' : '未生效'));
  sourceSummary.textContent = `汇总：${srcLabel}；捕获 Header ${headerCount} 个；桥接 ${currentStatsigInfo.enabled ? '已启用' : '未启用'}`;

  const effectiveLabel = document.createElement('div');
  effectiveLabel.className = 'text-xs font-medium text-[var(--accents-5)]';
  effectiveLabel.textContent = '当前生效值';

  const input = document.createElement('textarea');
  input.id = 'statsig-value';
  input.className = 'geist-input font-mono text-xs min-h-[90px]';
  input.readOnly = true;
  input.value = currentStatsigInfo.effective_statsig_id || '';
  input.placeholder = currentStatsigInfo.enabled ? '尚未捕获到 x-statsig-id' : '未启用 CloakBrowser bridge';

  const statusGroup = document.createElement('div');
  statusGroup.className = 'rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3';
  statusGroup.appendChild(top);
  statusGroup.appendChild(summary);
  statusGroup.appendChild(sourceSummary);
  statusGroup.appendChild(effectiveLabel);
  statusGroup.appendChild(input);

  const seedHexGroup = buildStatsigConfigGroup(
    'seed/hex 配对',
    '推荐路径。自动刷新会通过浏览器 probe 写回 Seed 与 HEX；手动填写后保存配置即可生效。',
    [
      { section: 'cloakbrowser', key: 'statsig_auto_refresh_enabled' },
      { section: 'cloakbrowser', key: 'statsig_refresh_interval' },
      { section: 'proxy', key: 'statsig_pure_enabled' },
      { section: 'proxy', key: 'statsig_seed' },
      { section: 'proxy', key: 'statsig_hex' }
    ]
  );

  if (seedHexGroup) {
    const refreshRow = document.createElement('div');
    refreshRow.className = 'flex flex-col gap-2 md:flex-row md:items-center md:justify-between';

    const refreshHint = document.createElement('div');
    refreshHint.className = 'text-xs text-[var(--accents-4)]';
    refreshHint.textContent = '手动刷新会立即打开浏览器 probe，并尝试更新 Seed 与 HEX。';

    refreshRow.appendChild(refreshHint);
    refreshRow.appendChild(btn);
    seedHexGroup.appendChild(refreshRow);
  }

  const xidGroup = buildStatsigConfigGroup(
    'xid 覆盖',
    '完整 xid 用于临时排查。长期建议留空，让 seed/hex 为每次请求生成新的 x-statsig-id。',
    [
      { section: 'proxy', key: 'statsig_id' },
      { section: 'proxy', key: 'statsig_use_browser_capture' }
    ]
  ) || document.createElement('div');
  if (!xidGroup.className) {
    xidGroup.className = 'rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3';
  }

  const manualLabel = document.createElement('div');
  manualLabel.className = 'text-xs font-medium text-[var(--accents-5)]';
  manualLabel.textContent = '临时手动 x-statsig-id';

  const manualInput = document.createElement('textarea');
  manualInput.id = 'statsig-manual-value';
  manualInput.className = 'geist-input font-mono text-xs min-h-[90px]';
  manualInput.readOnly = false;
  manualInput.value = currentStatsigInfo.manual_statsig_id || '';
  manualInput.placeholder = '留空则使用浏览器捕获值；保存后临时覆盖当前生效值';

  const actionRow = document.createElement('div');
  actionRow.className = 'flex flex-col gap-2 md:flex-row';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.id = 'statsig-save-btn';
  saveBtn.className = 'geist-button gap-2 w-full md:w-auto justify-center';
  saveBtn.textContent = '保存手动 x-statsig-id';
  saveBtn.addEventListener('click', saveManualStatsig);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.id = 'statsig-clear-btn';
  clearBtn.className = 'geist-button-outline gap-2 w-full md:w-auto justify-center';
  clearBtn.textContent = '清空手动值';
  clearBtn.addEventListener('click', clearManualStatsig);

  actionRow.appendChild(saveBtn);
  actionRow.appendChild(clearBtn);

  const meta = document.createElement('div');
  meta.className = 'text-xs text-[var(--accents-4)] flex flex-col gap-1';
  meta.innerHTML = `
    <div>固定 xid 和临时 xid 的作用相同，都是完整值覆盖。临时值由本区域单独保存。</div>
    <div>浏览器捕获完整 xid 可作为兜底，但推荐优先使用 seed/hex 生成。</div>
  `;

  xidGroup.appendChild(manualLabel);
  xidGroup.appendChild(manualInput);
  xidGroup.appendChild(actionRow);
  xidGroup.appendChild(meta);

  wrap.appendChild(statusGroup);
  if (seedHexGroup) {
    wrap.appendChild(seedHexGroup);
  }
  wrap.appendChild(xidGroup);
  return wrap;
}

async function manualRefreshStatsig() {
  const btn = byId('statsig-refresh-btn');
  const input = byId('statsig-value');
  if (!btn) return;
  if (statsigRefreshInFlight) {
    showToast('已有刷新任务进行中，请稍候', 'warning');
    return;
  }
  statsigRefreshInFlight = true;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    刷新中...
  `;
  try {
    const res = await fetch('/v1/admin/config/statsig-refresh', {
      method: 'POST',
      headers: buildAuthHeaders(apiKey)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error(data.detail || data.message || '已有 seed/hex 刷新任务进行中，请稍候');
      }
      throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    }
    currentStatsigInfo = data && data.data ? data.data : currentStatsigInfo;
    if (input) {
      input.value = currentStatsigInfo.effective_statsig_id || '';
    }
    showToast('seed/hex 已刷新', 'success');
    await loadData();
  } catch (e) {
    showToast(`刷新失败: ${e.message || e}`, 'error');
  } finally {
    statsigRefreshInFlight = false;
    btn.disabled = !currentStatsigInfo.enabled;
    btn.innerHTML = originalHtml;
  }
}

async function saveManualStatsig() {
  const btn = byId('statsig-save-btn');
  const input = byId('statsig-manual-value');
  if (!btn || !input) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    const res = await fetch('/v1/admin/config/statsig-manual', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(apiKey),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        manual_statsig_id: input.value || ''
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    }
    currentStatsigInfo = data && data.data ? data.data : currentStatsigInfo;
    const effectiveBox = byId('statsig-value');
    if (effectiveBox) {
      effectiveBox.value = currentStatsigInfo.effective_statsig_id || '';
    }
    showToast(data.message || '手动 x-statsig-id 已更新', 'success');
    await loadData();
  } catch (e) {
    showToast(`保存失败: ${e.message || e}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function clearManualStatsig() {
  const input = byId('statsig-manual-value');
  if (input) {
    input.value = '';
  }
  await saveManualStatsig();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLocalDateTime(value) {
  if (!value) return '未捕获';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

async function clearLogsDirectory() {
  const btn = byId('clear-logs-btn');
  if (!btn) return;
  const confirmed = window.confirm('将清空 logs 文件夹中的全部日志文件，是否继续？');
  if (!confirmed) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    清理中...
  `;

  try {
    const res = await fetch('/v1/admin/config/clear-logs', {
      method: 'POST',
      headers: buildAuthHeaders(apiKey)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.message || `HTTP ${res.status}`);
    }
    const info = data.data || {};
    const filesText = Number(info.deleted_files || 0);
    const dirsText = Number(info.deleted_dirs || 0);
    const bytesText = formatBytes(info.released_bytes || 0);
    showToast(`已清空日志：${filesText} 个文件，${dirsText} 个目录，释放 ${bytesText}`, 'success');
  } catch (e) {
    showToast(`清空失败: ${e.message || e}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function normalizeModelRoutingAssignments(raw) {
  const next = {};
  const source = raw && typeof raw === 'object' ? raw : {};
  Object.entries(source).forEach(([modelId, value]) => {
    if (typeof value === 'string' && value.trim()) {
      next[modelId] = value.trim();
      return;
    }
    if (Array.isArray(value)) {
      const first = value.map(item => String(item).trim()).find(Boolean);
      if (first) next[modelId] = first;
    }
  });
  return next;
}

function buildModelRoutingInput(section, key, val) {
  modelRoutingAssignments = normalizeModelRoutingAssignments(val);

  const wrapper = document.createElement('div');
  wrapper.className = 'routing-board';
  wrapper.dataset.type = 'model-routing';
  wrapper.dataset.section = section;
  wrapper.dataset.key = key;

  const leftPane = document.createElement('div');
  leftPane.className = 'routing-pane routing-pane-models';
  leftPane.innerHTML = `
    <div class="routing-pane-header">
      <div class="routing-pane-title">模型列表</div>
      <div class="routing-pane-subtitle">拖到右侧池中即可指定路由，拖回这里表示按系统默认池处理。</div>
    </div>
  `;

  const unassignedZone = document.createElement('div');
  unassignedZone.className = 'routing-dropzone routing-dropzone-source';
  unassignedZone.dataset.pool = '';
  registerRoutingDropzone(unassignedZone, '');

  const rightPane = document.createElement('div');
  rightPane.className = 'routing-pane routing-pane-pools';
  rightPane.innerHTML = `
    <div class="routing-pane-header">
      <div class="routing-pane-title">Token 池</div>
      <div class="routing-pane-subtitle">模型放到哪个池，后端请求就优先走哪个池。</div>
    </div>
  `;

  const poolGrid = document.createElement('div');
  poolGrid.className = 'routing-pool-grid';
  const pools = Array.isArray(modelRoutingMeta.pools) && modelRoutingMeta.pools.length
    ? modelRoutingMeta.pools
    : ['ssoBasic', 'ssoSuper', 'ssoHeavy'];

  pools.forEach(poolName => {
    const card = document.createElement('div');
    card.className = 'routing-pool-card';

    const header = document.createElement('div');
    header.className = 'routing-pool-header';
    header.innerHTML = `
      <div class="routing-pool-title">${poolName}</div>
      <div class="routing-pool-hint">拖拽模型到这里</div>
    `;

    const zone = document.createElement('div');
    zone.className = 'routing-dropzone routing-dropzone-pool';
    zone.dataset.pool = poolName;
    registerRoutingDropzone(zone, poolName);

    card.appendChild(header);
    card.appendChild(zone);
    poolGrid.appendChild(card);
  });

  leftPane.appendChild(unassignedZone);
  rightPane.appendChild(poolGrid);
  wrapper.appendChild(leftPane);
  wrapper.appendChild(rightPane);

  renderModelRoutingBoard(wrapper);
  return { input: wrapper, node: wrapper };
}

function registerRoutingDropzone(zone, poolName) {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('is-over');
  });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    const modelId = event.dataTransfer.getData('text/plain') || modelRoutingDragId;
    if (!modelId) return;
    if (poolName) {
      modelRoutingAssignments[modelId] = poolName;
    } else {
      delete modelRoutingAssignments[modelId];
    }
    const board = zone.closest('.routing-board');
    if (board) renderModelRoutingBoard(board);
    modelRoutingDragId = '';
  });
}

function createModelChip(model) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'routing-chip';
  chip.draggable = true;
  chip.dataset.modelId = model.id;
  chip.innerHTML = `
    <span class="routing-chip-name">${model.display_name || model.id}</span>
    <span class="routing-chip-id">${model.id}</span>
  `;

  chip.addEventListener('dragstart', (event) => {
    modelRoutingDragId = model.id;
    event.dataTransfer.setData('text/plain', model.id);
    event.dataTransfer.effectAllowed = 'move';
    chip.classList.add('is-dragging');
  });
  chip.addEventListener('dragend', () => {
    chip.classList.remove('is-dragging');
    modelRoutingDragId = '';
    document.querySelectorAll('.routing-dropzone.is-over').forEach((node) => {
      node.classList.remove('is-over');
    });
  });

  return chip;
}

function renderModelRoutingBoard(board) {
  const models = Array.isArray(modelRoutingMeta.models) ? [...modelRoutingMeta.models] : [];
  models.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const sourceZone = board.querySelector('.routing-dropzone-source');
  const poolZones = Array.from(board.querySelectorAll('.routing-dropzone-pool'));
  if (!sourceZone) return;

  sourceZone.replaceChildren();
  poolZones.forEach(zone => zone.replaceChildren());

  const assignedModelIds = new Set();
  poolZones.forEach(zone => {
    const poolName = zone.dataset.pool || '';
    const assigned = models.filter(model => modelRoutingAssignments[model.id] === poolName);
    assigned.forEach(model => {
      assignedModelIds.add(model.id);
      zone.appendChild(createModelChip(model));
    });
    if (!assigned.length) {
      zone.appendChild(createRoutingEmptyState('拖拽模型到这里'));
    }
  });

  const unassigned = models.filter(model => !assignedModelIds.has(model.id));
  unassigned.forEach(model => {
    sourceZone.appendChild(createModelChip(model));
  });
  if (!unassigned.length) {
    sourceZone.appendChild(createRoutingEmptyState('所有模型都已分配到池'));
  }
}

function createRoutingEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'routing-empty';
  empty.textContent = text;
  return empty;
}

function applyCfRefreshState(enabled) {
  // 设置字段禁用状态的辅助函数
  function setFieldDisabled(section, key, disabled) {
    const input = document.querySelector(
      `input[data-section="${section}"][data-key="${key}"],` +
      `textarea[data-section="${section}"][data-key="${key}"],` +
      `select[data-section="${section}"][data-key="${key}"]`
    );
    if (!input) return;
    input.disabled = disabled;
    // 找到最近的 .config-field 父元素设置样式
    const field = input.closest('.config-field');
    if (field) {
      field.style.opacity = disabled ? '0.45' : '';
      field.style.pointerEvents = disabled ? 'none' : '';
    }
  }

  // enabled=true → 灰掉 cf_clearance/browser/user_agent
  CF_MANAGED_PROXY_KEYS.forEach(k => setFieldDisabled('proxy', k, !!enabled));
  // enabled=false → 灰掉 flaresolverr_url/refresh_interval/timeout
  CF_REFRESH_SUB_KEYS.forEach(k => setFieldDisabled('proxy', k, !enabled));
}

function applyStatsigRefreshState(enabled) {
  function setFieldDisabled(section, key, disabled) {
    const input = document.querySelector(
      `input[data-section="${section}"][data-key="${key}"],` +
      `textarea[data-section="${section}"][data-key="${key}"],` +
      `select[data-section="${section}"][data-key="${key}"]`
    );
    if (!input) return;
    input.disabled = disabled;
    const field = input.closest('.config-field');
    if (field) {
      field.style.opacity = disabled ? '0.45' : '';
      field.style.pointerEvents = disabled ? 'none' : '';
    }
  }

  STATSIG_REFRESH_SUB_KEYS.forEach(k => setFieldDisabled('cloakbrowser', k, !enabled));
}

function buildFieldCard(section, key, val) {
  const text = getText(section, key);

  const fieldCard = document.createElement('div');
  fieldCard.className = 'config-field';

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'config-field-title';
  titleEl.textContent = text.title;
  fieldCard.appendChild(titleEl);

  // Description (Muted) - 只在有描述时显示
  if (text.desc) {
    const descEl = document.createElement('p');
    descEl.className = 'config-field-desc';
    descEl.textContent = text.desc;
    fieldCard.appendChild(descEl);
  }

  // Input Wrapper
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'config-field-input';

  // Input Logic
  let built;
  if (typeof val === 'boolean') {
    built = buildBooleanInput(section, key, val);
  }
  else if (key === 'image_format') {
    built = buildSelectInput(section, key, val, [
      { val: 'url', text: 'URL' },
      { val: 'base64', text: 'Base64' }
    ]);
  }
  else if (key === 'video_format') {
    built = buildSelectInput(section, key, val, [
      { val: 'html', text: 'HTML' },
      { val: 'url', text: 'URL' }
    ]);
  }
  else if (section === 'cloakbrowser' && key === 'mode') {
    built = buildSelectInput(section, key, val, [
      { val: 'launch', text: 'launch' }
    ]);
  }
  else if (section === 'cloakbrowser' && key === 'prewarm_mode') {
    built = buildSelectInput(section, key, val, [
      { val: 'session', text: 'session' },
      { val: 'probe', text: 'probe' }
    ]);
  }
  else if (section === 'imagine_fast' && key === 'size') {
    built = buildSelectInput(section, key, val, [
      { val: '1024x1024', text: '1024x1024 (1:1)' },
      { val: '1280x720', text: '1280x720 (16:9)' },
      { val: '720x1280', text: '720x1280 (9:16)' },
      { val: '1792x1024', text: '1792x1024 (3:2)' },
      { val: '1024x1792', text: '1024x1792 (2:3)' }
    ]);
  }
  else if (section === 'imagine_fast' && key === 'response_format') {
    built = buildSelectInput(section, key, val, [
      { val: 'url', text: 'URL' },
      { val: 'b64_json', text: 'B64 JSON' },
      { val: 'base64', text: 'Base64' }
    ]);
  }
  else if (Array.isArray(val) || typeof val === 'object') {
    if (section === 'model_routing' && key === 'model_pools') {
      built = buildModelRoutingInput(section, key, val);
    } else {
      built = buildJsonInput(section, key, val);
    }
  }
  else {
    if (key === 'api_key' || key === 'app_key' || key === 'public_key') {
      built = buildSecretInput(section, key, val);
    } else {
      built = buildTextInput(section, key, val);
    }
  }

  if (built) {
    inputWrapper.appendChild(built.node);
  }
  fieldCard.appendChild(inputWrapper);

  // proxy.enabled (CF 自动刷新) 联动（toggle 本身始终可交互）
  if (section === 'proxy' && key === 'enabled' && built && built.input) {
    fieldCard.style.pointerEvents = 'auto';
    fieldCard.style.opacity = '';
    built.input.addEventListener('change', () => {
      applyCfRefreshState(built.input.checked);
    });
  }

  if (section === 'cloakbrowser' && key === 'statsig_auto_refresh_enabled' && built && built.input) {
    fieldCard.style.pointerEvents = 'auto';
    fieldCard.style.opacity = '';
    built.input.addEventListener('change', () => {
      applyStatsigRefreshState(built.input.checked);
    });
  }

  if (section === 'app' && key === 'public_enabled') {
    fieldCard.classList.add('has-action');
    const link = document.createElement('a');
    link.href = '/login';
    link.className = 'config-field-action flex-none w-[32px] h-[32px] flex items-center justify-center bg-black text-white rounded-md hover:opacity-80 transition-opacity';
    link.title = '功能玩法';
    link.setAttribute('aria-label', '功能玩法');
    link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;
    link.style.display = val ? 'inline-flex' : 'none';
    fieldCard.appendChild(link);
    if (built && built.input) {
      built.input.addEventListener('change', () => {
        link.style.display = built.input.checked ? 'inline-flex' : 'none';
      });
    }
  }

  return fieldCard;
}

async function saveConfig() {
  const btn = byId('save-btn');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = '保存中...';

  try {
    const newConfig = typeof structuredClone === 'function'
      ? structuredClone(currentConfig)
      : JSON.parse(JSON.stringify(currentConfig));
    if (newConfig.app && Object.prototype.hasOwnProperty.call(newConfig.app, 'reuse_grok_conversation')) {
      delete newConfig.app.reuse_grok_conversation;
    }
    const inputs = document.querySelectorAll('input[data-section], textarea[data-section], select[data-section], [data-type="model-routing"][data-section]');

    inputs.forEach(input => {
      const s = input.dataset.section;
      const k = input.dataset.key;
      if (input.dataset.type === 'model-routing') {
        if (!newConfig[s]) newConfig[s] = {};
        newConfig[s][k] = { ...modelRoutingAssignments };
        return;
      }
      let val = input.value;

      if (input.type === 'checkbox') {
        val = input.checked;
      } else if (input.dataset.type === 'json') {
        try { val = JSON.parse(val); } catch (e) { throw new Error(`无效的 JSON: ${getText(s, k).title}`); }
      } else if (k === 'app_key' && val.trim() === '') {
        throw new Error('app_key 不能为空（后台密码）');
      } else if (NUMERIC_FIELDS.has(k)) {
        if (val.trim() !== '' && !Number.isNaN(Number(val))) {
          val = Number(val);
        }
      }

      if (!newConfig[s]) newConfig[s] = {};
      newConfig[s][k] = val;
    });

    if (newConfig.proxy && newConfig.proxy.enabled) {
      const url = String(newConfig.proxy.flaresolverr_url || '').trim();
      if (!url) {
        showToast('启用自动刷新时必须填写 FlareSolverr 地址', 'error');
        btn.disabled = false;
        btn.innerText = originalText;
        return;
      }
    }

    const res = await fetch('/v1/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(apiKey)
      },
      body: JSON.stringify(newConfig)
    });

    if (res.ok) {
      btn.innerText = '成功';
      showToast('配置已保存', 'success');
      await loadStatsigStatus();
      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.backgroundColor = '';
      }, 2000);
    } else {
      showToast('保存失败', 'error');
    }
  } catch (e) {
    showToast('错误: ' + e.message, 'error');
  } finally {
    if (btn.innerText === '保存中...') {
      btn.disabled = false;
      btn.innerText = originalText;
    } else {
      btn.disabled = false;
    }
  }
}

async function copyToClipboard(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);

    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    btn.style.backgroundColor = '#10b981';
    btn.style.borderColor = '#10b981';

    setTimeout(() => {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      btn.style.backgroundColor = '';
      btn.style.borderColor = '';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy', err);
  }
}

window.onload = init;

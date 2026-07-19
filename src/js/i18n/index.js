/**
 * i18n foundation module.
 * Single self-contained ES module. No deps, no JSON imports.
 *
 * Exports:
 *   t(key, params)            translate + interpolate {name} placeholders
 *   tChoice(key, count)       pick `key` when count===1 else `key_plural`
 *   setLocale(locale)         set current locale, persist, notify
 *   getLocale()               current locale code
 *   getCurrentLocale()        alias of getLocale()
 *   initI18n()                read localStorage | navigator.language | en-GB
 *   onLocaleChange(cb)        register listener, returns unsubscribe fn
 *   SUPPORTED_LOCALES         [{ code, name, flag }]
 */

const STORAGE_KEY = 'ism-locale';
const DEFAULT_LOCALE = 'en-GB';

export const SUPPORTED_LOCALES = [
  { code: 'en-GB', name: 'English (UK)', flag: 'gb' },
  { code: 'zh-CN', name: '简体中文', flag: 'cn' },
  { code: 'zh-HK', name: '繁體中文 (香港)', flag: 'hk' },
  { code: 'zh-TW', name: '繁體中文 (台灣)', flag: 'tw' },
];

// ponytail: flat dotted-key dictionaries. Nested grouping in source via comments.
const dictionaries = {
  'en-GB': {
    'details.title': 'Details',
    'details.placeholder': 'Select a series or site to view details.',

    'series.site_active': 'Site Active',
    'series.remaining': 'remaining',
    'series.site_complete': 'Site Complete',
    'series.compiling_telemetry': 'compiling XM telemetry.',
    'series.date_label': 'Date',
    'series.type_label': 'Type',
    'series.no_data': 'No data available',
    'series.season_overview': 'Season Overview',
    'series.sites': 'Sites',
    'series.select_site_prompt': 'Select a specific site for details.',
    'series.no_sites': 'No Sites found.',
    'series.season_info_unavailable': 'Season information not available.',
    'series.season_suffix': 'Season',
    'series.year_label': 'Year',
    'series.ornamented_portals': '{count} ornamented portal',
    'series.ornamented_portals_plural': '{count} ornamented portals',
    'series.event_sites_count': '{count} {event} Sites',
    'series.search_placeholder': 'Search sites...',

    'site.ornaments': 'Ornaments',
    'site.shards': 'Shards',
    'site.all_waves': 'All waves',
    'site.wave': 'Wave',
    'site.wave_n': 'Wave {n}',
    'site.wave_n_prefix': 'Wave {n}: ',
    'site.all_waves_prefix': 'All waves: ',
    'site.date_label': 'Date',
    'site.ornaments_label': 'Ornaments',
    'site.starts_in': 'Starts in',
    'site.active': 'Active',
    'site.remaining': 'remaining',
    'site.shard_n': 'Shard {id}',
    'site.link': 'Link',
    'site.link_plural': 'Links',
    'site.target_portal': 'Target Portal',
    'site.intel': 'Intel',
    'site.linked_at': 'Linked at',
    'site.by': 'by',
    'site.jumped': 'jumped',
    'site.at': 'at',
    'site.for': 'for',
    'site.point': 'point',
    'site.point_plural': 'points',
    'site.randomly_teleported': 'randomly teleported',
    'site.total': 'Total',
    'site.ornament_label': 'Ornament',
    'site.shard_count': '{count} Shard',
    'site.shard_count_plural': '{count} Shards',
    'site.link_count': '{count} Link',
    'site.link_count_plural': '{count} Links',
    'site.reason.spawn': 'spawn',
    'site.reason.no_move': 'no move',
    'site.reason.jump': 'jump',
    'site.reason.despawn': 'despawn',

    'custom.season_details': 'Custom Season Details',

    'dates.day': 'day',
    'dates.day_plural': 'days',
    'dates.hour': 'hour',
    'dates.hour_plural': 'hours',
    'dates.minute': 'minute',
    'dates.minute_plural': 'minutes',
    'dates.less_than_minute': 'less than a minute',

    'blueprints.event.ANOMALY': 'Anomaly',
    'blueprints.event.SKIRMISH': 'Shard Skirmish',
    'blueprints.event.INVESTIGATION': 'Shard Investigation',
    'blueprints.event.SINGULAR': 'Shard Singular',
    'blueprints.event.STORM': 'Shard Storm',
    'blueprints.event.SINGLE_SHARD': 'Single Shard',
    'blueprints.event.MULTIPLE_SHARDS': 'Multiple Shards',
    'blueprints.event.UNKNOWN': 'Unknown',
    'blueprints.ornament.ap1': 'Anomaly Portal',
    'blueprints.ornament.ap2': 'Anomaly Portal',
    'blueprints.ornament.ap3': 'Anomaly Portal',
    'blueprints.ornament.nl-1331-2026': 'Virtual NL-1331 Tour 2026',
    'blueprints.ornament.targetres': 'RES Target Portal',
    'blueprints.ornament.targetenl': 'ENL Target Portal',

    'ui.title_series': '{name} Season | Ingress Shards Map',
    'ui.title_site': '{name}: {site} | Ingress Shards Map',
    'ui.title_default': 'Ingress Shards Map',
  },

  'zh-CN': {
    'details.title': '详情',
    'details.placeholder': '选择系列或地点以查看详情。',

    'series.site_active': '地点活跃中',
    'series.remaining': '剩余',
    'series.site_complete': '地点已结束',
    'series.compiling_telemetry': '正在汇总 XM 遥测数据。',
    'series.date_label': '日期',
    'series.type_label': '类型',
    'series.no_data': '无可用数据',
    'series.season_overview': '赛季概览',
    'series.sites': '个地点',
    'series.select_site_prompt': '选择特定地点查看详情。',
    'series.no_sites': '未找到地点。',
    'series.season_info_unavailable': '赛季信息不可用。',
    'series.season_suffix': '赛季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 个装饰门',
    'series.ornamented_portals_plural': '{count} 个装饰门',
    'series.event_sites_count': '{count} 个{event}地点',
    'series.search_placeholder': '搜索地点...',

    'site.ornaments': '装饰',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期',
    'site.ornaments_label': '装饰',
    'site.starts_in': '即将开始',
    'site.active': '进行中',
    'site.remaining': '剩余',
    'site.shard_n': '碎片 {id}',
    'site.link': '连接',
    'site.link_plural': '连接',
    'site.target_portal': '目标门',
    'site.intel': '情报',
    'site.linked_at': '连接于',
    'site.by': '由',
    'site.jumped': '跳跃',
    'site.at': '于',
    'site.for': '获得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '随机传送',
    'site.total': '总计',
    'site.ornament_label': '装饰',
    'site.shard_count': '{count} 个碎片',
    'site.shard_count_plural': '{count} 个碎片',
    'site.link_count': '{count} 次连接',
    'site.link_count_plural': '{count} 次连接',
    'site.reason.spawn': '生成',
    'site.reason.no_move': '未移动',
    'site.reason.jump': '跳跃',
    'site.reason.despawn': '消失',

    'custom.season_details': '自定义赛季详情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小时',
    'dates.hour_plural': '小时',
    'dates.minute': '分钟',
    'dates.minute_plural': '分钟',
    'dates.less_than_minute': '不到一分钟',

    'blueprints.event.ANOMALY': '异常',
    'blueprints.event.SKIRMISH': '碎片遭遇战',
    'blueprints.event.INVESTIGATION': '碎片调查',
    'blueprints.event.SINGULAR': '碎片奇点',
    'blueprints.event.STORM': '碎片风暴',
    'blueprints.event.SINGLE_SHARD': '单碎片',
    'blueprints.event.MULTIPLE_SHARDS': '多碎片',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': '异常门',
    'blueprints.ornament.ap2': '异常门',
    'blueprints.ornament.ap3': '异常门',
    'blueprints.ornament.nl-1331-2026': '虚拟 NL-1331 巡游 2026',
    'blueprints.ornament.targetres': '反抗军目标门',
    'blueprints.ornament.targetenl': '启蒙军目标门',

    'ui.title_series': '{name} 赛季 | Ingress 碎片地图',
    'ui.title_site': '{name}: {site} | Ingress 碎片地图',
    'ui.title_default': 'Ingress 碎片地图',
  },

  'zh-HK': {
    'details.title': '詳情',
    'details.placeholder': '選擇系列或地點以查看詳情。',

    'series.site_active': '地點活躍中',
    'series.remaining': '剩餘',
    'series.site_complete': '地點已結束',
    'series.compiling_telemetry': '正在匯總 XM 遙測數據。',
    'series.date_label': '日期',
    'series.type_label': '類型',
    'series.no_data': '無可用數據',
    'series.season_overview': '賽季概覽',
    'series.sites': '個地點',
    'series.select_site_prompt': '選擇特定地點查看詳情。',
    'series.no_sites': '未找到地點。',
    'series.season_info_unavailable': '賽季資訊不可用。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 個裝飾門',
    'series.ornamented_portals_plural': '{count} 個裝飾門',
    'series.event_sites_count': '{count} 個{event}地點',
    'series.search_placeholder': '搜尋地點...',

    'site.ornaments': '裝飾',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期',
    'site.ornaments_label': '裝飾',
    'site.starts_in': '即將開始',
    'site.active': '進行中',
    'site.remaining': '剩餘',
    'site.shard_n': '碎片 {id}',
    'site.link': '連接',
    'site.link_plural': '連接',
    'site.target_portal': '目標門',
    'site.intel': '情報',
    'site.linked_at': '連接於',
    'site.by': '由',
    'site.jumped': '跳躍',
    'site.at': '於',
    'site.for': '獲得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '隨機傳送',
    'site.total': '總計',
    'site.ornament_label': '裝飾',
    'site.shard_count': '{count} 個碎片',
    'site.shard_count_plural': '{count} 個碎片',
    'site.link_count': '{count} 次連接',
    'site.link_count_plural': '{count} 次連接',
    'site.reason.spawn': '生成',
    'site.reason.no_move': '未移動',
    'site.reason.jump': '跳躍',
    'site.reason.despawn': '消失',

    'custom.season_details': '自訂賽季詳情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小時',
    'dates.hour_plural': '小時',
    'dates.minute': '分鐘',
    'dates.minute_plural': '分鐘',
    'dates.less_than_minute': '不到一分鐘',

    'blueprints.event.ANOMALY': '異常',
    'blueprints.event.SKIRMISH': '碎片遭遇戰',
    'blueprints.event.INVESTIGATION': '碎片調查',
    'blueprints.event.SINGULAR': '碎片奇點',
    'blueprints.event.STORM': '碎片風暴',
    'blueprints.event.SINGLE_SHARD': '單碎片',
    'blueprints.event.MULTIPLE_SHARDS': '多碎片',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': '異常門',
    'blueprints.ornament.ap2': '異常門',
    'blueprints.ornament.ap3': '異常門',
    'blueprints.ornament.nl-1331-2026': '虛擬 NL-1331 巡遊 2026',
    'blueprints.ornament.targetres': '反抗軍目標門',
    'blueprints.ornament.targetenl': '啟蒙軍目標門',

    'ui.title_series': '{name} 賽季 | Ingress 碎片地圖',
    'ui.title_site': '{name}: {site} | Ingress 碎片地圖',
    'ui.title_default': 'Ingress 碎片地圖',
  },

  'zh-TW': {
    'details.title': '詳情',
    'details.placeholder': '選擇系列或地點以查看詳情。',

    'series.site_active': '地點活躍中',
    'series.remaining': '剩餘',
    'series.site_complete': '地點已結束',
    'series.compiling_telemetry': '正在匯總 XM 遙測數據。',
    'series.date_label': '日期',
    'series.type_label': '類型',
    'series.no_data': '無可用數據',
    'series.season_overview': '賽季概覽',
    'series.sites': '個地點',
    'series.select_site_prompt': '選擇特定地點查看詳情。',
    'series.no_sites': '未找到地點。',
    'series.season_info_unavailable': '賽季資訊不可用。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 個裝飾門',
    'series.ornamented_portals_plural': '{count} 個裝飾門',
    'series.event_sites_count': '{count} 個{event}地點',
    'series.search_placeholder': '搜尋地點...',

    'site.ornaments': '裝飾',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期',
    'site.ornaments_label': '裝飾',
    'site.starts_in': '即將開始',
    'site.active': '進行中',
    'site.remaining': '剩餘',
    'site.shard_n': '碎片 {id}',
    'site.link': '連接',
    'site.link_plural': '連接',
    'site.target_portal': '目標門',
    'site.intel': '情報',
    'site.linked_at': '連接於',
    'site.by': '由',
    'site.jumped': '跳躍',
    'site.at': '於',
    'site.for': '獲得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '隨機傳送',
    'site.total': '總計',
    'site.ornament_label': '裝飾',
    'site.shard_count': '{count} 個碎片',
    'site.shard_count_plural': '{count} 個碎片',
    'site.link_count': '{count} 次連接',
    'site.link_count_plural': '{count} 次連接',
    'site.reason.spawn': '生成',
    'site.reason.no_move': '未移動',
    'site.reason.jump': '跳躍',
    'site.reason.despawn': '消失',

    'custom.season_details': '自訂賽季詳情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小時',
    'dates.hour_plural': '小時',
    'dates.minute': '分鐘',
    'dates.minute_plural': '分鐘',
    'dates.less_than_minute': '不到一分鐘',

    'blueprints.event.ANOMALY': '異常',
    'blueprints.event.SKIRMISH': '碎片遭遇戰',
    'blueprints.event.INVESTIGATION': '碎片調查',
    'blueprints.event.SINGULAR': '碎片奇點',
    'blueprints.event.STORM': '碎片風暴',
    'blueprints.event.SINGLE_SHARD': '單碎片',
    'blueprints.event.MULTIPLE_SHARDS': '多碎片',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': '異常門',
    'blueprints.ornament.ap2': '異常門',
    'blueprints.ornament.ap3': '異常門',
    'blueprints.ornament.nl-1331-2026': '虛擬 NL-1331 巡遊 2026',
    'blueprints.ornament.targetres': '反抗軍目標門',
    'blueprints.ornament.targetenl': '啟蒙軍目標門',

    'ui.title_series': '{name} 賽季 | Ingress 碎片地圖',
    'ui.title_site': '{name}: {site} | Ingress 碎片地圖',
    'ui.title_default': 'Ingress 碎片地圖',
  },
};

let currentLocale = DEFAULT_LOCALE;
const listeners = new Set();

function lookup(locale, key) {
  const dict = dictionaries[locale];
  return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
}

export function t(key, params) {
  const raw =
    lookup(currentLocale, key) ??
    lookup(DEFAULT_LOCALE, key) ??
    key;
  if (!params) return raw;
  // ponytail: simple {name} replacement, no Intl.MessageFormat
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    params && Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`,
  );
}

export function tChoice(key, count) {
  return t(count === 1 ? key : `${key}_plural`, { count });
}

function isSupported(locale) {
  return SUPPORTED_LOCALES.some((l) => l.code === locale);
}

export function setLocale(locale) {
  if (!isSupported(locale)) return false;
  if (locale === currentLocale) return true;
  const prev = currentLocale;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch (_) {
    // ponytail: localStorage may be unavailable (private mode); ignore
  }
  listeners.forEach((cb) => {
    try {
      cb(locale, prev);
    } catch (_) {
      // ponytail: one bad listener shouldn't break the others
    }
  });
  return true;
}

export function getLocale() {
  return currentLocale;
}

export function getCurrentLocale() {
  return currentLocale;
}

function pickInitialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupported(stored)) return stored;
  } catch (_) {
    // ponytail: localStorage unavailable; fall through
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (isSupported(navigator.language)) return navigator.language;
    // ponytail: try language family prefix match (e.g. "zh-SG" -> "zh-CN")
    const prefix = navigator.language.split('-')[0];
    const match = SUPPORTED_LOCALES.find((l) => l.code.startsWith(prefix + '-'));
    if (match) return match.code;
  }
  return DEFAULT_LOCALE;
}

export function initI18n() {
  currentLocale = pickInitialLocale();
  return currentLocale;
}

export function onLocaleChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
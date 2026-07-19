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

export interface LocaleInfo {
  code: string;
  name: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'en-GB', name: 'English (UK)', flag: 'gb' },
  { code: 'zh-CN', name: '简体中文', flag: 'cn' },
  { code: 'zh-HK', name: '繁體中文 (香港)', flag: 'hk' },
  { code: 'zh-TW', name: '繁體中文 (台灣)', flag: 'tw' },
];

// ponytail: flat dotted-key dictionaries. Nested grouping in source via comments.
const dictionaries: Record<string, Record<string, string>> = {
  'en-GB': {
    'details.title': 'Details',
    'details.placeholder': 'Select a series or site to view details.',

    'credits.open': 'Credits & links',
    'credits.view_source': 'View source on GitHub',
    'credits.thanks_yeggstry': 'Thanks: Yeggstry',
    'credits.thanks_nick_young': 'Thanks: Nick Young',
    'theme.toggle': 'Toggle light/dark theme',

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

    'credits.open': '致谢与链接',
    'credits.view_source': '在 GitHub 上查看源码',
    'credits.thanks_yeggstry': '感谢：Yeggstry',
    'credits.thanks_nick_young': '感谢：Nick Young',
    'theme.toggle': '切换浅色／深色主题',

    'series.site_active': '活动场地进行中',
    'series.remaining': '剩余',
    'series.site_complete': '活动场地已结束',
    'series.compiling_telemetry': '正在整理 XM 遥测数据。',
    'series.date_label': '日期',
    'series.type_label': '类型',
    'series.no_data': '无可用数据',
    'series.season_overview': '系列活动概览',
    'series.sites': '个场地',
    'series.select_site_prompt': '请选择一个活动场地查看详情。',
    'series.no_sites': '没有找到活动场地。',
    'series.season_info_unavailable': '赛季信息不可用。',
    'series.season_suffix': '赛季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 个带 Ornament 的 Portal',
    'series.ornamented_portals_plural': '{count} 个带 Ornament 的 Portal',
    'series.event_sites_count': '{count} 个 {event} 场地',
    'series.search_placeholder': '搜索活动场地…',

    'site.ornaments': 'Portal Ornaments',
    'site.shards': 'Shards',
    'site.all_waves': '全部波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波次',
    'site.wave_n_prefix': '第 {n} 波次：',
    'site.all_waves_prefix': '全部波次：',
    'site.date_label': '日期',
    'site.ornaments_label': 'Portal Ornaments',
    'site.starts_in': '即将开始',
    'site.active': '进行中',
    'site.remaining': '剩余',
    'site.shard_n': 'Shard {id}',
    'site.link': 'Link',
    'site.link_plural': 'Links',
    'site.target_portal': 'Target Portal',
    'site.intel': 'Intel 地图',
    'site.linked_at': '建立 Link 的时间',
    'site.by': '由',
    'site.jumped': '已跳转',
    'site.at': '于',
    'site.for': '获得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '随机传送至附近 Portal',
    'site.total': '总计',
    'site.ornament_label': 'Ornament',
    'site.shard_count': '{count} 个 Shard',
    'site.shard_count_plural': '{count} 个 Shard',
    'site.link_count': '{count} 条 Link',
    'site.link_count_plural': '{count} 条 Link',
    'site.reason.spawn': '出现',
    'site.reason.no_move': '未移动',
    'site.reason.jump': '跳转',
    'site.reason.despawn': '离场',

    'custom.season_details': '自定义赛季详情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小时',
    'dates.hour_plural': '小时',
    'dates.minute': '分钟',
    'dates.minute_plural': '分钟',
    'dates.less_than_minute': '不到一分钟',

    'blueprints.event.ANOMALY': 'XM Anomaly',
    'blueprints.event.SKIRMISH': 'Shard Skirmish',
    'blueprints.event.INVESTIGATION': 'Shard Investigation',
    'blueprints.event.SINGULAR': 'Shard Singular',
    'blueprints.event.STORM': 'Shard Storm',
    'blueprints.event.SINGLE_SHARD': 'Single Shard',
    'blueprints.event.MULTIPLE_SHARDS': 'Multiple Shards',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': 'Anomaly Portal',
    'blueprints.ornament.ap2': 'Anomaly Portal',
    'blueprints.ornament.ap3': 'Anomaly Portal',
    'blueprints.ornament.nl-1331-2026': 'Virtual NL-1331 Tour 2026',
    'blueprints.ornament.targetres': 'Resistance Target Portal',
    'blueprints.ornament.targetenl': 'Enlightened Target Portal',

    'ui.title_series': '{name} 赛季 | Ingress Shard 地图',
    'ui.title_site': '{name}：{site} | Ingress Shard 地图',
    'ui.title_default': 'Ingress Shard 地图',
  },

  'zh-HK': {
    'details.title': '詳情',
    'details.placeholder': '選擇系列或地點以查看詳情。',

    'credits.open': '致謝與連結',
    'credits.view_source': '在 GitHub 上查看原始碼',
    'credits.thanks_yeggstry': '感謝：Yeggstry',
    'credits.thanks_nick_young': '感謝：Nick Young',
    'theme.toggle': '切換淺色／深色主題',

    'series.site_active': '活動場地進行中',
    'series.remaining': '剩餘',
    'series.site_complete': '活動場地已結束',
    'series.compiling_telemetry': '正在整理 XM 遙測數據。',
    'series.date_label': '日期',
    'series.type_label': '類型',
    'series.no_data': '無可用數據',
    'series.season_overview': '系列活動概覽',
    'series.sites': '個場地',
    'series.select_site_prompt': '請選擇一個活動場地查看詳情。',
    'series.no_sites': '找不到活動場地。',
    'series.season_info_unavailable': '賽季資訊不可用。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 個帶 Ornament 的 Portal',
    'series.ornamented_portals_plural': '{count} 個帶 Ornament 的 Portal',
    'series.event_sites_count': '{count} 個 {event} 場地',
    'series.search_placeholder': '搜尋活動場地…',

    'site.ornaments': 'Portal Ornaments',
    'site.shards': 'Shards',
    'site.all_waves': '全部波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波次',
    'site.wave_n_prefix': '第 {n} 波次：',
    'site.all_waves_prefix': '全部波次：',
    'site.date_label': '日期',
    'site.ornaments_label': 'Portal Ornaments',
    'site.starts_in': '即將開始',
    'site.active': '進行中',
    'site.remaining': '剩餘',
    'site.shard_n': 'Shard {id}',
    'site.link': 'Link',
    'site.link_plural': 'Links',
    'site.target_portal': 'Target Portal',
    'site.intel': 'Intel 地圖',
    'site.linked_at': '建立 Link 的時間',
    'site.by': '由',
    'site.jumped': '已跳轉',
    'site.at': '於',
    'site.for': '獲得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '隨機傳送至附近 Portal',
    'site.total': '總計',
    'site.ornament_label': 'Ornament',
    'site.shard_count': '{count} 個 Shard',
    'site.shard_count_plural': '{count} 個 Shard',
    'site.link_count': '{count} 條 Link',
    'site.link_count_plural': '{count} 條 Link',
    'site.reason.spawn': '出現',
    'site.reason.no_move': '未移動',
    'site.reason.jump': '跳轉',
    'site.reason.despawn': '離場',

    'custom.season_details': '自訂賽季詳情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小時',
    'dates.hour_plural': '小時',
    'dates.minute': '分鐘',
    'dates.minute_plural': '分鐘',
    'dates.less_than_minute': '不到一分鐘',

    'blueprints.event.ANOMALY': 'XM Anomaly',
    'blueprints.event.SKIRMISH': 'Shard Skirmish',
    'blueprints.event.INVESTIGATION': 'Shard Investigation',
    'blueprints.event.SINGULAR': 'Shard Singular',
    'blueprints.event.STORM': 'Shard Storm',
    'blueprints.event.SINGLE_SHARD': 'Single Shard',
    'blueprints.event.MULTIPLE_SHARDS': 'Multiple Shards',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': 'Anomaly Portal',
    'blueprints.ornament.ap2': 'Anomaly Portal',
    'blueprints.ornament.ap3': 'Anomaly Portal',
    'blueprints.ornament.nl-1331-2026': 'Virtual NL-1331 Tour 2026',
    'blueprints.ornament.targetres': 'Resistance Target Portal',
    'blueprints.ornament.targetenl': 'Enlightened Target Portal',

    'ui.title_series': '{name} 賽季 | Ingress Shard 地圖',
    'ui.title_site': '{name}：{site} | Ingress Shard 地圖',
    'ui.title_default': 'Ingress Shard 地圖',
  },

  'zh-TW': {
    'details.title': '詳情',
    'details.placeholder': '選擇系列或地點以查看詳情。',

    'credits.open': '致謝與連結',
    'credits.view_source': '在 GitHub 上查看原始碼',
    'credits.thanks_yeggstry': '感謝：Yeggstry',
    'credits.thanks_nick_young': '感謝：Nick Young',
    'theme.toggle': '切換淺色／深色主題',

    'series.site_active': '活動場地進行中',
    'series.remaining': '剩餘',
    'series.site_complete': '活動場地已結束',
    'series.compiling_telemetry': '正在整理 XM 遙測資料。',
    'series.date_label': '日期',
    'series.type_label': '類型',
    'series.no_data': '無可用數據',
    'series.season_overview': '系列活動概覽',
    'series.sites': '個場地',
    'series.select_site_prompt': '請選擇一個活動場地查看詳情。',
    'series.no_sites': '找不到活動場地。',
    'series.season_info_unavailable': '賽季資訊不可用。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份',
    'series.ornamented_portals': '{count} 個帶 Ornament 的 Portal',
    'series.ornamented_portals_plural': '{count} 個帶 Ornament 的 Portal',
    'series.event_sites_count': '{count} 個 {event} 場地',
    'series.search_placeholder': '搜尋活動場地…',

    'site.ornaments': 'Portal Ornaments',
    'site.shards': 'Shards',
    'site.all_waves': '全部波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波次',
    'site.wave_n_prefix': '第 {n} 波次：',
    'site.all_waves_prefix': '全部波次：',
    'site.date_label': '日期',
    'site.ornaments_label': 'Portal Ornaments',
    'site.starts_in': '即將開始',
    'site.active': '進行中',
    'site.remaining': '剩餘',
    'site.shard_n': 'Shard {id}',
    'site.link': 'Link',
    'site.link_plural': 'Links',
    'site.target_portal': 'Target Portal',
    'site.intel': 'Intel 地圖',
    'site.linked_at': '建立 Link 的時間',
    'site.by': '由',
    'site.jumped': '已跳轉',
    'site.at': '於',
    'site.for': '獲得',
    'site.point': '分',
    'site.point_plural': '分',
    'site.randomly_teleported': '隨機傳送至附近 Portal',
    'site.total': '總計',
    'site.ornament_label': 'Ornament',
    'site.shard_count': '{count} 個 Shard',
    'site.shard_count_plural': '{count} 個 Shard',
    'site.link_count': '{count} 條 Link',
    'site.link_count_plural': '{count} 條 Link',
    'site.reason.spawn': '出現',
    'site.reason.no_move': '未移動',
    'site.reason.jump': '跳轉',
    'site.reason.despawn': '離場',

    'custom.season_details': '自訂賽季詳情',

    'dates.day': '天',
    'dates.day_plural': '天',
    'dates.hour': '小時',
    'dates.hour_plural': '小時',
    'dates.minute': '分鐘',
    'dates.minute_plural': '分鐘',
    'dates.less_than_minute': '不到一分鐘',

    'blueprints.event.ANOMALY': 'XM Anomaly',
    'blueprints.event.SKIRMISH': 'Shard Skirmish',
    'blueprints.event.INVESTIGATION': 'Shard Investigation',
    'blueprints.event.SINGULAR': 'Shard Singular',
    'blueprints.event.STORM': 'Shard Storm',
    'blueprints.event.SINGLE_SHARD': 'Single Shard',
    'blueprints.event.MULTIPLE_SHARDS': 'Multiple Shards',
    'blueprints.event.UNKNOWN': '未知',
    'blueprints.ornament.ap1': 'Anomaly Portal',
    'blueprints.ornament.ap2': 'Anomaly Portal',
    'blueprints.ornament.ap3': 'Anomaly Portal',
    'blueprints.ornament.nl-1331-2026': 'Virtual NL-1331 Tour 2026',
    'blueprints.ornament.targetres': 'Resistance Target Portal',
    'blueprints.ornament.targetenl': 'Enlightened Target Portal',

    'ui.title_series': '{name} 賽季 | Ingress Shard 地圖',
    'ui.title_site': '{name}：{site} | Ingress Shard 地圖',
    'ui.title_default': 'Ingress Shard 地圖',
  },
};

export type LocaleChangeListener = (locale: string, prev: string) => void;
export type TranslateParams = Record<string, unknown>;

let currentLocale: string = DEFAULT_LOCALE;
const listeners = new Set<LocaleChangeListener>();

function lookup(locale: string, key: string): string | null {
  const dict = dictionaries[locale];
  return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
}

export function t(key: string, params?: TranslateParams): string {
  const raw =
    lookup(currentLocale, key) ??
    lookup(DEFAULT_LOCALE, key) ??
    key;
  if (!params) return raw;
  // ponytail: simple {name} replacement, no Intl.MessageFormat
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    params && Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`,
  );
}

export function tChoice(key: string, count: number): string {
  return t(count === 1 ? key : `${key}_plural`, { count });
}

function isSupported(locale: string): boolean {
  return SUPPORTED_LOCALES.some((l) => l.code === locale);
}

export function setLocale(locale: string): boolean {
  if (!isSupported(locale)) return false;
  if (locale === currentLocale) return true;
  const prev = currentLocale;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ponytail: localStorage may be unavailable (private mode); ignore
  }
  listeners.forEach((cb) => {
    try {
      cb(locale, prev);
    } catch {
      // ponytail: one bad listener shouldn't break the others
    }
  });
  return true;
}

export function getLocale(): string {
  return currentLocale;
}

export function getCurrentLocale(): string {
  return currentLocale;
}

function pickInitialLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupported(stored)) return stored;
  } catch {
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

export function initI18n(): string {
  currentLocale = pickInitialLocale();
  return currentLocale;
}

export function onLocaleChange(callback: LocaleChangeListener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

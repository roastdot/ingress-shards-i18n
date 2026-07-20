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
  { code: 'en-US', name: 'English (US)', flag: 'us' },
  { code: 'zh-CN', name: '简体中文', flag: 'cn' },
  { code: 'zh-HK', name: '繁體中文（香港）', flag: 'hk' },
  { code: 'zh-TW', name: '繁體中文（台灣）', flag: 'tw' },
];

// ponytail: flat dotted-key dictionaries. Nested grouping in source via comments.
const dictionaries: Record<string, Record<string, string>> = {
  'en-GB': {
    'details.title': 'Details',
    'details.placeholder': 'Select a season or event site to view its details.',

    'credits.open': 'Acknowledgements & links',
    'credits.view_source': 'View source on GitHub',
    'credits.original_source': 'Original project',
    'credits.based_on_original': 'Based on the original',
    'credits.original_authors': 'Original authors:',
    'credits.thanks_yeggstry': 'Thanks to Yeggstry',
    'credits.thanks_nick_young': 'Thanks to Nick Young',
    'theme.toggle': 'Toggle light/dark theme',
    'faction.resistance': 'Resistance',
    'faction.enlightened': 'Enlightened',
    'faction.machina': 'Machina',
    'score.current_score': 'Current score',
    'score.official_results': 'View official results',

    'map.osm': 'OpenStreetMap',
    'map.carto_light': 'CartoDB Positron',
    'map.carto_dark': 'CartoDB Dark Matter',
    'map.esri_imagery': 'Esri World Imagery',
    'map.esri_topographic': 'Esri World Topographic Map',
    'map.google_hybrid': 'Google Hybrid',
    'map.elevation': 'Elevation',
    'map.view_3d': '3D view (terrain & globe)',
    'map.view_2d': 'Back to 2D map',
    'map.view_3d_error': 'Unable to load 3D view. Click to retry.',

    'series.active_status': 'Event active — {remaining} remaining',
    'series.upcoming_status': 'Event has not started — {remaining} remaining',
    'series.upcoming_city': 'Upcoming · {date}',
    'series.complete_status': 'Event complete — compiling XM telemetry.',
    'series.date_label': 'Date:',
    'series.type_label': 'Type:',
    'series.no_data': 'No data available',
    'series.season_overview': 'Season Overview',
    'series.sites': 'Sites',
    'series.select_site_prompt': 'Select a specific site for details.',
    'series.no_sites': 'No event sites found.',
    'series.season_info_unavailable': 'Season information not available.',
    'series.season_suffix': 'Season',
    'series.year_label': 'Year:',
    'series.ornamented_portals': '{count} ornamented portal',
    'series.ornamented_portals_plural': '{count} ornamented portals',
    'series.event_sites_count': '{count} {event} sites',
    'series.search_placeholder': 'Search event sites…',
    'series.control_label': '{year}: {name}',

    'site.ornaments': 'Portal Ornaments',
    'site.shards': 'Shards',
    'site.all_waves': 'All waves',
    'site.wave': 'Wave',
    'site.wave_n': 'Wave {n}',
    'site.wave_n_prefix': 'Wave {n}: ',
    'site.all_waves_prefix': 'All waves: ',
    'site.date_label': 'Date:',
    'site.ornaments_label': 'Portal Ornaments:',
    'site.starts_in_status': 'Starts in {remaining}',
    'site.active_status': 'Active — {remaining} remaining',
    'site.shard_n': 'Shard {id}',
    'site.link': 'Link',
    'site.link_plural': 'Links',
    'site.target_portal': 'Target Portal',
    'site.intel': 'Intel Map',
    'site.portal_history': '{reason} at {time}{team}',
    'site.link_created': 'Linked at {time} by {team}',
    'site.shard_scored': 'Shard {id} jumped{route} at {time} for {points} {pointLabel}',
    'site.route_detail': ' ({route})',
    'site.shard_teleported': 'Shard {id} randomly teleported at {time}',
    'site.point': 'point',
    'site.point_plural': 'points',
    'site.total': 'Total',
    'site.ornament_label': 'Ornament:',
    'site.shard_count': '{count} Shard',
    'site.shard_count_plural': '{count} Shards',
    'site.link_count': '{count} Link',
    'site.link_count_plural': '{count} Links',
    'site.reason.spawn': 'spawn',
    'site.reason.no_move': 'no move',
    'site.reason.jump': 'jump',
    'site.reason.teleport': 'random teleport',
    'site.reason.despawn': 'despawn',

    'custom.season_details': 'Custom Season Details',
    'custom.series_name': 'Custom',

    'dates.day': 'day',
    'dates.day_plural': 'days',
    'dates.hour': 'hour',
    'dates.hour_plural': 'hours',
    'dates.minute': 'minute',
    'dates.minute_plural': 'minutes',
    'dates.less_than_minute': 'less than a minute',

    'blueprints.event.ANOMALY': 'XM Anomaly',
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
    'blueprints.ornament.targetres': 'Resistance Target Portal',
    'blueprints.ornament.targetenl': 'Enlightened Target Portal',

    'ui.title_series': '{name} Season | Ingress Shards Map',
    'ui.title_site': '{name}: {site} | Ingress Shards Map',
    'ui.title_default': 'Ingress Shards Map',
  },

  // English copy is shared; keeping a distinct locale gives Intl US date/time formatting.
  'en-US': {},

  'zh-CN': {
    'details.title': '详情',
    'details.placeholder': '请选择赛季或活动地点查看详情。',

    'credits.open': '鸣谢与链接',
    'credits.view_source': '在 GitHub 上查看源码',
    'credits.original_source': '原始项目',
    'credits.based_on_original': '基于原版',
    'credits.original_authors': '原作者：',
    'credits.thanks_yeggstry': '感谢 Yeggstry',
    'credits.thanks_nick_young': '感谢 Nick Young',
    'theme.toggle': '切换浅色／深色主题',
    'faction.resistance': '反抗军',
    'faction.enlightened': '启蒙军',
    'faction.machina': 'Machina',
    'score.current_score': '当前总分',
    'score.official_results': '查看官方赛果',

    'map.osm': '开放街图',
    'map.carto_light': 'CartoDB 浅色地图',
    'map.carto_dark': 'CartoDB 深色地图',
    'map.esri_imagery': 'Esri 全球卫星影像',
    'map.esri_topographic': 'Esri 全球地形图',
    'map.google_hybrid': 'Google 混合地图',
    'map.elevation': '海拔',
    'map.view_3d': '3D 视图（地形与地球）',
    'map.view_2d': '返回 2D 地图',
    'map.view_3d_error': '无法加载 3D 视图。点击重试。',

    'series.active_status': '活动进行中，剩余 {remaining}',
    'series.upcoming_status': '活动尚未开始，距离开始还有 {remaining}',
    'series.upcoming_city': '即将开始 · {date}',
    'series.complete_status': '活动已结束，XM 数据整理中。',
    'series.date_label': '日期：',
    'series.type_label': '类型：',
    'series.no_data': '暂无数据',
    'series.season_overview': '赛季总览',
    'series.sites': '活动地点',
    'series.select_site_prompt': '请选择活动地点查看详情。',
    'series.no_sites': '找不到活动地点。',
    'series.season_info_unavailable': '暂时无法获取赛季信息。',
    'series.season_suffix': '赛季',
    'series.year_label': '年份：',
    'series.ornamented_portals': '{count} 座带标记的能量塔',
    'series.ornamented_portals_plural': '{count} 座带标记的能量塔',
    'series.event_sites_count': '{event}：{count} 个活动地点',
    'series.search_placeholder': '搜索活动地点…',
    'series.control_label': '{year}：{name}',

    'site.ornaments': '能量塔标记',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期：',
    'site.ornaments_label': '能量塔标记：',
    'site.starts_in_status': '距离开始还有 {remaining}',
    'site.active_status': '进行中，剩余 {remaining}',
    'site.shard_n': '碎片 {id}',
    'site.link': '连线',
    'site.link_plural': '连线',
    'site.target_portal': '目标塔',
    'site.intel': 'Intel',
    'site.portal_history': '{time} {reason}{team}',
    'site.link_created': '{time} {team} 建立连线',
    'site.shard_scored': '{time} 碎片 {id} 沿连线跳转{route}，获得 {points} {pointLabel}',
    'site.route_detail': '（{route}）',
    'site.shard_teleported': '{time} 碎片 {id} 随机传送至附近的能量塔',
    'site.point': '分',
    'site.point_plural': '分',
    'site.total': '总计',
    'site.ornament_label': '标记：',
    'site.shard_count': '{count} 枚碎片',
    'site.shard_count_plural': '{count} 枚碎片',
    'site.link_count': '{count} 条连线',
    'site.link_count_plural': '{count} 条连线',
    'site.reason.spawn': '出现',
    'site.reason.no_move': '原地停留',
    'site.reason.jump': '沿连线跳转',
    'site.reason.teleport': '随机传送',
    'site.reason.despawn': '消失',

    'custom.season_details': '自定义赛季详情',
    'custom.series_name': '自定义',

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
    'blueprints.ornament.ap1': '异常能量塔',
    'blueprints.ornament.ap2': '异常能量塔',
    'blueprints.ornament.ap3': '异常能量塔',
    'blueprints.ornament.nl-1331-2026': '2026 年虚拟 NL-1331 巡回',
    'blueprints.ornament.targetres': '反抗军目标塔',
    'blueprints.ornament.targetenl': '启蒙军目标塔',

    'ui.title_series': '{name} 赛季 | Ingress 碎片地图',
    'ui.title_site': '{name}：{site} | Ingress 碎片地图',
    'ui.title_default': 'Ingress 碎片地图',
  },

  'zh-HK': {
    'details.title': '詳情',
    'details.placeholder': '請選擇賽季或活動地點查看詳情。',

    'credits.open': '鳴謝與連結',
    'credits.view_source': '在 GitHub 上查看原始碼',
    'credits.original_source': '原始專案',
    'credits.based_on_original': '基於原版',
    'credits.original_authors': '原作者：',
    'credits.thanks_yeggstry': '感謝 Yeggstry',
    'credits.thanks_nick_young': '感謝 Nick Young',
    'theme.toggle': '切換淺色／深色主題',
    'faction.resistance': '反抗軍',
    'faction.enlightened': '啟蒙軍',
    'faction.machina': 'Machina',
    'score.current_score': '目前總分',
    'score.official_results': '查看官方賽果',

    'map.osm': '開放街圖',
    'map.carto_light': 'CartoDB 淺色地圖',
    'map.carto_dark': 'CartoDB 深色地圖',
    'map.esri_imagery': 'Esri 全球衛星影像',
    'map.esri_topographic': 'Esri 全球地形圖',
    'map.google_hybrid': 'Google 混合地圖',
    'map.elevation': '海拔',
    'map.view_3d': '3D 檢視（地形與地球）',
    'map.view_2d': '返回 2D 地圖',
    'map.view_3d_error': '無法載入 3D 檢視。點擊重試。',

    'series.active_status': '活動進行中，剩餘 {remaining}',
    'series.upcoming_status': '活動尚未開始，距離開始尚有 {remaining}',
    'series.upcoming_city': '即將開始 · {date}',
    'series.complete_status': '活動已結束，XM 數據整理中。',
    'series.date_label': '日期：',
    'series.type_label': '類型：',
    'series.no_data': '暫無數據',
    'series.season_overview': '賽季總覽',
    'series.sites': '活動地點',
    'series.select_site_prompt': '請選擇活動地點查看詳情。',
    'series.no_sites': '找不到活動地點。',
    'series.season_info_unavailable': '暫時無法取得賽季資料。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份：',
    'series.ornamented_portals': '{count} 座帶標記的能量塔',
    'series.ornamented_portals_plural': '{count} 座帶標記的能量塔',
    'series.event_sites_count': '{event}：{count} 個活動地點',
    'series.search_placeholder': '搜尋活動地點…',
    'series.control_label': '{year}：{name}',

    'site.ornaments': '能量塔標記',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期：',
    'site.ornaments_label': '能量塔標記：',
    'site.starts_in_status': '距離活動開始還有 {remaining}',
    'site.active_status': '進行中，剩餘 {remaining}',
    'site.shard_n': '碎片 {id}',
    'site.link': '連線',
    'site.link_plural': '連線',
    'site.target_portal': '目標塔',
    'site.intel': 'Intel',
    'site.portal_history': '{time} {reason}{team}',
    'site.link_created': '{time} {team} 建立連線',
    'site.shard_scored': '{time} 碎片 {id} 沿連線跳轉{route}，獲得 {points} {pointLabel}',
    'site.route_detail': '（{route}）',
    'site.shard_teleported': '{time} 碎片 {id} 隨機傳送至附近的能量塔',
    'site.point': '分',
    'site.point_plural': '分',
    'site.total': '總計',
    'site.ornament_label': '標記：',
    'site.shard_count': '{count} 枚碎片',
    'site.shard_count_plural': '{count} 枚碎片',
    'site.link_count': '{count} 條連線',
    'site.link_count_plural': '{count} 條連線',
    'site.reason.spawn': '出現',
    'site.reason.no_move': '停留原地',
    'site.reason.jump': '沿連線跳轉',
    'site.reason.teleport': '隨機傳送',
    'site.reason.despawn': '消失',

    'custom.season_details': '自訂賽季詳情',
    'custom.series_name': '自訂',

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
    'blueprints.ornament.ap1': '異常能量塔',
    'blueprints.ornament.ap2': '異常能量塔',
    'blueprints.ornament.ap3': '異常能量塔',
    'blueprints.ornament.nl-1331-2026': '2026 年虛擬 NL-1331 巡迴',
    'blueprints.ornament.targetres': '反抗軍目標塔',
    'blueprints.ornament.targetenl': '啟蒙軍目標塔',

    'ui.title_series': '{name} 賽季 | Ingress 碎片地圖',
    'ui.title_site': '{name}：{site} | Ingress 碎片地圖',
    'ui.title_default': 'Ingress 碎片地圖',
  },

  'zh-TW': {
    'details.title': '詳情',
    'details.placeholder': '請選擇賽季或活動地點查看詳情。',

    'credits.open': '鳴謝與連結',
    'credits.view_source': '在 GitHub 上查看原始碼',
    'credits.original_source': '原始專案',
    'credits.based_on_original': '基於原版',
    'credits.original_authors': '原作者：',
    'credits.thanks_yeggstry': '感謝 Yeggstry',
    'credits.thanks_nick_young': '感謝 Nick Young',
    'theme.toggle': '切換淺色／深色主題',
    'faction.resistance': '反抗軍',
    'faction.enlightened': '啟蒙軍',
    'faction.machina': 'Machina',
    'score.current_score': '目前總分',
    'score.official_results': '查看官方賽果',

    'map.osm': '開放街圖',
    'map.carto_light': 'CartoDB 淺色地圖',
    'map.carto_dark': 'CartoDB 深色地圖',
    'map.esri_imagery': 'Esri 全球衛星影像',
    'map.esri_topographic': 'Esri 全球地形圖',
    'map.google_hybrid': 'Google 混合地圖',
    'map.elevation': '海拔',
    'map.view_3d': '3D 檢視（地形與地球）',
    'map.view_2d': '返回 2D 地圖',
    'map.view_3d_error': '無法載入 3D 檢視。點按重試。',

    'series.active_status': '活動進行中，剩餘 {remaining}',
    'series.upcoming_status': '活動尚未開始，距離開始還有 {remaining}',
    'series.upcoming_city': '即將開始 · {date}',
    'series.complete_status': '活動已結束，XM 資料整理中。',
    'series.date_label': '日期：',
    'series.type_label': '類型：',
    'series.no_data': '暫無資料',
    'series.season_overview': '賽季總覽',
    'series.sites': '活動地點',
    'series.select_site_prompt': '請選擇活動地點查看詳情。',
    'series.no_sites': '找不到活動地點。',
    'series.season_info_unavailable': '暫時無法取得賽季資料。',
    'series.season_suffix': '賽季',
    'series.year_label': '年份：',
    'series.ornamented_portals': '{count} 座帶標記的能量塔',
    'series.ornamented_portals_plural': '{count} 座帶標記的能量塔',
    'series.event_sites_count': '{event}：{count} 個活動地點',
    'series.search_placeholder': '搜尋活動地點…',
    'series.control_label': '{year}：{name}',

    'site.ornaments': '能量塔標記',
    'site.shards': '碎片',
    'site.all_waves': '所有波次',
    'site.wave': '波次',
    'site.wave_n': '第 {n} 波',
    'site.wave_n_prefix': '第 {n} 波：',
    'site.all_waves_prefix': '所有波次：',
    'site.date_label': '日期：',
    'site.ornaments_label': '能量塔標記：',
    'site.starts_in_status': '距離活動開始還有 {remaining}',
    'site.active_status': '進行中，剩餘 {remaining}',
    'site.shard_n': '碎片 {id}',
    'site.link': '連線',
    'site.link_plural': '連線',
    'site.target_portal': '目標塔',
    'site.intel': 'Intel',
    'site.portal_history': '{time} {reason}{team}',
    'site.link_created': '{time} {team} 建立連線',
    'site.shard_scored': '{time} 碎片 {id} 沿連線跳轉{route}，獲得 {points} {pointLabel}',
    'site.route_detail': '（{route}）',
    'site.shard_teleported': '{time} 碎片 {id} 隨機傳送至附近的能量塔',
    'site.point': '分',
    'site.point_plural': '分',
    'site.total': '總計',
    'site.ornament_label': '標記：',
    'site.shard_count': '{count} 枚碎片',
    'site.shard_count_plural': '{count} 枚碎片',
    'site.link_count': '{count} 條連線',
    'site.link_count_plural': '{count} 條連線',
    'site.reason.spawn': '出現',
    'site.reason.no_move': '停留原地',
    'site.reason.jump': '沿連線跳轉',
    'site.reason.teleport': '隨機傳送',
    'site.reason.despawn': '消失',

    'custom.season_details': '自訂賽季詳情',
    'custom.series_name': '自訂',

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
    'blueprints.ornament.ap1': '異常能量塔',
    'blueprints.ornament.ap2': '異常能量塔',
    'blueprints.ornament.ap3': '異常能量塔',
    'blueprints.ornament.nl-1331-2026': '2026 年虛擬 NL-1331 巡迴',
    'blueprints.ornament.targetres': '反抗軍目標塔',
    'blueprints.ornament.targetenl': '啟蒙軍目標塔',

    'ui.title_series': '{name} 賽季 | Ingress 碎片地圖',
    'ui.title_site': '{name}：{site} | Ingress 碎片地圖',
    'ui.title_default': 'Ingress 碎片地圖',
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

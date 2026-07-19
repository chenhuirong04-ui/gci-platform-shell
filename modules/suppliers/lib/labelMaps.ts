// Display-layer label mapping for supplier module.
// DB values are never changed — only the rendered text is translated.
// Language must be passed explicitly from APP context (useI18n().lang).

import type { Lang } from '@gci/i18n';

export const COUNTRY_LABEL_MAP_ZH: Record<string, string> = {
  'China':          '中国',
  'UAE':            '阿联酋',
  'Malaysia':       '马来西亚',
  'Thailand':       '泰国',
  'Indonesia':      '印度尼西亚',
  'South Korea':    '韩国',
  'Ethiopia':       '埃塞俄比亚',
  'Singapore':      '新加坡',
  'Saudi Arabia':   '沙特阿拉伯',
  'Philippines':    '菲律宾',
  'France':         '法国',
  'USA':            '美国',
  '其他':           '其他',
  '未填写':         '未填写',
};

export const CATEGORY_LABEL_MAP_ZH: Record<string, string> = {
  'food':                '食品',
  'industry':            '工业',
  'hygiene':             '卫生用品',
  'FMCG':               '快消品',
  'service':             '服务',
  'beauty':              '美妆',
  'trade':               '贸易',
  'pet':                 '宠物用品',
  'furniture':           '家具',
  'shoes':               '鞋类',
  'medical':             '医疗用品',
  'renovation':          '装修',
  'sanitary fittings':   '卫浴五金',
  'building materials':  '建筑材料',
  'lighting':            '照明',
  'carpet':              '地毯',
  'tiles & stone':       '瓷砖与石材',
  'Pharmacy':            '药房渠道',
  'Supermarket':         '超市渠道',
  'FITTING':             '五金配件',
  '未分类':              '未分类',
};

/** Translate a country DB value using the APP's current language. */
export function getCountryLabel(value: string, lang: Lang): string {
  if (lang !== 'zh') return value;
  return COUNTRY_LABEL_MAP_ZH[value] ?? value;
}

/** Translate a category DB value using the APP's current language. */
export function getCategoryLabel(value: string, lang: Lang): string {
  if (lang !== 'zh') return value;
  return CATEGORY_LABEL_MAP_ZH[value] ?? value;
}

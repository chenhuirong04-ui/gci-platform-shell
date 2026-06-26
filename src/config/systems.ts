export interface SystemEntry {
  code: string;
  name: string;
  role: string;
  url: string;
  accent: string;
}

export const systems: SystemEntry[] = [
  {
    code: 'CRM',
    name: 'DEAL · 成交管家',
    role: '客户跟进 / 销售指挥中心',
    url: 'https://leads.globalcareinfo.com',
    accent: '#cba85c',
  },
  {
    code: 'TRADE',
    name: 'Trade OS',
    role: '贸易运营 / 财务闭环',
    url: 'https://trade.globalcareinfo.com',
    accent: '#8fa6d4',
  },
  {
    code: 'QUOTE',
    name: 'Quotation Center',
    role: '报价引擎 / FF&E 工程',
    url: 'https://living.globalcareinfo.com',
    accent: '#b69bd0',
  },
];

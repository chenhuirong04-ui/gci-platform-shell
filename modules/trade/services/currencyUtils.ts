/**
 * iCare 物理级金额计算规范
 * 1. 禁止直接使用 float 运算
 * 2. 所有写入必须经过 roundHalfUp
 * 3. 前端展示强制 toFixed(2)
 */

/**
 * 核心：四舍五入到两位小数 (Round Half Up)
 */
export const roundTo2 = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * 核心：精准计算小计与税额
 */
export const calculateTradeTotals = (items: { price: number; qty: number }[]) => {
  const subtotal = roundTo2(items.reduce((s, i) => s + roundTo2(i.price * i.qty), 0));
  const vat = roundTo2(subtotal * 0.05);
  const total = roundTo2(subtotal + vat);
  return { subtotal, vat, total };
};

/**
 * 核心：平账校验 (Collected + Outstanding === Total)
 */
export const verifyFinancialBalance = (total: number, collected: number, outstanding: number): boolean => {
  const diff = Math.abs(roundTo2(collected + outstanding) - roundTo2(total));
  return diff < 0.001; // 物理极小值容差
};

/**
 * 核心：计算未收金额
 */
export const calculateOutstanding = (total: number, paid: number): number => {
  return roundTo2(roundTo2(total) - roundTo2(paid));
};

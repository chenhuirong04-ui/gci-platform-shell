import { BOMItem } from '../constants';

export interface CostOverrides {
  labor: number;
  packaging: number;
  transport: number;
  installation: number;
  marginPercent: number;
  vatPercent: number;
}

export interface ProjectCosts {
  material: number;
  labor: number;
  packaging: number;
  transport: number;
  installation: number;
  margin: number;
  vat: number;
  total: number;
}

/**
 * Pure cost calculation — no React state, safe to call anywhere.
 * material + overheads = cost base
 * margin = cost base × marginPercent%
 * VAT = (cost base + margin) × vatPercent%
 */
export function calculateProjectCosts(bom: BOMItem[], overrides: CostOverrides): ProjectCosts {
  const material = bom.reduce((sum, item) => sum + item.total, 0);
  const { labor, packaging, transport, installation, marginPercent, vatPercent } = overrides;
  const costBase = material + labor + packaging + transport + installation;
  const margin = costBase * (marginPercent / 100);
  const totalBeforeVat = costBase + margin;
  const vat = totalBeforeVat * (vatPercent / 100);
  return { material, labor, packaging, transport, installation, margin, vat, total: totalBeforeVat + vat };
}

/**
 * Build the Send-to-TRADE payload from current quote state.
 * Returns the base64-encoded string ready for the URL param.
 */
export function buildTradePayload(params: {
  customerProjectName: string;
  quoteNumber: string;
  date: string;
  costs: ProjectCosts;
  overrides: CostOverrides;
  isPackage: boolean;
  bom: BOMItem[];
  selectedCategory: string | null;
  packageItems: { category: string; quantity: number; totalAmount: number }[];
}): string {
  const { customerProjectName, quoteNumber, date, costs, overrides, isPackage, bom, selectedCategory, packageItems } = params;

  const tradeItems = isPackage
    ? packageItems.map(pkg => ({
        desc: `${pkg.category} × ${pkg.quantity}`,
        qty: pkg.quantity,
        unitPrice: Number((pkg.totalAmount / (1 + overrides.vatPercent / 100)).toFixed(2)),
        lineTotal: Number(((pkg.totalAmount / (1 + overrides.vatPercent / 100)) * pkg.quantity).toFixed(2)),
      }))
    : [{
        desc: `${selectedCategory} Project | ${quoteNumber || 'Draft'}`,
        qty: 1,
        unitPrice: Number((costs.total - costs.vat).toFixed(2)),
        lineTotal: Number((costs.total - costs.vat).toFixed(2)),
      }];

  const totalBeforeVat = isPackage
    ? packageItems.reduce((acc, pkg) => acc + (pkg.totalAmount / (1 + overrides.vatPercent / 100)) * pkg.quantity, 0)
    : costs.total - costs.vat;
  const vatAmt = isPackage
    ? packageItems.reduce((acc, pkg) => acc + pkg.totalAmount * pkg.quantity, 0) - totalBeforeVat
    : costs.vat;
  const totalAmt = isPackage
    ? packageItems.reduce((acc, pkg) => acc + pkg.totalAmount * pkg.quantity, 0)
    : costs.total;

  const payload = {
    customerName: customerProjectName,
    projectName: customerProjectName,
    quoteNo: quoteNumber || `GCI-DRAFT-${Date.now()}`,
    quoteDate: date,
    currency: 'AED',
    subtotal: Number(totalBeforeVat.toFixed(2)),
    vatAmount: Number(vatAmt.toFixed(2)),
    totalAmount: Number(totalAmt.toFixed(2)),
    marginRate: overrides.marginPercent,
    costAmount: isPackage ? 0 : Number((costs.material + costs.labor + costs.packaging + costs.transport + costs.installation).toFixed(2)),
    profitAmount: isPackage ? 0 : Number(costs.margin.toFixed(2)),
    items: tradeItems,
    sourceApp: 'gci-living-engineering-studio',
    piType: 'PROJECT',
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

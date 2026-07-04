// Paper-style invoice preview matching the actual GCI TAX INVOICE template.
import type { InvoiceDraft } from '../../types/invoice';
import { GCI_COMPANY } from '../../types/invoice';

const GREEN = '#2D6A4F';
const GREEN_BG = '#2D6A4F';

// ── Safe number helpers ───────────────────────────────────────────────────────
function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value: unknown, decimals = 2): string {
  return toNum(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtRate(value: unknown, decimals = 3): string {
  return toNum(value).toFixed(decimals);
}

// ── Scoped CSS reset — defeats any dark-theme CSS that leaks into the invoice node.
// Uses #gci-invoice-preview specificity so it only affects this component.
// filter:none + color-scheme:light guard against:
//  - Tailwind dark: variants
//  - color:inherit from dark :root
//  - webkit-text-fill-color overrides
const INVOICE_SCOPED_CSS = `
  #gci-invoice-preview {
    all: revert;
    font-family: Arial, Helvetica, sans-serif !important;
    background: #ffffff !important;
    color: #111111 !important;
    color-scheme: light !important;
    -webkit-text-fill-color: #111111 !important;
    filter: none !important;
    opacity: 1 !important;
    mix-blend-mode: normal !important;
  }
  #gci-invoice-preview *,
  #gci-invoice-preview ::before,
  #gci-invoice-preview ::after {
    -webkit-text-fill-color: currentColor !important;
    filter: none !important;
    opacity: 1 !important;
    mix-blend-mode: normal !important;
  }
  #gci-invoice-preview table,
  #gci-invoice-preview thead,
  #gci-invoice-preview tbody,
  #gci-invoice-preview tr {
    background-color: transparent !important;
  }
  #gci-invoice-preview td,
  #gci-invoice-preview th {
    background-color: inherit !important;
    color: inherit !important;
  }
`;

interface Props {
  draft: Partial<InvoiceDraft> & {
    billTo: InvoiceDraft['billTo'];
    items: InvoiceDraft['items'];
    invoiceDate: string;
    dueDate: string;
    currency: string;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
    paymentTerms: string;
    otherComments: string;
    invoiceNo?: string;
  };
}

export function InvoicePreview({ draft, printAreaId }: Props & { printAreaId?: string }) {
  if (!draft) {
    return (
      <div style={{ padding: 32, background: '#fff', color: '#c00', fontFamily: 'Arial,sans-serif' }}>
        发票预览数据不完整，请返回修改。
      </div>
    );
  }

  const { billTo, items: rawItems, invoiceDate, dueDate, currency, paymentTerms, otherComments, invoiceNo } = draft;

  // Normalize all numeric fields — guard against undefined/NaN from partial state
  const safeItems = (rawItems ?? []).map(it => {
    const up = toNum(it.unitPrice);
    const qty = toNum(it.qty, 1);
    const amount = toNum(it.amount) || up * qty;
    return { ...it, unitPrice: up, qty, amount };
  });

  const subtotal = toNum(draft.subtotal) || safeItems.reduce((s, it) => s + it.amount, 0);
  const vatRate  = toNum(draft.vatRate, 5);
  const vatAmount = toNum(draft.vatAmount) || Math.round(subtotal * vatRate) / 100;
  const total    = toNum(draft.total) || subtotal + vatAmount;

  return (
    <>
      {/* Scoped style tag — beats any inherited dark-app-shell CSS */}
      <style dangerouslySetInnerHTML={{ __html: INVOICE_SCOPED_CSS }} />
    <div
      id={printAreaId ?? 'gci-invoice-preview'}
      style={{
        /* --- layout ------------------------------------------------ */
        maxWidth: 780,
        margin: '0 auto',
        padding: 32,
        border: '1px solid #d0d0d0',
        lineHeight: 1.5,
        /* --- force white-paper rendering regardless of shell theme --- */
        background: '#ffffff',
        backgroundColor: '#ffffff',
        color: '#111111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 12,
        /* --- isolation: block any parent filter / blend-mode ------- */
        colorScheme: 'light',
        isolation: 'isolate',
        contain: 'paint',
        filter: 'none',
        opacity: 1,
        mixBlendMode: 'normal',
        WebkitTextFillColor: '#111111',
      } as React.CSSProperties}
    >

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        {/* Left: Company info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ background: GREEN, color: '#fff', fontWeight: 900, fontSize: 16, padding: '3px 7px', borderRadius: 2 }}>GCI</div>
            <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>GLOBALCARE-INFO</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>{GCI_COMPANY.name}</div>
          <div style={{ fontSize: 11, color: '#333', maxWidth: 280 }}>{GCI_COMPANY.address}</div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 3 }}>License No.: {GCI_COMPANY.licenseNo}</div>
          <div style={{ fontSize: 11, color: '#333' }}>TRN: {GCI_COMPANY.trn}</div>
          <div style={{ fontSize: 11, color: '#333' }}>Email: {GCI_COMPANY.email}</div>
          <div style={{ fontSize: 11, color: '#333' }}>Phone: {GCI_COMPANY.phone}</div>
        </div>

        {/* Right: TAX INVOICE title + meta */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1A4FCF', letterSpacing: '-0.02em', marginBottom: 12 }}>TAX INVOICE</div>
          <table style={{ marginLeft: 'auto', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['DATE:', invoiceDate],
                ['INVOICE #:', invoiceNo ?? 'DRAFT'],
                ['CURRENCY:', currency],
                ['DUE DATE:', dueDate],
              ].map(([label, val]) => (
                <tr key={label}>
                  <td style={{ paddingRight: 10, color: '#555', textAlign: 'right' }}>{label}</td>
                  <td style={{ background: '#f0f0f0', padding: '2px 8px', minWidth: 100, textAlign: 'right', fontWeight: 600 }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bill To ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ background: GREEN_BG, color: '#fff', fontWeight: 700, padding: '5px 10px', fontSize: 12, marginBottom: 8 }}>BILL TO</div>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{billTo.name}</div>
        {billTo.address && <div style={{ fontSize: 11, color: '#333' }}>{billTo.address}</div>}
        {billTo.phone && <div style={{ fontSize: 11, color: '#333' }}>{billTo.phone}</div>}
        {billTo.trn && <div style={{ fontSize: 11, color: '#333' }}>TRN:{billTo.trn}</div>}
      </div>

      {/* ── Items table ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 11 }}>
        <thead>
          <tr style={{ background: GREEN_BG, color: '#fff' }}>
            <th style={{ padding: '6px 10px', textAlign: 'left', width: '55%' }}>DESCRIPTION</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', width: '18%' }}>UNIT PRICE ({currency})</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', width: '9%' }}>QTY</th>
            <th style={{ padding: '6px 10px', textAlign: 'right', width: '18%' }}>AMOUNT ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.filter(it => it.description || it.unitPrice).map((item, i) => (
            <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 10px', color: '#111', background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>{item.description}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#111', background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>{fmt(item.unitPrice)}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#111', background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>{item.qty}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#111', background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>{fmt(item.amount)}</td>
            </tr>
          ))}
          {/* Pad to minimum 5 rows */}
          {Array.from({ length: Math.max(0, 5 - safeItems.filter(it => it.description || it.unitPrice).length) }).map((_, i) => (
            <tr key={`pad-${i}`} style={{ borderBottom: '1px solid #eee', background: '#fff' }}>
              <td style={{ padding: '6px 10px', background: '#fff', color: '#111' }}>&nbsp;</td>
              <td style={{ background: '#fff' }} /><td style={{ background: '#fff' }} />
              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#ccc', background: '#fff' }}>-</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals + Comments ── */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Other comments (left) */}
        <div style={{ flex: 1, paddingRight: 20 }}>
          <div style={{ background: GREEN_BG, color: '#fff', fontWeight: 700, padding: '4px 8px', fontSize: 11, marginBottom: 6 }}>OTHER COMMENTS</div>
          <div style={{ fontSize: 11, color: '#333', whiteSpace: 'pre-wrap' }}>
            {paymentTerms ? `1. Payment Terms: ${paymentTerms}` : ''}
            {otherComments ? `\n${otherComments}` : ''}
          </div>
        </div>

        {/* Tax summary (right) */}
        <div style={{ minWidth: 220 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#555' }}>SUBTOTAL:</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(subtotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#555' }}>TAX rate:</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtRate(vatRate)}%</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: '#555' }}>TAX amount:</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(vatAmount)}</td>
              </tr>
              <tr style={{ fontWeight: 700, fontSize: 12.5 }}>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>TOTAL:</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', borderTop: '2px solid #333' }}>{fmt(total)} <span style={{ fontSize: 10, fontWeight: 400, color: '#888' }}>{currency}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bank Details + Signature ── */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #eee', paddingTop: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Bank Details</div>
          <div style={{ fontSize: 11, color: '#333' }}>Bank Name: {GCI_COMPANY.bank.name}</div>
          <div style={{ fontSize: 11, color: '#333' }}>Account Name: {GCI_COMPANY.bank.accountName}</div>
          <div style={{ fontSize: 11, color: '#333', marginTop: 4 }}>IBAN: {GCI_COMPANY.bank.iban}</div>
          <div style={{ fontSize: 11, color: '#333' }}>Swift Code: {GCI_COMPANY.bank.swift}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 10, fontStyle: 'italic' }}>
            If you have any questions about this invoice, please contact us.
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>Thank You For Your Business!</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#333', marginTop: 4 }}>{GCI_COMPANY.name}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 140, height: 60, border: '1px dashed #ccc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 10, marginBottom: 4 }}>
            [Stamp / Seal]
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>Authorized Signature</div>
        </div>
      </div>

      {/* Draft watermark */}
      <div style={{ position: 'relative', marginTop: 12, textAlign: 'center' }}>
        <span style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.15em', fontFamily: 'monospace' }}>
          DRAFT — NOT AN OFFICIAL TAX INVOICE — PENDING APPROVAL
        </span>
      </div>
    </div>
    </>
  );
}

/**
 * Trade licence in the CRM "新增客户" form: AI reading through the existing /api/bs/parse-document (TRADE_LICENSE prompt, no new AI
 * service), pre-filling the form, and — after the user confirmed and the crm_customers row exists — archiving the same file as that
 * customer's 营业执照 document + compliance item (same tables/bucket as the drawer's 客户文件, owned by crm_customers.id).
 */
import {
  crmOwnerKey, uploadDocumentFile, saveCustomerDocument, saveComplianceItem,
} from '../../../../modules/business-solutions/lib/bsCloud';

export interface TradeLicenseFields {
  license_number?: string;
  licensee_name?: string;
  trade_name?: string;
  legal_status?: string;
  issuing_authority?: string;
  manager_name?: string;
  issue_date?: string;
  expiry_date?: string;
  premises_number?: string;
  building_name?: string;
  area_name?: string;
  activities?: string[];
}

export const LICENSE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif';
const MAX_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function parseTradeLicense(file: File): Promise<TradeLicenseFields> {
  if (file.size > MAX_BYTES) throw new Error('文件超过 10MB，请压缩后再上传');
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
  const res = await fetch('/api/bs/parse-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mimeType, data: await fileToBase64(file), documentType: 'TRADE_LICENSE' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `AI 识别失败 (HTTP ${res.status})`);
  return (data.fields ?? {}) as TradeLicenseFields;
}

const UAE_AUTHORITY = /dubai|abu dhabi|sharjah|ajman|ras al|fujairah|umm al|u\.?a\.?e|emirates|dmcc|jafza|rakez|ifza|meydan|迪拜|阿联酋/i;

/** Only fills what the licence actually states; never overwrites what the user already typed. */
export function licenseToFormPatch(f: TradeLicenseFields, current: { name: string; country: string; contactName: string }) {
  return {
    name: current.name.trim() || (f.trade_name || f.licensee_name || '').trim(),
    country: current.country.trim() || (f.issuing_authority && UAE_AUTHORITY.test(f.issuing_authority) ? 'UAE' : ''),
    contactName: current.contactName.trim() || (f.manager_name || '').trim(),
  };
}

/** Archive the licence for the newly created CRM customer. Throws with a readable message; the customer itself is already saved. */
export async function archiveTradeLicense(crmCustomerId: string, file: File, f: TradeLicenseFields): Promise<void> {
  const owner = crmOwnerKey(crmCustomerId);
  const up = await uploadDocumentFile(owner, file);
  if (!up) throw new Error('营业执照文件上传失败');
  const doc = await saveCustomerDocument({
    customer_id: owner,
    document_type: 'TRADE_LICENSE',
    document_name: f.trade_name || f.licensee_name || file.name.replace(/\.[^.]+$/, ''),
    file_url: up.url,
    storage_path: up.path,
    issue_date: f.issue_date || undefined,
    expiry_date: f.expiry_date || undefined,
    reminder_days: 30,
    uploaded_by: '',
    notes: '新增客户时上传并经 AI 识别',
  });
  if (!doc?.id) throw new Error('营业执照文件记录保存失败');
  const item = await saveComplianceItem({
    customer_id: owner,
    document_id: doc.id,
    compliance_type: 'TRADE_LICENSE',
    title: f.trade_name || f.licensee_name || 'Trade License',
    license_number: f.license_number || undefined,
    licensee_name: f.licensee_name || undefined,
    trade_name: f.trade_name || undefined,
    legal_status: f.legal_status || undefined,
    issuing_authority: f.issuing_authority || undefined,
    manager_name: f.manager_name || undefined,
    premises_number: f.premises_number || undefined,
    building_name: f.building_name || undefined,
    area_name: f.area_name || undefined,
    activities: f.activities?.length ? f.activities : undefined,
    issue_date: f.issue_date || undefined,
    expiry_date: f.expiry_date || undefined,
    reminder_days: 30,
    status: 'ACTIVE',
  });
  if (!item) throw new Error('营业执照合规事项保存失败');
}

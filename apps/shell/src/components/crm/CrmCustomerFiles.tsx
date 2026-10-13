/**
 * 客户文件 / 合规事项 / 公司人员 of ONE CRM customer — the existing Business Solutions managers (AI parsing via /api/bs/parse-document,
 * expiry badges and reminders, compliance auto-created from a parsed licence, persons from passports/EIDs), owned by crm_customers.id.
 * Same bridge as ServiceCustomerDetail: a parsed licence/VAT jumps to 合规事项, a parsed passport/EID/visa pre-fills 公司人员.
 * Files live in the same tables and bucket, keyed by crm_customer_id (bsCloud crmOwnerKey) — never by name matching.
 */
import { useEffect, useState } from 'react';
import { CustomerDocumentManager } from '../../../../../modules/business-solutions/components/CustomerDocumentManager';
import { ComplianceItemManager } from '../../../../../modules/business-solutions/components/ComplianceItemManager';
import { PersonManager } from '../../../../../modules/business-solutions/components/PersonManager';
import { crmOwnerKey } from '../../../../../modules/business-solutions/lib/bsCloud';

export type CrmFilesTab = 'documents' | 'compliance' | 'persons';

interface Props {
  crmCustomerId: string;
  customerName: string;
  tab: CrmFilesTab;
  onTabChange: (t: CrmFilesTab) => void;
}

type DocInfo = { documentId: string; documentType: string; documentName: string; parsed: Record<string, unknown> };

export function CrmCustomerFiles({ crmCustomerId, customerName, tab, onTabChange }: Props) {
  const ownerKey = crmOwnerKey(crmCustomerId);
  const [complianceReloadKey, setComplianceReloadKey] = useState(0);
  const [complianceSavedMsg, setComplianceSavedMsg] = useState<string | null>(null);
  const [personPrefill, setPersonPrefill] = useState<DocInfo | null>(null);

  // a different customer never inherits the previous one's pending prefill / toast
  useEffect(() => { setPersonPrefill(null); setComplianceSavedMsg(null); }, [crmCustomerId]);

  return (
    <div className="bg-white rounded-2xl p-4 text-gray-800" style={{ colorScheme: 'light' }}>
      {tab === 'documents' && (
        <CustomerDocumentManager
          key={ownerKey}
          customerId={ownerKey}
          customerName={customerName}
          lang="zh"
          onCreateComplianceItem={() => {
            setComplianceReloadKey((k) => k + 1);
            setComplianceSavedMsg('证照已识别并保存到合规事项');
            onTabChange('compliance');
          }}
          onCreatePerson={(info) => {
            setPersonPrefill({ ...info, parsed: info.parsed as Record<string, unknown> });
            onTabChange('persons');
          }}
        />
      )}
      {tab === 'compliance' && (
        <ComplianceItemManager
          key={ownerKey}
          customerId={ownerKey}
          lang="zh"
          reloadKey={complianceReloadKey}
          savedToast={complianceSavedMsg || undefined}
        />
      )}
      {tab === 'persons' && (
        <PersonManager
          key={ownerKey}
          customerId={ownerKey}
          lang="zh"
          prefillFromDocument={personPrefill || undefined}
          onPrefillHandled={() => setPersonPrefill(null)}
        />
      )}
    </div>
  );
}

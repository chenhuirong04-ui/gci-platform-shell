import { useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Sidebar, Header, LangToggle, Toast, type NavSection } from '@gci/design-system';
import { LangContext, dictionaries, type Lang } from '@gci/i18n';
import { sections as sectionDefs } from './config/navigation';
import { Home } from './pages/Home';
import TradeModule from '../../../modules/trade/TradeModule';
import CrmModule from '../../../modules/crm/CrmModule';
import QuotationModule from '../../../modules/quotation/QuotationModule';

function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dict = dictionaries[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const currentUrl = location.pathname + location.search;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };

  const sections: NavSection[] = useMemo(
    () =>
      sectionDefs.map((section) => ({
        label: dict.nav[section.labelKey],
        items: section.items.map((m) => ({
          code: m.code,
          name: dict.nav[m.nameKey],
          count: m.count,
          badgeColor: m.badgeColor,
          badgeBg: m.badgeBg,
          active: m.path ? currentUrl === m.path : undefined,
          onClick: m.path
            ? () => navigate(m.path!)
            : () => flash(dict.toast.enterModule(dict.nav[m.nameKey])),
        })),
      })),
    [dict, currentUrl, navigate],
  );

  const dateLine = new Date()
    .toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .toUpperCase()
    .replace(/\//g, '.');

  return (
    <LangContext.Provider value={{ lang, dict, setLang }}>
      <AppShell
        sidebar={
          <Sidebar
            navTop={{ code: 'WS', name: dict.nav.workspace, active: location.pathname === '/', onClick: () => navigate('/') }}
            workspaceLabel={dict.nav.workspaceSection}
            sections={sections}
            userName="Chris"
            userRole={dict.profile.owner}
          />
        }
        header={
          <Header
            eyebrow={dict.header.eyebrow}
            dateLine={dateLine}
            searchPlaceholder={dict.header.searchPlaceholder}
            syncedLabel={dict.header.synced}
            trailing={<LangToggle lang={lang} onChange={setLang} />}
          />
        }
      >
        <Routes>
          <Route path="/" element={<Home onFlash={flash} />} />
          {/* Sidebar deep-links within the same module via ?tab=/?mode= — pass
              the parsed value as a prop instead of remounting (remounting
              would reset CRM's password gate and any in-progress form state
              on every click between e.g. Control Center / Customer Follow-up). */}
          <Route path="/crm/*" element={<CrmModule initialTab={searchParams.get('tab') as any} />} />
          <Route path="/trade/*" element={<TradeModule initialTab={searchParams.get('tab') as any} />} />
          <Route
            path="/quotation/*"
            element={<QuotationModule initialMode={searchParams.get('mode') as any} initialView={searchParams.get('view') as any} />}
          />
        </Routes>
      </AppShell>
      <Toast message={toast} />
    </LangContext.Provider>
  );
}

export default App;

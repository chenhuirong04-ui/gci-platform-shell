import { useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, Sidebar, Header, LangToggle, Toast, type NavModItem } from '@gci/design-system';
import { LangContext, dictionaries, type Lang } from '@gci/i18n';
import { modules } from './config/navigation';
import { Home } from './pages/Home';
import { ModulePlaceholder } from './pages/ModulePlaceholder';
import TradeModule from '../../../modules/trade/TradeModule';
import CrmModule from '../../../modules/crm/CrmModule';

function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dict = dictionaries[lang];
  const navigate = useNavigate();
  const location = useLocation();

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };

  const navMods: NavModItem[] = useMemo(
    () =>
      modules.map((m) => ({
        code: m.code,
        name: dict.nav[m.nameKey],
        count: m.count,
        badgeColor: m.badgeColor,
        badgeBg: m.badgeBg,
        active: m.path ? location.pathname === m.path : undefined,
        onClick: m.path
          ? () => navigate(m.path!)
          : () => flash(dict.toast.enterModule(dict.nav[m.nameKey])),
      })),
    [dict, location.pathname, navigate],
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
            navMods={navMods}
            workspaceLabel={dict.nav.workspaceSection}
            modulesLabel={dict.nav.modulesSection}
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
          <Route path="/crm/*" element={<CrmModule />} />
          <Route path="/trade/*" element={<TradeModule />} />
          <Route
            path="/quotation/*"
            element={<ModulePlaceholder title="Quotation Center" etaLabel="Quotation Center 正在合并中 — 预计 Day 6 上线。" />}
          />
        </Routes>
      </AppShell>
      <Toast message={toast} />
    </LangContext.Provider>
  );
}

export default App;

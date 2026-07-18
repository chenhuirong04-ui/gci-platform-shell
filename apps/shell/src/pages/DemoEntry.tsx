import { useEffect } from 'react';
import CrmModule from '../../../../modules/crm/CrmModule';
import { DEMO_BLOCKED_HOSTS } from '../../../../modules/crm/demo/demoMode';

export function DemoEntry() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/api/') || DEMO_BLOCKED_HOSTS.some(host => url.includes(host))) {
        throw new Error(`[25H Demo] Production request blocked: ${url}`);
      }
      return originalFetch(input, init);
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  return (
    <div data-demo-mode="true">
      <div className="fixed top-3 right-3 z-[5000] rounded-full bg-amber-400 px-4 py-2 text-[11px] font-black text-slate-950 shadow-xl">
        DEMO · 虚构数据 · 禁止生产写入
      </div>
      <CrmModule demoMode />
    </div>
  );
}

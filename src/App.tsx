import { useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toast } from './components/Toast';
import { Home } from './pages/Home';

function App() {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };

  return (
    <div className="flex" style={{ minHeight: '100vh', background: '#080D1E' }}>
      <Sidebar onSoonClick={(name) => flash(`进入 ${name} 模块 — 待接入`)} />
      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar />
        <Home onFlash={flash} />
      </div>
      <Toast message={toast} />
    </div>
  );
}

export default App;

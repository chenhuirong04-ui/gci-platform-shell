import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Home } from './pages/Home';

function App() {
  return (
    <div className="flex min-h-screen bg-[#080d1e]">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1">
          <Home />
        </main>
      </div>
    </div>
  );
}

export default App;

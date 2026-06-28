 import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] p-6">
          <div className="max-w-3xl mx-auto bg-white border border-red-200 rounded-2xl p-6">
            <div className="text-xl font-black text-red-600">
              页面崩溃了（但系统没死）
            </div>
            <div className="mt-3 text-sm text-slate-600">
              请截图这个错误发我，我可以直接定位是哪一行代码。
            </div>
            <pre className="mt-4 text-xs bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto">
{String(this.state.error?.stack || this.state.error || "Unknown error")}
            </pre>
            <button
              className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white font-black"
              onClick={() => location.reload()}
            >
              刷新
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

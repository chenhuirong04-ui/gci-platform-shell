import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Printer, Copy, Check, AlertCircle, FileText } from 'lucide-react';
import { LoadingState } from '../types';

interface InvoicePreviewProps {
  markdown: string;
  status: LoadingState;
  errorMessage?: string;
}

const InvoicePreview: React.FC<InvoicePreviewProps> = ({ markdown, status, errorMessage }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  if (status === LoadingState.IDLE) {
    return (
      <div className="h-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 p-8 text-center">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-gray-400" />
        </div>
        <p className="font-medium">Ready to generate</p>
        <p className="text-sm mt-2 max-w-xs">Paste your negotiation details on the left and click Generate to see the Proforma Invoice here.</p>
      </div>
    );
  }

  if (status === LoadingState.LOADING) {
    return (
      <div className="h-full bg-white border border-gray-200 rounded-xl p-8 flex flex-col animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/5 mb-8"></div>
        
        <div className="border border-gray-100 rounded-lg p-4 mb-4">
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
        
        <div className="flex-1 bg-gray-50 rounded-lg"></div>
      </div>
    );
  }

  if (status === LoadingState.ERROR) {
    return (
      <div className="h-full bg-red-50 border border-red-200 rounded-xl flex flex-col items-center justify-center text-red-600 p-8">
        <AlertCircle className="w-12 h-12 mb-4" />
        <h3 className="text-lg font-bold">Generation Failed</h3>
        <p className="text-sm mt-2 text-center">{errorMessage || "An unknown error occurred."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 no-print">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          Generated Invoice
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy MD'}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* The Actual Invoice Paper */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4 rounded-xl border border-gray-200 print:p-0 print:border-none print:bg-white print:overflow-visible">
        <div className="bg-white shadow-lg mx-auto max-w-[210mm] min-h-[297mm] p-[10mm] md:p-[20mm] text-sm md:text-base leading-relaxed text-gray-800 print:shadow-none print:w-full print:max-w-none">
          {/* Logo Placeholder within the document */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-brand-600 pb-4">
             <div>
                <h1 className="text-2xl font-bold text-brand-700 tracking-tight">iCare Trading Co., Ltd.</h1>
                <p className="text-xs text-gray-500 mt-1">Global Health & Medical Supply Experts</p>
             </div>
             <div className="text-right text-xs text-gray-500">
                <p>123 Business Bay</p>
                <p>Dubai, UAE</p>
                <p>Tel: +971 50 123 4567</p>
             </div>
          </div>

          <div className="markdown-body">
             <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown}
             </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;

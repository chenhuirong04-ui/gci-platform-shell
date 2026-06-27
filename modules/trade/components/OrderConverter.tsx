import React, { useState } from 'react';
import { 
  Zap, MessageSquare, Loader2, 
  AlertTriangle, Package, User, 
  DollarSign, Trash2, Send, Layers
} from 'lucide-react';
import { extractItemsFromChat } from '../services/geminiService';

// 物理级配置共享
const CONFIG = {
  TOKEN: '', // removed hardcoded secret during monorepo migration -- only reachable via the
             // permanently-disabled ENABLE_ORDER_CONVERSION_AI feature flag (always false)
  DB: {
    SALES: "2c6d0b13b3b980c88401ee6c4cc86df5",

    // ✅ 库存流水数据库：用于写入销售出库记录
    INVENTORY_LOG: "2c6d0b13b3b9804f9ccff92be2566c30"
  }
};

interface ExtractedItem {
  desc: string;
  price: number;
  qty: number;
  id: string;
}

const OrderConverter: React.FC = () => {
  const [inputChat, setInputChat] = useState('');
  const [customer, setCustomer] = useState('Valued Client');
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<{msg: string, type: 'info' | 'success' | 'error'}[]>([]);
  const [error, setError] = useState<string | null>(null);

  const proxy = "https://cors-anywhere.herokuapp.com/";

  const handleExtract = async () => {
    if (!inputChat.trim()) return;
    setIsExtracting(true);
    setError(null);

    try {
      const data = await extractItemsFromChat(inputChat);
      setCustomer(data.customer || 'Valued Client');

      const mappedItems = (data.items || []).map((it: any) => ({
        ...it,
        id: Math.random().toString(36).substr(2, 9)
      }));

      setItems(mappedItems);
    } catch (e: any) {
      setError(`Extraction failed: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // ✅ 写入销售订单
  const createSalesRecord = async (it: ExtractedItem, salesOrderNo: string) => {
    return fetch(`${proxy}https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${CONFIG.TOKEN}`, 
        'Notion-Version': '2022-06-28', 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ 
        parent: { database_id: CONFIG.DB.SALES }, 
        properties: { 
          "Product": { title: [{ text: { content: it.desc } }] }, 
          "Quantity": { number: it.qty }, 
          "Wholesale Price": { number: it.price },
          "Customer": { rich_text: [{ text: { content: customer } }] }
        } 
      })
    });
  };

  // ✅ 写入库存流水：销售出库
  const createInventoryOutRecord = async (it: ExtractedItem, salesOrderNo: string) => {
    return fetch(`${proxy}https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${CONFIG.TOKEN}`, 
        'Notion-Version': '2022-06-28', 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        parent: { database_id: CONFIG.DB.INVENTORY_LOG },
        properties: {
          "名称": { 
            title: [{ text: { content: it.desc } }] 
          },
          "变动数量": { 
            number: -Math.abs(it.qty) 
          },
          "变动类型": { 
            select: { name: "销售出库" } 
          },
          "来源单据类型": { 
            rich_text: [{ text: { content: "销售单" } }] 
          },
          "来源单据编号": { 
            rich_text: [{ text: { content: salesOrderNo } }] 
          },
          "日期": { 
            date: { start: new Date().toISOString().split('T')[0] } 
          }
        }
      })
    });
  };

  const handleSyncToNotion = async () => {
    if (items.length === 0) return;

    setIsSyncing(true);
    setSyncLogs([]);

    const salesOrderNo = `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    try {
      for (const it of items) {
        setSyncLogs(prev => [...prev, { msg: `Creating Sales Order: ${it.desc}...`, type: 'info' }]);
        
        const salesResponse = await createSalesRecord(it, salesOrderNo);

        if (!salesResponse.ok) {
          setSyncLogs(prev => [...prev, { msg: `✕ Sales failed: ${it.desc} (HTTP ${salesResponse.status})`, type: 'error' }]);
          continue;
        }

        setSyncLogs(prev => [...prev, { msg: `✓ Sales order created: ${it.desc}`, type: 'success' }]);

        setSyncLogs(prev => [...prev, { msg: `Deducting inventory: ${it.desc}...`, type: 'info' }]);

        const inventoryResponse = await createInventoryOutRecord(it, salesOrderNo);

        if (inventoryResponse.ok) {
          setSyncLogs(prev => [...prev, { msg: `✓ Inventory deducted: ${it.desc}`, type: 'success' }]);
        } else {
          setSyncLogs(prev => [...prev, { msg: `✕ Inventory deduct failed: ${it.desc} (HTTP ${inventoryResponse.status})`, type: 'error' }]);
        }
      }

      alert(`✅ 订单已生成，库存出库已同步。\nSO REF: ${salesOrderNo}`);
    } catch (e: any) {
      setSyncLogs(prev => [...prev, { msg: `FATAL: ${e.message}`, type: 'error' }]);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-8 h-[calc(100vh-160px)]">
      
      {/* 输入侧：Chat Logs */}
      <section className="flex-1 flex flex-col gap-5">
        <div className="bg-white p-8 rounded-[40px] shadow-sm border border-orange-50 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-black text-orange-600 uppercase tracking-[0.2em] flex items-center gap-3">
              <MessageSquare className="w-5 h-5" /> 原始谈单记录 / Chat Logs
            </h2>
            <button 
              onClick={() => setInputChat('')}
              className="text-[10px] font-black text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors"
            >
              清空
            </button>
          </div>
          
          <textarea 
            className="flex-1 w-full p-6 text-sm font-mono text-gray-700 bg-orange-50/20 border-2 border-orange-50 rounded-[32px] outline-none focus:border-orange-500 transition-all resize-none placeholder:text-gray-300"
            placeholder="在此粘贴包含产品、数量、价格的聊天记录...&#10;AI 将自动提取结构化订单。"
            value={inputChat}
            onChange={(e) => setInputChat(e.target.value)}
          />

          <button 
            disabled={isExtracting || !inputChat.trim()}
            onClick={handleExtract}
            className="w-full mt-6 py-5 bg-orange-500 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-orange-100 hover:bg-orange-600 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
          >
            {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-5 h-5 fill-white" /> 物理解析订单 / Extract</>}
          </button>
        </div>
      </section>

      {/* 结果侧：Parsed Orders */}
      <section className="flex-1 flex flex-col gap-6 h-full overflow-hidden">
        <div className="bg-white rounded-[40px] border border-indigo-50 shadow-2xl flex flex-col h-full overflow-hidden relative">
          
          <div className="p-8 border-b border-indigo-50 flex items-center justify-between bg-indigo-50/30">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                    <Layers className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-black text-indigo-900 uppercase text-xs tracking-widest">提取结果 / Extracted Orders</h3>
                    <p className="text-[9px] text-indigo-400 font-bold uppercase mt-1">Pending Sync to Notion</p>
                </div>
             </div>
             <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-white border border-indigo-100 rounded-full text-[10px] font-black text-indigo-600">{items.length} SKUs</span>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-4">
            {error && (
              <div className="bg-red-50 border-2 border-red-100 p-6 rounded-[24px] text-red-600 text-xs font-bold flex items-center gap-3 animate-pulse">
                <AlertTriangle className="w-5 h-5" /> {error}
              </div>
            )}

            {items.length === 0 && !isExtracting && (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-50">
                 <Package className="w-16 h-16 mb-4" />
                 <p className="text-xs font-black uppercase tracking-widest">Waiting for extraction...</p>
              </div>
            )}

            {items.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <User className="w-4 h-4 text-indigo-400" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer:</span>
                    <input 
                      value={customer} 
                      onChange={e => setCustomer(e.target.value)} 
                      className="bg-transparent font-black text-indigo-900 outline-none flex-1 text-sm uppercase"
                    />
                </div>
                
                <div className="space-y-4">
                  {items.map((it) => (
                    <div key={it.id} className="group bg-white border border-gray-100 rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
                       <div className="flex flex-col gap-1 flex-1 pr-4">
                          <span className="text-sm font-black text-gray-800 uppercase leading-tight">{it.desc}</span>
                          <div className="flex items-center gap-4 mt-1">
                             <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><DollarSign className="w-3 h-3"/> {it.price.toFixed(2)}</span>
                             <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">QTY: {it.qty}</span>
                          </div>
                       </div>
                       <button 
                        onClick={() => setItems(items.filter(i => i.id !== it.id))}
                        className="p-3 rounded-full text-gray-200 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                       >
                         <Trash2 className="w-5 h-5" />
                       </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {syncLogs.length > 0 && (
              <div className="mt-8 pt-8 border-t-2 border-dashed border-gray-100 space-y-2">
                 <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-4">Sync Operation Logs</p>
                 {syncLogs.map((log, idx) => (
                    <div key={idx} className={`text-[10px] font-mono font-bold flex items-center gap-2 ${
                        log.type === 'success' ? 'text-emerald-500' : 
                        log.type === 'error' ? 'text-red-500' : 'text-indigo-400'
                    }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            log.type === 'success' ? 'bg-emerald-500' : 
                            log.type === 'error' ? 'bg-red-500' : 'bg-indigo-300'
                        }`} />
                        {log.msg}
                    </div>
                 ))}
              </div>
            )}
          </div>

          <div className="p-8 bg-gray-50 border-t border-indigo-50">
             <button 
               disabled={items.length === 0 || isSyncing}
               onClick={handleSyncToNotion}
               className="w-full py-6 bg-indigo-900 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.5em] shadow-2xl flex items-center justify-center gap-4 active:scale-95 transition-all hover:bg-black disabled:opacity-30"
             >
                {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" /> 生成订单并扣库存 / SYNC ORDER</>}
             </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrderConverter;

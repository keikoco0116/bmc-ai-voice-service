import { useState } from 'react';
import { Search, Filter, Download, Play, MoreVertical, Loader2, X, DollarSign, Info } from 'lucide-react';
import { useCalls, CallRecord } from '../../context/CallContext';

interface CostDetailsModalProps {
  call: CallRecord;
  onClose: () => void;
}

function CostDetailsModal({ call, onClose }: CostDetailsModalProps) {
  const breakdown = call.costBreakdown;
  const rate = call.exchangeRate || 32.0;

  const items = breakdown ? [
    { 
      label: 'DIDWW 號碼月租 (攤提)', 
      usd: breakdown.didwwMonthlyUsd,
      note: breakdown.rates ? `月租 $${breakdown.rates.didwwMonthly} / 1000 次` : undefined
    },
    { 
      label: 'DIDWW 通話費', 
      usd: breakdown.didwwCallUsd,
      note: breakdown.rates ? `$${breakdown.rates.didwwCall}/min` : undefined
    },
    { 
      label: 'Twilio 串接費', 
      usd: breakdown.twilioUsd,
      note: breakdown.rates ? `$${breakdown.rates.twilio}/min` : undefined
    },
    { 
      label: 'AI 模型調用費 (Gemini)', 
      usd: breakdown.aiModelUsd,
      note: breakdown.rates ? `$${breakdown.rates.aiModel}/min` : undefined
    },
  ] : [
    { label: '預估總成本 (舊資料)', usd: call.estimatedCost || 0 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">費用明細</h2>
              <p className="text-xs text-slate-400 font-mono">ID: {call.id?.slice(0, 8)}...</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!breakdown && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-amber-400">
              <Info className="w-5 h-5 shrink-0" />
              <p className="text-sm">此通話為舊版紀錄，僅提供總額預估，無詳細拆解資料。</p>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span>項目 / 單價</span>
              <div className="flex gap-8">
                <span className="w-20 text-right">美金 (USD)</span>
                <span className="w-20 text-right">台幣 (TWD)</span>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-300">{item.label}</span>
                    {item.note && <span className="text-[10px] text-slate-500 font-mono">{item.note}</span>}
                  </div>
                  <div className="flex gap-8 font-mono text-sm pt-0.5">
                    <span className="w-20 text-right text-slate-200">${item.usd.toFixed(4)}</span>
                    <span className="w-20 text-right text-slate-400">NT${(item.usd * rate).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-400">匯率參考</span>
              <span className="text-sm font-mono text-slate-200">1 USD = {rate} TWD</span>
            </div>
            <div className="pt-2 border-t border-slate-700 flex justify-between items-end">
              <span className="text-base font-bold text-white">總計金額</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-rose-400 font-mono">${(breakdown?.totalUsd || call.estimatedCost || 0).toFixed(4)}</div>
                <div className="text-sm text-slate-400 font-mono">≈ NT${(breakdown?.totalTwd || (call.estimatedCost || 0) * rate).toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-900/30 border-t border-slate-700 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CallHistory() {
  const { calls } = useCalls();
  const [isLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  const filteredCalls = calls.filter(call => 
    call.phone.includes(searchTerm) || 
    call.id.includes(searchTerm) ||
    call.intent.includes(searchTerm)
  );

  const totalUsd = filteredCalls.reduce((sum, call) => sum + (call.estimatedCost || 0), 0);
  const totalTwd = filteredCalls.reduce((sum, call) => sum + (call.costBreakdown?.totalTwd || (call.estimatedCost || 0) * 32), 0);

  return (
    <div className="space-y-6">
      {selectedCall && (
        <CostDetailsModal 
          call={selectedCall} 
          onClose={() => setSelectedCall(null)} 
        />
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">通話記錄</h1>
          <p className="text-slate-400 text-sm mt-1">
            篩選總計: <span className="text-rose-400 font-mono font-bold">${totalUsd.toFixed(2)}</span> (USD) / 
            <span className="text-rose-400 font-mono font-bold ml-1">NT${totalTwd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> (TWD)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
            <Filter className="w-4 h-4" />
            篩選
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
            <Download className="w-4 h-4" />
            匯出
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜尋電話號碼、意圖或通話 ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/50 text-xs uppercase text-slate-500 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium">通話 ID</th>
                <th className="px-6 py-4 font-medium">時間</th>
                <th className="px-6 py-4 font-medium">來電號碼</th>
                <th className="px-6 py-4 font-medium">管道</th>
                <th className="px-6 py-4 font-medium">意圖</th>
                <th className="px-6 py-4 font-medium">通話時長</th>
                <th className="px-6 py-4 font-medium">預估成本 (USD)</th>
                <th className="px-6 py-4 font-medium">狀態</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-500" />
                    載入中...
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    尚無通話記錄
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-500">{call.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{call.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-200">{call.phone}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                         call.channel === 'Web' ? 'bg-teal-500/10 text-teal-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {call.channel === 'Web' ? '網頁通話' : '電話來電'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                        {call.intent}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{call.duration}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button 
                        onClick={() => setSelectedCall(call)}
                        className="flex flex-col items-start group"
                      >
                        <span className="font-mono text-rose-400 group-hover:text-rose-300 transition-colors">
                          ${call.estimatedCost?.toFixed(3) || '0.000'}
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 group-hover:text-teal-400 transition-colors">
                          <Info className="w-2.5 h-2.5" />
                          點擊查看明細
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        call.status === 'AI完成' ? 'text-teal-400 bg-teal-400/10' : 'text-yellow-400 bg-yellow-400/10'
                      }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-colors" title="播放錄音">
                          <Play className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {filteredCalls.length > 0 && (
                <tr className="bg-slate-800/80 font-bold border-t-2 border-slate-700">
                  <td colSpan={6} className="px-6 py-4 text-right text-slate-300">本頁總計:</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-rose-400 font-mono">${totalUsd.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-500 font-mono">≈ NT${totalTwd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
          <div>顯示 1 至 {filteredCalls.length} 筆，共 {filteredCalls.length} 筆</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 disabled:opacity-50">上一頁</button>
            <button className="px-3 py-1 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700">下一頁</button>
          </div>
        </div>
      </div>
    </div>
  );
}

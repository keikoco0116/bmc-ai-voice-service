import { Headphones, PhoneCall, AlertCircle } from 'lucide-react';

export default function LiveAgent() {
  const queue = [
    { id: 'Q-001', phone: '+886 912 *** 789', intent: '客訴處理', waitTime: '02:15', priority: 'High' },
    { id: 'Q-002', phone: '+886 987 *** 654', intent: '複雜訂單變更', waitTime: '01:30', priority: 'Medium' },
    { id: 'Q-003', phone: 'LINE User', intent: '要求真人', waitTime: '00:45', priority: 'Normal' },
  ];

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">人工接管控制台</h1>
          <p className="text-sm text-slate-400 mt-1">監控並接手 AI 無法處理的通話</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-medium border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            線上 (可接聽)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Queue */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80">
            <h2 className="font-medium text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              等待接管佇列 ({queue.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {queue.map((item) => (
              <div key={item.id} className="bg-slate-900 p-4 rounded-lg border border-slate-700 hover:border-teal-500/50 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-slate-200">{item.phone}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.priority === 'High' ? 'bg-rose-500/10 text-rose-400' : 
                    item.priority === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 
                    'bg-slate-700 text-slate-300'
                  }`}>
                    {item.priority}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-sm text-slate-400">
                    <div>意圖: <span className="text-slate-300">{item.intent}</span></div>
                    <div>等待: <span className="text-rose-400">{item.waitTime}</span></div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-3 py-1.5 bg-teal-500 text-white rounded text-sm font-medium hover:bg-teal-600">
                    <PhoneCall className="w-3.5 h-3.5" />
                    接聽
                  </button>
                </div>
              </div>
            ))}
            {queue.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Headphones className="w-8 h-8 mb-2 opacity-50" />
                <p>目前無等待接管的通話</p>
              </div>
            )}
          </div>
        </div>

        {/* Active Call Workspace */}
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-slate-500">
          <Headphones className="w-16 h-16 mb-4 text-slate-600" />
          <h2 className="text-xl font-medium text-slate-400 mb-2">工作區</h2>
          <p className="text-sm">從左側佇列選擇一通電話以開始接聽</p>
        </div>
      </div>
    </div>
  );
}

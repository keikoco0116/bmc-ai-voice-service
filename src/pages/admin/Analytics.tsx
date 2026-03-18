import { BarChart3, TrendingUp, Clock, ThumbsUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useCalls } from '../../context/CallContext';

const intentData = [
  { name: '訂單查詢', value: 450 },
  { name: '退換貨', value: 300 },
  { name: '產品諮詢', value: 250 },
  { name: '投訴建議', value: 100 },
  { name: '其他', value: 145 },
];

const timeData = [
  { time: '08:00', calls: 20 },
  { time: '10:00', calls: 85 },
  { time: '12:00', calls: 120 },
  { time: '14:00', calls: 150 },
  { time: '16:00', calls: 110 },
  { time: '18:00', calls: 60 },
  { time: '20:00', calls: 30 },
];

export default function Analytics() {
  const { calls } = useCalls();

  const totalCalls = calls.length;
  const aiCompleted = calls.filter(c => c.status === 'AI完成').length;
  const aiRate = totalCalls > 0 ? (aiCompleted / totalCalls * 100).toFixed(1) : '0.0';

  // Calculate average duration
  const totalSeconds = calls.reduce((acc, call) => {
    const [mins, secs] = call.duration.split(':').map(Number);
    return acc + (mins * 60) + secs;
  }, 0);
  const avgSeconds = totalCalls > 0 ? Math.round(totalSeconds / totalCalls) : 0;
  const avgMins = Math.floor(avgSeconds / 60);
  const avgSecsRemainder = avgSeconds % 60;

  // Calculate intent data
  const intentCounts = calls.reduce((acc, call) => {
    acc[call.intent] = (acc[call.intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dynamicIntentData = Object.entries(intentCounts).map(([name, value]) => ({
    name,
    value: value as number
  })).sort((a, b) => b.value - a.value);

  // Calculate time data (by hour)
  const timeCounts = calls.reduce((acc, call) => {
    const date = new Date(call.time.replace(' ', 'T'));
    if (!isNaN(date.getTime())) {
      const hour = date.getHours().toString().padStart(2, '0') + ':00';
      acc[hour] = (acc[hour] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
  const dynamicTimeData = hours.map(time => ({
    time,
    calls: timeCounts[time] || 0
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">報表分析</h1>
        <select className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-teal-500">
          <option>本週</option>
          <option>本月</option>
          <option>過去 30 天</option>
          <option>今年</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-medium text-slate-400">總通話量</h3>
          </div>
          <p className="text-2xl font-bold text-white">{totalCalls}</p>
          <p className="text-xs text-teal-400 mt-1">+0.0% 較上期</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-medium text-slate-400">AI 解決率</h3>
          </div>
          <p className="text-2xl font-bold text-white">{aiRate}%</p>
          <p className="text-xs text-teal-400 mt-1">+0.0% 較上期</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-medium text-slate-400">平均通話時長</h3>
          </div>
          <p className="text-2xl font-bold text-white">{avgMins}m {avgSecsRemainder}s</p>
          <p className="text-xs text-rose-400 mt-1">-0s 較上期</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <ThumbsUp className="w-5 h-5 text-yellow-400" />
            <h3 className="text-sm font-medium text-slate-400">客戶滿意度</h3>
          </div>
          <p className="text-2xl font-bold text-white">4.8/5.0</p>
          <p className="text-xs text-teal-400 mt-1">+0.2 較上期</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-medium text-white mb-6">熱門進線意圖</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dynamicIntentData.length > 0 ? dynamicIntentData : intentData} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" width={80} />
                <Tooltip cursor={{fill: '#334155'}} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-medium text-white mb-6">時段通話量分佈</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicTimeData}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="calls" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

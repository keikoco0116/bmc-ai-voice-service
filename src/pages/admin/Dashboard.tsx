import { PhoneIncoming, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useCalls } from '../../context/CallContext';

const data = [
  { name: 'Mon', calls: 400 },
  { name: 'Tue', calls: 300 },
  { name: 'Wed', calls: 550 },
  { name: 'Thu', calls: 450 },
  { name: 'Fri', calls: 600 },
  { name: 'Sat', calls: 200 },
  { name: 'Sun', calls: 150 },
];

const pieData = [
  { name: '傳統電話', value: 400 },
  { name: 'LINE', value: 300 },
  { name: 'WhatsApp', value: 300 },
];
const COLORS = ['#14b8a6', '#3b82f6', '#22c55e'];

export default function Dashboard() {
  const { calls } = useCalls();

  const totalCalls = calls.length;
  const aiCompleted = calls.filter(c => c.status === 'AI完成').length;
  const aiRate = totalCalls > 0 ? Math.round((aiCompleted / totalCalls) * 100) : 0;
  
  // Calculate total cost
  const totalCostUsd = calls.reduce((acc, call) => acc + (call.estimatedCost || 0), 0);
  const totalCostTwd = calls.reduce((acc, call) => acc + (call.costBreakdown?.totalTwd || (call.estimatedCost || 0) * 32), 0);
  const avgCost = totalCalls > 0 ? (totalCostUsd / totalCalls).toFixed(3) : '0.000';

  // Calculate average duration
  const totalSeconds = calls.reduce((acc, call) => {
    const [mins, secs] = call.duration.split(':').map(Number);
    return acc + (mins * 60) + secs;
  }, 0);
  const avgSeconds = totalCalls > 0 ? Math.round(totalSeconds / totalCalls) : 0;
  const avgMins = (avgSeconds / 60).toFixed(1);

  // Calculate pie data
  const channelCounts = calls.reduce((acc, call) => {
    acc[call.channel] = (acc[call.channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dynamicPieData = Object.entries(channelCounts).map(([name, value]) => ({
    name,
    value
  }));

  // Calculate daily calls for the line chart
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyCounts = calls.reduce((acc, call) => {
    const date = new Date(call.time.replace(' ', 'T'));
    const dayName = !isNaN(date.getTime()) ? days[date.getDay()] : 'Unknown';
    acc[dayName] = (acc[dayName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dynamicLineData = days.map(day => ({
    name: day,
    calls: dailyCounts[day] || 0
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">儀表板</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">今日來電</p>
              <p className="text-3xl font-bold text-white mt-2">{totalCalls}</p>
            </div>
            <div className="w-12 h-12 bg-teal-500/10 rounded-lg flex items-center justify-center text-teal-400">
              <PhoneIncoming className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-teal-400 mt-4 flex items-center gap-1">
            <span className="font-medium">+12%</span> 較昨日
          </p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">AI 處理率</p>
              <p className="text-3xl font-bold text-white mt-2">{aiRate}%</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4">目標 90%</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">平均通話時長</p>
              <p className="text-3xl font-bold text-white mt-2">{avgMins}m</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4">每通電話平均時間</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">累計成本 (USD/TWD)</p>
              <div className="mt-2">
                <p className="text-2xl font-bold text-white">${totalCostUsd.toFixed(2)}</p>
                <p className="text-sm text-slate-400 font-mono">≈ NT${totalCostTwd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <div className="w-12 h-12 bg-rose-500/10 rounded-lg flex items-center justify-center text-rose-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-4 flex justify-between">
            <span>平均單通: ${avgCost}</span>
            <span className="text-xs opacity-60">NT${(Number(avgCost) * 32).toFixed(1)}</span>
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-medium text-white mb-4">7 日通話量趨勢</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamicLineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#14b8a6' }}
                />
                <Line type="monotone" dataKey="calls" stroke="#14b8a6" strokeWidth={3} dot={{ r: 4, fill: '#14b8a6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h2 className="text-lg font-medium text-white mb-4">各管道來電比例</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dynamicPieData.length > 0 ? dynamicPieData : pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(dynamicPieData.length > 0 ? dynamicPieData : pieData).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            {(dynamicPieData.length > 0 ? dynamicPieData : pieData).map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm text-slate-300">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-medium text-white">最近通話列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/50 text-xs uppercase text-slate-500 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium">時間</th>
                <th className="px-6 py-4 font-medium">來電號碼</th>
                <th className="px-6 py-4 font-medium">來電管道</th>
                <th className="px-6 py-4 font-medium">通話時長</th>
                <th className="px-6 py-4 font-medium">預估成本</th>
                <th className="px-6 py-4 font-medium">處理結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {calls.slice(0, 5).map((call, i) => (
                <tr key={call.id || i} className="hover:bg-slate-700/50 transition-colors cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap">{call.time}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-200">{call.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{call.channel}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{call.duration}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-rose-400 font-mono">
                    ${call.estimatedCost?.toFixed(3) || '0.000'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      call.status === 'AI完成' ? 'text-teal-400 bg-teal-400/10' : 
                      call.status === '轉人工' ? 'text-yellow-400 bg-yellow-400/10' : 
                      'text-rose-400 bg-rose-400/10'
                    }`}>
                      {call.status}
                    </span>
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    目前沒有通話記錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

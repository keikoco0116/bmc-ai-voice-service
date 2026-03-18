import { Link } from 'react-router-dom';
import { Settings, PhoneCall, Bot } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0f1c] flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-4 bg-teal-500/10 rounded-3xl mb-6 border border-teal-500/20 shadow-lg shadow-teal-500/10">
          <Bot className="w-12 h-12 text-teal-400" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
          AI 語音客服系統
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto">
          請選擇您要進入的系統介面
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* Admin Card */}
        <Link 
          to="/admin"
          className="group relative bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-teal-500/50 rounded-3xl p-8 transition-all duration-300 overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="w-20 h-20 bg-slate-800 group-hover:bg-teal-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300">
            <Settings className="w-10 h-10 text-slate-400 group-hover:text-teal-400 transition-colors duration-300" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">系統管理</h2>
          <p className="text-slate-400">
            進入後台控制中心，設定電話方案、管理 AI 知識庫與檢視通話報表。
          </p>
        </Link>

        {/* Client Card */}
        <Link 
          to="/client"
          className="group relative bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-8 transition-all duration-300 overflow-hidden flex flex-col items-center text-center"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="w-20 h-20 bg-slate-800 group-hover:bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 transition-colors duration-300">
            <PhoneCall className="w-10 h-10 text-slate-400 group-hover:text-blue-400 transition-colors duration-300" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">通話介面</h2>
          <p className="text-slate-400">
            進入前台通話介面，體驗與 AI 語音助理的超低延遲即時對話。
          </p>
        </Link>
      </div>
      
      <div className="mt-16 text-slate-600 text-sm">
        &copy; {new Date().getFullYear()} BMC Enterprise. All rights reserved.
      </div>
    </div>
  );
}

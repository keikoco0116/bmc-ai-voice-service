import { useState, useEffect } from 'react';
import { isAbortedError } from '../../lib/utils';
import { Phone, Mic, Sparkles, Bot, Loader2, Link as LinkIcon, Globe } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';

interface ServiceChannel {
  id: string;
  name: string;
  phoneNumber: string;
  agentId: string | null;
  agentName?: string;
  agentType?: string;
  webSlug: string;
  isActive: boolean;
}

export default function ClientHome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const channelId = searchParams.get('channelId');
  const slug = searchParams.get('slug');
  
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<ServiceChannel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchChannels();
  }, [channelId, slug]);

  const fetchChannels = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'channels'));
      const channelsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceChannel));
      
      const agentsSnap = await getDocs(collection(db, 'agents'));
      const agentsData = agentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as { id: string, name: string, type: string }));

      const dataWithAgents = channelsData.map(channel => {
        if (channel.agentId) {
          const agent = agentsData.find(a => a.id === channel.agentId);
          if (agent) {
            return {
              ...channel,
              agentName: agent.name,
              agentType: agent.type
            };
          }
        }
        return channel;
      });

      setChannels(dataWithAgents);
      
      if (channelId) {
        const found = dataWithAgents.find(c => c.id === channelId);
        if (found) setCurrentChannel(found);
      } else if (slug) {
        const found = dataWithAgents.find(c => c.webSlug === slug);
        if (found) setCurrentChannel(found);
      }
    } catch (error) {
      if (isAbortedError(error)) return;
      console.error('Failed to fetch channels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#0a0f1c]">
        <Loader2 className="w-12 h-12 text-teal-400 animate-spin" />
      </div>
    );
  }

  // If a specific channel is selected
  if (currentChannel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[#0a0f1c]">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-teal-500/10 rounded-2xl mb-4 border border-teal-500/20">
            <Sparkles className="w-8 h-8 text-teal-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">{currentChannel.name}</h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            歡迎使用 AI 語音客服。請選擇您偏好的進線方式。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full">
          {/* Phone Call Card */}
          <div className="bg-slate-900/50 border border-slate-800 backdrop-blur-sm p-8 rounded-3xl flex flex-col items-center text-center hover:bg-slate-800/50 hover:border-blue-500/30 transition-all duration-300 group">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-blue-500/20">
              <Phone className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">撥打客服專線</h2>
            <p className="text-slate-400 mb-8 flex-1">
              使用您的市話或手機直接撥打免付費專線，將由 <span className="text-teal-400 font-bold">AI 總機系統</span> 為您服務。
            </p>
            <div className="text-4xl font-black text-blue-400 mb-8 tracking-wider">
              {currentChannel.phoneNumber}
            </div>
            <button 
              onClick={() => navigate(`/client/call?agentId=${currentChannel.agentId}&channelId=${currentChannel.id}&type=phone`)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors text-lg shadow-lg shadow-blue-500/20"
            >
              立即撥打 (模擬測試)
            </button>
          </div>

          {/* Web Call Card */}
          <div className="bg-slate-900/50 border border-slate-800 backdrop-blur-sm p-8 rounded-3xl flex flex-col items-center text-center hover:bg-slate-800/50 hover:border-teal-500/30 transition-all duration-300 group">
            <div className="w-16 h-16 bg-teal-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-teal-500/20">
              <Mic className="w-8 h-8 text-teal-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">網頁語音通話</h2>
            <p className="text-slate-400 mb-6 flex-1">
              無需撥打電話，直接透過電腦或手機的麥克風與 AI 客服進行即時對話。
            </p>
            
            <div className="w-full space-y-3 mb-6 flex-1 flex flex-col justify-center">
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-lg">{currentChannel.agentName || '未指派專員'}</div>
                  <div className="text-sm text-slate-400">{currentChannel.agentType || 'N/A'}</div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => navigate(`/client/call?agentId=${currentChannel.agentId}&channelId=${currentChannel.id}&type=web`)}
              disabled={!currentChannel.agentId}
              className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-medium transition-colors text-lg shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              開始網頁通話
            </button>
          </div>
        </div>
        
        <button 
          onClick={() => navigate('/client')}
          className="mt-8 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          返回渠道列表
        </button>
      </div>
    );
  }

  // If no specific channel is selected, show a list of all channels (for testing/demo purposes)
  return (
    <div className="flex-1 flex flex-col items-center p-6 min-h-screen bg-[#0a0f1c]">
      <div className="text-center mb-12 mt-12">
        <div className="inline-flex items-center justify-center p-3 bg-teal-500/10 rounded-2xl mb-4 border border-teal-500/20">
          <Globe className="w-8 h-8 text-teal-400" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">選擇客服渠道</h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto">
          請選擇您要測試的客服渠道。在實際應用中，客戶會直接透過專屬連結進入特定渠道。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
        {channels.map(channel => (
          <div key={channel.id} className="bg-slate-900/50 border border-slate-800 backdrop-blur-sm p-6 rounded-2xl flex flex-col hover:border-teal-500/50 transition-all duration-300 group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Phone className="w-6 h-6 text-blue-400" />
              </div>
              <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-700">
                {channel.webSlug}
              </span>
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2">{channel.name}</h3>
            <div className="text-lg font-medium text-blue-400 mb-4">{channel.phoneNumber}</div>
            
            <div className="flex items-center gap-3 text-sm mb-6 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Bot className="w-5 h-5 text-teal-400" />
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">{channel.agentName || '未指派專員'}</span>
                <span className="text-slate-500 text-xs">{channel.agentType || 'N/A'}</span>
              </div>
            </div>
            
            <button 
              onClick={() => navigate(`/client?slug=${channel.webSlug}`)}
              className="mt-auto w-full py-3 bg-slate-800 hover:bg-teal-500/20 text-white hover:text-teal-400 border border-slate-700 hover:border-teal-500/50 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              進入此渠道
            </button>
          </div>
        ))}
        
        {channels.length === 0 && (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-400">目前沒有設定任何客服渠道，請至後台新增。</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { isAbortedError } from '../../lib/utils';
import { Phone, Server, Star, MessageSquare, PhoneCall, CheckCircle2, ChevronRight, ChevronLeft, Save, Info, ArrowRightLeft, Zap, Globe, Loader2, CheckCircle, Plus, Trash2, Edit, Link as LinkIcon, Bot, ExternalLink, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { db } from '../../firebase';
import { collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

interface AIAgent {
  id: string;
  name: string;
  type: string;
}

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

const plans = [
  { id: 'PSTN-A', icon: Phone, title: '傳統電話 + Twilio', subtitle: '最快上線 2-3 週', badge: '推薦', desc: '最快上線的傳統電話方案，透過 Twilio 處理語音，DIDWW 提供號碼。' },
  { id: 'PSTN-B', icon: Server, title: '傳統電話 + FreeSWITCH', subtitle: '最低成本 4-6 週', desc: '最低成本方案，透過 WebSocket 橋接直接串接 Gemini Live API。' },
  { id: 'PSTN-C', icon: Star, title: 'Retell AI 一站式', subtitle: '最簡單 1-2 週', desc: '一站式解決方案，整合語音與 AI。' },
  { id: 'LINE-A', icon: MessageSquare, title: 'LINE Call Plus', subtitle: '最高覆蓋率 6-16 週', desc: '透過 LINE 官方帳號接聽語音通話。' },
  { id: 'WA-A', icon: PhoneCall, title: 'WhatsApp 語音', subtitle: '備選方案', desc: '透過 WhatsApp Business API 處理語音。' },
];

const steps = [
  { id: 1, title: '選擇通訊方案' },
  { id: 2, title: '設定專線與憑證' },
  { id: 3, title: '指派 AI 與網頁介面' }
];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  
  // Wizard State
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('PSTN-A');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentId, setAgentId] = useState<string | ''>('');
  const [webSlug, setWebSlug] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const channelsSnap = await getDocs(collection(db, 'channels'));
      const agentsSnap = await getDocs(collection(db, 'agents'));
      
      const agentsData: AIAgent[] = [];
      agentsSnap.forEach(doc => agentsData.push({ id: doc.id, ...doc.data() } as AIAgent));
      
      const channelsData: ServiceChannel[] = [];
      channelsSnap.forEach(doc => {
        const data = doc.data();
        const agent = agentsData.find(a => a.id === data.agentId);
        channelsData.push({
          id: doc.id,
          ...data,
          agentName: agent?.name,
          agentType: agent?.type
        } as ServiceChannel);
      });
      
      setChannels(channelsData);
      setAgents(agentsData);
    } catch (error) {
      if (isAbortedError(error)) return;
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setName('');
    setPhoneNumber('');
    setAgentId(agents.length > 0 ? agents[0].id : '');
    setWebSlug(`channel-${Math.floor(Math.random() * 10000)}`);
    setWizardStep(1);
    setSelectedPlan('PSTN-A');
    setIsEditing(true);
  };

  const handleEdit = (channel: ServiceChannel) => {
    setEditingId(channel.id);
    setName(channel.name);
    setPhoneNumber(channel.phoneNumber);
    setAgentId(channel.agentId || '');
    setWebSlug(channel.webSlug);
    setWizardStep(2); // Skip plan selection for editing
    setSelectedPlan('PSTN-A'); // Default to PSTN-A for now
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'channels', id));
      fetchData();
      setShowDeleteConfirm(null);
    } catch (error: any) {
      setErrorMessage(error.message || '刪除失敗');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const handleSave = async () => {
    if (!name || !phoneNumber || !webSlug) {
      setErrorMessage('請填寫完整資訊');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    setIsSaving(true);
    const payload = {
      name,
      phoneNumber,
      agentId: agentId === '' ? null : agentId,
      webSlug,
      isActive: true,
      createdAt: Date.now()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'channels', editingId), payload);
      } else {
        await addDoc(collection(db, 'channels'), payload);
      }
      
      await fetchData();
      setIsEditing(false);
    } catch (error: any) {
      console.error('Failed to save channel:', error);
      setErrorMessage(error.message || '儲存失敗');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-teal-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (isEditing) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{editingId ? '編輯專線' : '新增專線'}</h1>
          <button 
            onClick={() => setIsEditing(false)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            返回列表
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-800 -z-10"></div>
          {steps.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-2 bg-[#0f172a] px-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                wizardStep === s.id ? 'bg-teal-500 border-teal-500 text-white' :
                wizardStep > s.id ? 'bg-teal-500/20 border-teal-500/50 text-teal-400' :
                'bg-slate-800 border-slate-700 text-slate-500'
              }`}>
                {wizardStep > s.id ? <CheckCircle2 className="w-5 h-5" /> : s.id}
              </div>
              <span className={`text-xs font-medium ${wizardStep >= s.id ? 'text-teal-400' : 'text-slate-500'}`}>
                {s.title}
              </span>
            </div>
          ))}
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-6">
          {wizardStep === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedPlan === plan.id
                      ? 'bg-teal-500/10 border-teal-500'
                      : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${selectedPlan === plan.id ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-800 text-slate-400'}`}>
                      <plan.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-bold ${selectedPlan === plan.id ? 'text-teal-400' : 'text-white'}`}>{plan.title}</h3>
                        {plan.badge && (
                          <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded uppercase tracking-wider">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mb-2">{plan.subtitle}</div>
                      <p className="text-sm text-slate-500 leading-relaxed">{plan.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-6">
              {selectedPlan === 'PSTN-A' && (
                <>
                  {/* Architecture Diagram for DIDWW -> Twilio -> Gemini */}
                  <div className="p-6 bg-slate-900/50 border border-slate-700 rounded-xl">
                    <h3 className="text-sm font-bold text-teal-400 mb-6 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      系統架構說明 (DIDWW + Twilio + Gemini)
                    </h3>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm">
                      {/* User */}
                      <div className="flex flex-col items-center gap-2 w-full md:w-1/6">
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-600">
                          <Phone className="w-4 h-4 text-slate-300" />
                        </div>
                        <span className="text-slate-300 font-medium text-xs">客戶撥打</span>
                      </div>

                      {/* Arrow 1 */}
                      <div className="hidden md:flex flex-col items-center flex-1">
                        <ArrowRightLeft className="w-4 h-4 text-slate-600 mb-1" />
                        <span className="text-[10px] text-slate-500">PSTN</span>
                      </div>

                      {/* DIDWW */}
                      <div className="flex flex-col items-center gap-2 w-full md:w-1/6">
                        <div className="w-10 h-10 bg-purple-900/30 rounded-xl flex items-center justify-center border border-purple-500/30">
                          <Globe className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-purple-400 font-bold text-xs">DIDWW</span>
                        <span className="text-[10px] text-slate-500 text-center">Toll-Free 號碼</span>
                      </div>

                      {/* Arrow 2 */}
                      <div className="hidden md:flex flex-col items-center flex-1">
                        <ArrowRightLeft className="w-4 h-4 text-slate-600 mb-1" />
                        <span className="text-[10px] text-slate-500">SIP Trunk</span>
                      </div>

                      {/* Twilio */}
                      <div className="flex flex-col items-center gap-2 w-full md:w-1/6">
                        <div className="w-10 h-10 bg-blue-900/30 rounded-xl flex items-center justify-center border border-blue-500/30">
                          <span className="font-bold text-blue-400 text-xs">Twilio</span>
                        </div>
                        <span className="text-blue-400 font-bold text-xs">語音閘道</span>
                        <span className="text-[10px] text-slate-500 text-center">Media Streams</span>
                      </div>

                      {/* Arrow 3 */}
                      <div className="hidden md:flex flex-col items-center flex-1">
                        <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/30 to-teal-500/30 relative">
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t-2 border-r-2 border-teal-500/50 rotate-45"></div>
                        </div>
                        <span className="text-[10px] text-teal-400 font-medium mt-1">WebSocket</span>
                      </div>

                      {/* Gemini */}
                      <div className="flex flex-col items-center gap-2 w-full md:w-1/6">
                        <div className="w-10 h-10 bg-teal-900/30 rounded-xl flex items-center justify-center border border-teal-500/30">
                          <Star className="w-5 h-5 text-teal-400" />
                        </div>
                        <span className="text-teal-400 font-bold text-xs">Gemini</span>
                        <span className="text-[10px] text-slate-500 text-center">Native Audio</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-purple-400 border-b border-slate-700 pb-2">1. 專線號碼設定</h4>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">DIDWW 撥入號碼 (Toll-Free Number)</label>
                      <input 
                        type="text" 
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" 
                        placeholder="例如：0800-123-456" 
                      />
                      <p className="text-xs text-slate-500 mt-1">您在 DIDWW 購買的免付費號碼，將作為此專線的代表號</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <h4 className="text-sm font-bold text-blue-400 border-b border-slate-700 pb-2">2. Twilio 設定 (語音閘道)</h4>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Twilio Account SID</label>
                      <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">Twilio Auth Token</label>
                      <input type="password" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" placeholder="••••••••••••••••••••••••••••••••" />
                    </div>
                  </div>
                </>
              )}

              {selectedPlan !== 'PSTN-A' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-teal-400 border-b border-slate-700 pb-2">專線號碼設定</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">專線號碼 / 頻道 ID</label>
                    <input 
                      type="text" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" 
                      placeholder="例如：0800-123-456 或 @line_id" 
                    />
                  </div>
                  <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-400">
                    此方案的詳細 API 憑證設定欄位將於後續版本開放。目前請先設定代表號碼。
                  </div>
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">專線名稱</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" 
                  placeholder="例如：VIP 專屬客服、外帶點餐專線" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">負責的 AI 專員</label>
                <select 
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">請選擇 AI 專員</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.type})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">當客戶透過此號碼或專屬網頁進線時，將由這位 AI 專員接聽</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">網頁對話介面代碼 (Slug)</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm">/client?slug=</span>
                  <input 
                    type="text" 
                    value={webSlug}
                    onChange={(e) => setWebSlug(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500" 
                    placeholder="例如：vip-support" 
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">這將產生一個專屬的網頁通話連結</p>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-700 flex justify-between items-center">
            <button
              onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : setIsEditing(false)}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium flex items-center gap-2"
            >
              {wizardStep > 1 ? <ChevronLeft className="w-4 h-4" /> : null}
              {wizardStep > 1 ? '上一步' : '取消'}
            </button>
            
            {wizardStep < 3 ? (
              <button
                onClick={() => setWizardStep(wizardStep + 1)}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium flex items-center gap-2 shadow-lg shadow-teal-500/20"
              >
                下一步
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                儲存設定
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl relative">
      {errorMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-8 z-50 bg-rose-500 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2"
        >
          <AlertCircle className="w-5 h-5" />
          {errorMessage}
        </motion.div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-xl font-bold text-white mb-2">確定要刪除嗎？</h3>
            <p className="text-slate-400 mb-6">此操作無法復原，該專線的所有設定將被移除。</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
              >
                刪除
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">專線設定</h1>
          <p className="text-sm text-slate-400 mt-1">管理您的客服號碼、指派 AI 專員，並產出專屬的網頁對話介面</p>
        </div>
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium shadow-lg shadow-teal-500/20"
        >
          <Plus className="w-4 h-4" />
          新增專線
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {channels.map(channel => (
          <div key={channel.id} className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col hover:border-teal-500/50 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                  <Phone className="w-6 h-6 text-blue-400" />
                </div>
                {channel.agentType === '總機' && (
                  <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded uppercase tracking-wider border border-teal-500/30">
                    總機
                  </span>
                )}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(channel)} className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-colors" title="編輯">
                  <Edit className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    const url = `${window.location.origin}/client?slug=${channel.webSlug}`;
                    navigator.clipboard.writeText(url);
                    setErrorMessage('連結已複製');
                    setTimeout(() => setErrorMessage(''), 2000);
                  }} 
                  className="p-1.5 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-colors" 
                  title="複製連結"
                >
                  <LinkIcon className="w-4 h-4" />
                </button>
                <a 
                  href={`/client?slug=${channel.webSlug}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                  title="測試專線"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button onClick={() => setShowDeleteConfirm(channel.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors" title="刪除">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-1">{channel.name}</h3>
            <div className="text-2xl font-black text-blue-400 mb-4 tracking-wider">
              {channel.phoneNumber}
            </div>
            
            <div className="space-y-3 mt-auto pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-3 text-sm">
                <Bot className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">
                  {channel.agentName ? `${channel.agentName} (${channel.agentType})` : <span className="text-rose-400">未指派 AI 專員</span>}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <LinkIcon className="w-4 h-4 text-slate-400" />
                <a 
                  href={`/client?slug=${channel.webSlug}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:text-teal-300 hover:underline truncate"
                >
                  /client?slug={channel.webSlug}
                </a>
              </div>
              
              {/* Twilio Webhook Info */}
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <div className="text-xs font-medium text-slate-400 mb-2">Twilio Webhook 設定 (A CALL COMES IN)</div>
                <div className="bg-slate-900 rounded p-2 text-xs font-mono text-slate-300 break-all mb-1">
                  {window.location.origin}/api/twilio/voice
                </div>
                <div className="text-xs text-slate-500">Method: <span className="text-blue-400 font-medium">HTTP POST</span></div>
              </div>
            </div>
          </div>
        ))}
        
        {channels.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed">
            <Phone className="w-12 h-12 text-slate-500 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-white mb-2">尚無專線</h3>
            <p className="text-slate-400 mb-6">點擊上方按鈕新增您的第一個客服號碼與網頁介面</p>
            <button 
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              立即新增
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

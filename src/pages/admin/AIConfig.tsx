import { useState, useEffect } from 'react';
import { isAbortedError } from '../../lib/utils';
import { motion } from 'motion/react';
import { Save, Bot, Volume2, Languages, Sparkles, Plus, Trash2, Edit2, CheckCircle2, Loader2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { db } from '../../firebase';
import { collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

interface AIAgent {
  id: string;
  name: string;
  type: string;
  systemPrompt: string;
  knowledgeBase: string;
  isActive: boolean;
  voiceModel?: string;
  voiceSpeed?: number;
  voicePitch?: number;
}

export default function AIConfig() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('總機');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // Voice settings state
  const [voiceModel, setVoiceModel] = useState('Google Cloud TTS - zh-TW-Standard-A (女聲)');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(0);

  const agentTypes = ['總機', '點餐專員', '訂位專員'];

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchAll = async () => {
      await Promise.all([
        fetchAgents(abortController.signal),
        fetchConfig(abortController.signal)
      ]);
      if (isMounted) setIsLoading(false);
    };

    fetchAll();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  const fetchConfig = async (signal?: AbortSignal) => {
    try {
      const configDoc = await getDoc(doc(db, 'config', 'global'));
      if (signal?.aborted) return;
      if (configDoc.exists()) {
        const data = configDoc.data();
        if (data.geminiApiKey) {
          setCustomApiKey(data.geminiApiKey);
        }
      }
    } catch (error) {
      if (isAbortedError(error)) return;
      console.error('Failed to fetch config:', error);
    }
  };

  const [apiKeySaveMessage, setApiKeySaveMessage] = useState('');

  const handleSaveApiKey = async () => {
    console.log('Saving API Key to database:', customApiKey ? 'Key provided' : 'Empty key');
    try {
      // Save to global for admin/server use
      await setDoc(doc(db, 'config', 'global'), { geminiApiKey: customApiKey }, { merge: true });
      // Save to public for web client (visitor) use
      await setDoc(doc(db, 'config', 'public'), { geminiApiKey: customApiKey }, { merge: true });
      
      setApiKeySaveMessage('儲存成功！已同步至雲端');
      setTimeout(() => setApiKeySaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save API key:', error);
      setApiKeySaveMessage('連線失敗');
    }
  };

  const fetchAgents = async (signal?: AbortSignal) => {
    try {
      const querySnapshot = await getDocs(collection(db, 'agents'));
      if (signal?.aborted) return;
      const data: AIAgent[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as AIAgent);
      });
      setAgents(data);
      if (data.length > 0 && !selectedAgentId) {
        selectAgent(data[0]);
      }
    } catch (error) {
      if (isAbortedError(error)) return;
      console.error('Failed to fetch agents:', error);
    }
  };

  const selectAgent = (agent: AIAgent) => {
    setSelectedAgentId(agent.id);
    setName(agent.name);
    setType(agent.type);
    setSystemPrompt(agent.systemPrompt);
    setKnowledgeBase(agent.knowledgeBase || '');
    setVoiceModel(agent.voiceModel || 'Google Cloud TTS - zh-TW-Standard-A (女聲)');
    setVoiceSpeed(agent.voiceSpeed || 1.0);
    setVoicePitch(agent.voicePitch || 0);
  };

  const handleCreateNew = () => {
    setSelectedAgentId(null);
    setName('新 AI 客服');
    setType('總機');
    setSystemPrompt('你是一個專業的總機人員...');
    setKnowledgeBase('');
    setVoiceModel('Google Cloud TTS - zh-TW-Standard-A (女聲)');
    setVoiceSpeed(1.0);
    setVoicePitch(0);
  };

  const handleTypeChange = (newType: string) => {
    setType(newType);
    // Auto-update prompt based on type if creating new or user wants to reset
    if (newType === '總機') {
      setSystemPrompt('你是一個專業的總機人員。負責接聽電話、基本問候，並根據客戶需求轉接給點餐專員或訂位專員。語氣親切專業。當服務結束時，請禮貌地說再見並祝客戶有美好的一天。');
    } else if (newType === '點餐專員') {
      setSystemPrompt('你是一個專業的餐廳點餐專員。負責協助客戶完成點餐，確認餐點品項、數量、特殊需求（如素食、過敏），並覆誦訂單。語氣熱情有耐心。當點餐完成後，請禮貌地說再見並告知餐點將盡快準備。');
    } else if (newType === '訂位專員') {
      setSystemPrompt('你是一個專業的餐廳訂位專員。負責協助客戶預訂座位，確認日期、時間、人數，以及是否有特殊慶祝活動。語氣禮貌周到。當訂位完成後，請禮貌地說再見並期待客戶的光臨。');
    }
  };

  const handleOptimizePrompt = async () => {
    if (!systemPrompt.trim()) {
      setErrorMessage('請先輸入基本的提示詞內容');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    setIsOptimizing(true);
    try {
      const apiKey = customApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('找不到 Gemini API Key，請先在上方設定');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你是一個專業的 AI 客服提示詞工程師。請幫我優化以下 AI 語音客服的系統提示詞 (System Prompt)。
        
當前角色：${name} (${type})
當前提示詞：
${systemPrompt}

請將其改寫得更專業、更詳細，包含語氣設定、行為準則、以及應對進退的規範。
請直接回傳優化後的提示詞內容，不要包含任何其他解釋或 Markdown 標籤。`,
      });
      
      if (response.text) {
        setSystemPrompt(response.text.trim());
        setSaveMessage('提示詞已優化');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error: any) {
      if (isAbortedError(error)) return;
      console.error('Failed to optimize prompt:', error);
      
      const errMsg = error.message || '';
      if (errMsg.includes('Rate exceeded') || errMsg.includes('Quota exceeded')) {
        setErrorMessage('API 使用量已達上限。請稍候再試，或更換您的 API Key。');
      } else {
        setErrorMessage(errMsg || '優化失敗');
      }
      
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    
    const payload = {
      name,
      type,
      systemPrompt,
      knowledgeBase,
      voiceModel,
      voiceSpeed,
      voicePitch,
      isActive: true,
      createdAt: Date.now()
    };

    try {
      if (selectedAgentId) {
        // Update existing
        await updateDoc(doc(db, 'agents', selectedAgentId), payload);
      } else {
        // Create new
        const docRef = await addDoc(collection(db, 'agents'), payload);
        setSelectedAgentId(docRef.id);
      }
      
      await fetchAgents();
      setSaveMessage('設定已儲存');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save agent:', error);
      setSaveMessage('儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'agents', id));
      if (selectedAgentId === id) {
        setSelectedAgentId(null);
      }
      await fetchAgents();
      setShowDeleteConfirm(null);
    } catch (error: any) {
      if (isAbortedError(error)) return;
      setErrorMessage(error.message || '刪除失敗');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-teal-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl relative">
      {errorMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-8 z-50 bg-rose-500 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
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
            <p className="text-slate-400 mb-6">此操作無法復原，該 AI 客服的所有設定與知識庫將被移除。</p>
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

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">AI 客服設定</h1>
          <p className="text-sm text-slate-400 mt-1">管理多個不同角色的 AI 客服專員</p>
        </div>
        <div className="flex items-center gap-4">
          {saveMessage && (
            <span className={`text-sm flex items-center gap-1 ${saveMessage.includes('失敗') ? 'text-rose-400' : 'text-teal-400'}`}>
              <CheckCircle2 className="w-4 h-4" /> {saveMessage}
            </span>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium shadow-lg shadow-teal-500/20 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存設定
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Agent List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">客服列表</h2>
            <button 
              onClick={handleCreateNew}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg transition-colors border border-slate-700"
              title="新增 AI 客服"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-2">
            {agents.map(agent => (
              <div 
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                  selectedAgentId === agent.id 
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Bot className="w-5 h-5 flex-shrink-0" />
                  <div className="truncate">
                    <div className="font-medium truncate flex items-center gap-2">
                      {agent.name}
                      {agent.type === '總機' && (
                        <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-400 text-[9px] font-bold rounded uppercase">總機</span>
                      )}
                    </div>
                    <div className="text-xs opacity-70">{agent.type}</div>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(agent.id); }}
                  className="p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {agents.length === 0 && !selectedAgentId && (
              <div className="text-sm text-slate-500 text-center py-4">尚無 AI 客服，請點擊上方新增</div>
            )}
          </div>
        </div>

        {/* Main Content: Agent Editor */}
        <div className="lg:col-span-3 space-y-6">
          {/* API Key Configuration Block */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 border-l-4 border-l-blue-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-white">Gemini API Key 設定</h2>
                  <p className="text-sm text-slate-400">用於語音 Live 功能，設定後將同步至所有裝置</p>
                </div>
              </div>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
              >
                申請 API Key
              </a>
            </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <input 
                    type="password" 
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    placeholder="輸入您的 Gemini API Key..."
                  />
                  <button 
                    onClick={handleSaveApiKey}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    儲存 Key
                  </button>
                </div>
                {apiKeySaveMessage && (
                  <motion.span 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-teal-400 flex items-center gap-1 mt-1"
                  >
                    <CheckCircle2 className="w-3 h-3" /> {apiKeySaveMessage}
                  </motion.span>
                )}
              </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">客服名稱</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="例如：訂位專員小美"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">客服種類</label>
                <select 
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  {agentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-teal-500/10 rounded-lg flex items-center justify-center text-teal-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">系統提示詞 (System Prompt)</h2>
                <p className="text-sm text-slate-400">定義此 AI 客服的角色、語氣與行為準則</p>
              </div>
            </div>
            
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-48 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-300 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none"
              placeholder="請輸入系統提示詞..."
            />
            
            <div className="mt-4 flex justify-end">
              <button 
                onClick={handleOptimizePrompt}
                disabled={isOptimizing}
                className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors disabled:opacity-50"
              >
                {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isOptimizing ? '優化中...' : '使用 AI 輔助優化提示詞'}
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white">語音設定</h2>
                <p className="text-sm text-slate-400">調整 AI 的聲音特徵</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">聲音模型</label>
                <select 
                  value={voiceModel}
                  onChange={(e) => setVoiceModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-300 focus:outline-none focus:border-teal-500"
                >
                  <option>Google Cloud TTS - zh-TW-Standard-A (女聲)</option>
                  <option>Google Cloud TTS - zh-TW-Standard-B (男聲)</option>
                  <option>Google Cloud TTS - zh-TW-Wavenet-A (女聲 - 高品質)</option>
                  <option>Google Cloud TTS - zh-TW-Wavenet-B (男聲 - 高品質)</option>
                  <option>Gemini Live - Zephyr (中性)</option>
                  <option>Gemini Live - Puck (男聲)</option>
                  <option>Gemini Live - Charon (男聲)</option>
                  <option>Gemini Live - Kore (女聲)</option>
                  <option>Gemini Live - Fenrir (男聲)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">語速 (Speed): {voiceSpeed}</label>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2" 
                    step="0.1" 
                    value={voiceSpeed} 
                    onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                    className="w-full accent-teal-500" 
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>慢</span>
                    <span>正常</span>
                    <span>快</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">音調 (Pitch): {voicePitch}</label>
                  <input 
                    type="range" 
                    min="-20" 
                    max="20" 
                    step="1" 
                    value={voicePitch} 
                    onChange={(e) => setVoicePitch(parseInt(e.target.value))}
                    className="w-full accent-teal-500" 
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>低</span>
                    <span>正常</span>
                    <span>高</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

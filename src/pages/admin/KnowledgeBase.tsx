import React, { useState, useEffect, useRef } from 'react';
import { isAbortedError } from '../../lib/utils';
import { BookOpen, Plus, FileText, Upload, Trash2, Edit, Bot, Loader2, Save, CheckCircle2, Link as LinkIcon, AlignLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../firebase';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';

interface AIAgent {
  id: string;
  name: string;
  type: string;
  systemPrompt: string;
  knowledgeBase: string; // JSON string of KnowledgeSource[]
  isActive: boolean;
}

interface KnowledgeSource {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'file' | 'url';
  updatedAt: number;
}

export default function KnowledgeBase() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'agents'));
      const data: AIAgent[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as AIAgent);
      });
      setAgents(data);
      if (data.length > 0 && !selectedAgentId) {
        selectAgent(data[0]);
      }
      setIsLoading(false);
    } catch (error) {
      if (isAbortedError(error)) return;
      console.error('Failed to fetch agents:', error);
      setIsLoading(false);
    }
  };

  const selectAgent = (agent: AIAgent) => {
    setSelectedAgentId(agent.id);
    
    // Parse knowledgeBase string into sources array
    if (agent.knowledgeBase) {
      try {
        const parsed = JSON.parse(agent.knowledgeBase);
        if (Array.isArray(parsed)) {
          setSources(parsed);
        } else {
          // Legacy plain text migration
          setSources([{
            id: Date.now().toString(),
            title: '舊版知識庫內容',
            content: agent.knowledgeBase,
            type: 'text',
            updatedAt: Date.now()
          }]);
        }
      } catch (e) {
        // Legacy plain text migration
        setSources([{
          id: Date.now().toString(),
          title: '舊版知識庫內容',
          content: agent.knowledgeBase,
          type: 'text',
          updatedAt: Date.now()
        }]);
      }
    } else {
      setSources([]);
    }
  };

  const handleSave = async () => {
    if (!selectedAgentId) return;
    setIsSaving(true);
    setSaveMessage('');
    
    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) return;

    const payload = {
      name: agent.name,
      type: agent.type,
      systemPrompt: agent.systemPrompt,
      isActive: agent.isActive,
      knowledgeBase: JSON.stringify(sources)
    };

    try {
      await updateDoc(doc(db, 'agents', selectedAgentId), payload);
      
      // Update local agents state to prevent re-parsing issues
      setAgents(prev => prev.map(a => a.id === selectedAgentId ? { ...a, knowledgeBase: JSON.stringify(sources) } : a));
      
      setSaveMessage('知識庫已更新');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save knowledge base:', error);
      setSaveMessage('更新失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddText = () => {
    setEditingSource({
      id: Date.now().toString(),
      title: '新增文字來源',
      content: '',
      type: 'text',
      updatedAt: Date.now()
    });
    setIsModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const newSource: KnowledgeSource = {
          id: Date.now().toString(),
          title: file.name,
          content: content,
          type: 'file',
          updatedAt: Date.now()
        };
        setSources(prev => [...prev, newSource]);
        setSaveMessage('文件已匯入，請記得儲存');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUrlImport = () => {
    const url = prompt('請輸入要匯入的網址 (URL)：\n(此功能為展示用途，實際需後端爬蟲支援)');
    if (url) {
      setSaveMessage('已送出網址解析請求...');
      setTimeout(() => {
        const newSource: KnowledgeSource = {
          id: Date.now().toString(),
          title: url,
          content: `[從 ${url} 匯入的內容]\n...`,
          type: 'url',
          updatedAt: Date.now()
        };
        setSources(prev => [...prev, newSource]);
        setSaveMessage('網址內容已匯入，請記得儲存');
        setTimeout(() => setSaveMessage(''), 3000);
      }, 1500);
    }
  };

  const handleDeleteSource = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('確定要刪除此來源嗎？')) {
      setSources(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleEditSource = (source: KnowledgeSource) => {
    setEditingSource({ ...source });
    setIsModalOpen(true);
  };

  const saveModalSource = () => {
    if (!editingSource) return;
    
    setSources(prev => {
      const exists = prev.find(s => s.id === editingSource.id);
      if (exists) {
        return prev.map(s => s.id === editingSource.id ? { ...editingSource, updatedAt: Date.now() } : s);
      } else {
        return [...prev, { ...editingSource, updatedAt: Date.now() }];
      }
    });
    setIsModalOpen(false);
    setEditingSource(null);
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'file': return <FileText className="w-5 h-5 text-blue-400" />;
      case 'url': return <LinkIcon className="w-5 h-5 text-emerald-400" />;
      default: return <AlignLeft className="w-5 h-5 text-amber-400" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-teal-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">知識庫管理</h1>
          <p className="text-sm text-slate-400 mt-1">為不同的 AI 客服專員配置多來源的知識庫內容</p>
        </div>
        <div className="flex items-center gap-4">
          {saveMessage && (
            <span className={`text-sm flex items-center gap-1 ${saveMessage.includes('失敗') ? 'text-rose-400' : 'text-teal-400'}`}>
              <CheckCircle2 className="w-4 h-4" /> {saveMessage}
            </span>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving || !selectedAgentId}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium shadow-lg shadow-teal-500/20 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存知識庫
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Agent List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-medium text-white">選擇客服專員</h2>
          <div className="space-y-2">
            {agents.map(agent => (
              <div 
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                  selectedAgentId === agent.id 
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Bot className="w-5 h-5 flex-shrink-0" />
                <div className="truncate">
                  <div className="font-medium truncate">{agent.name}</div>
                  <div className="text-xs opacity-70">{agent.type}</div>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-4">尚無 AI 客服，請先至 AI 設定新增</div>
            )}
          </div>
        </div>

        {/* Main Content: Sources Grid */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-500/10 rounded-lg flex items-center justify-center text-teal-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-white">
                    {agents.find(a => a.id === selectedAgentId)?.name || '未選擇'} 的來源清單
                  </h2>
                  <p className="text-sm text-slate-400">新增多個來源，AI 將綜合這些資訊回答問題</p>
                </div>
              </div>
            </div>
            
            {/* Add Source Buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
              <input 
                type="file" 
                accept=".txt,.md,.csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button 
                onClick={handleAddText}
                disabled={!selectedAgentId}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                <AlignLeft className="w-4 h-4" />
                新增文字
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedAgentId}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                上傳文件
              </button>
              <button 
                onClick={handleUrlImport}
                disabled={!selectedAgentId}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                <LinkIcon className="w-4 h-4" />
                匯入網址
              </button>
            </div>

            {/* Sources Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map(source => (
                <div 
                  key={source.id}
                  onClick={() => handleEditSource(source)}
                  className="bg-slate-900 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-teal-500/50 hover:bg-slate-800/80 transition-all group relative flex flex-col h-40"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getSourceIcon(source.type)}
                      <h3 className="font-medium text-white truncate max-w-[180px]">{source.title}</h3>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSource(source.id, e)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed flex-1">
                    {source.content}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>{new Date(source.updatedAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1 group-hover:text-teal-400 transition-colors">
                      <Edit className="w-3 h-3" /> 編輯
                    </span>
                  </div>
                </div>
              ))}

              {sources.length === 0 && selectedAgentId && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-xl">
                  <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">尚無知識庫來源</p>
                  <p className="text-sm text-slate-500 mt-1">請使用上方按鈕新增文字、上傳文件或匯入網址</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isModalOpen && editingSource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  {getSourceIcon(editingSource.type)}
                  <input 
                    type="text" 
                    value={editingSource.title}
                    onChange={(e) => setEditingSource({...editingSource, title: e.target.value})}
                    className="bg-transparent border-none text-lg font-medium text-white focus:outline-none focus:ring-0 w-64"
                    placeholder="來源標題"
                  />
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-hidden flex flex-col">
                <textarea
                  value={editingSource.content}
                  onChange={(e) => setEditingSource({...editingSource, content: e.target.value})}
                  className="w-full flex-1 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-300 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none font-mono text-sm leading-relaxed min-h-[400px]"
                  placeholder="請輸入來源內容..."
                />
              </div>
              
              <div className="p-4 border-t border-slate-700 flex justify-between items-center bg-slate-800/50">
                <span className="text-xs text-slate-500">
                  字數統計：{editingSource.content.length} 字
                </span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={saveModalSource}
                    className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium"
                  >
                    確認
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

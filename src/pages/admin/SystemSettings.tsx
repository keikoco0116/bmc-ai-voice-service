import { useState, useEffect } from 'react';
import { isAbortedError } from '../../lib/utils';
import { Settings, Shield, Bell, Database, Save, CheckCircle2, PhoneCall, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const [companyName, setCompanyName] = useState('BMC 企業');
  const [hotlineNumber, setHotlineNumber] = useState('0800-123-456');
  const [sipUri, setSipUri] = useState('');
  const [twilioNumber, setTwilioNumber] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTestingSip, setIsTestingSip] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    const fetchConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'config', 'global'));
        if (!isMounted) return;
        if (configDoc.exists()) {
          const data = configDoc.data();
          if (data.companyName) setCompanyName(data.companyName);
          if (data.hotlineNumber) setHotlineNumber(data.hotlineNumber);
          if (data.sipUri) setSipUri(data.sipUri);
          if (data.twilioNumber) setTwilioNumber(data.twilioNumber);
        }
      } catch (error) {
        if (isAbortedError(error)) return;
        console.error('Failed to fetch config:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchConfig();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  const handleSave = async () => {
    setSaveError(null);
    try {
      await setDoc(doc(db, 'config', 'global'), {
        companyName,
        hotlineNumber,
        sipUri,
        twilioNumber
      }, { merge: true });
      
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error: any) {
      if (isAbortedError(error)) return;
      console.error('Failed to save config:', error);
      setSaveError(error.message || '儲存失敗，請檢查權限');
    }
  };

  const handleTestSip = async () => {
    setIsTestingSip(true);
    setTestResult(null);
    const abortController = new AbortController();
    try {
      const response = await fetch('/api/test-zoiper', { signal: abortController.signal });
      const data = await response.json();
      if (data.success) {
        setTestResult({ success: true, message: `測試成功！已發送呼叫至 ${sipUri}` });
      } else {
        setTestResult({ success: false, message: `測試失敗：${data.error || '未知錯誤'}` });
      }
    } catch (error: any) {
      if (isAbortedError(error)) return;
      setTestResult({ success: false, message: `連線失敗：${error.message}` });
    } finally {
      setIsTestingSip(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">系統設定</h1>
        {isSaved && (
          <div className="flex items-center gap-2 text-teal-400 bg-teal-500/10 px-4 py-2 rounded-lg border border-teal-500/20">
            <CheckCircle2 className="w-5 h-5" />
            <span>設定已儲存</span>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">
            <AlertCircle className="w-5 h-5" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="space-y-1">
          <button 
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-left transition-colors ${
              activeTab === 'general' ? 'bg-teal-500/10 text-teal-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            一般設定
          </button>
          <button 
            onClick={() => setActiveTab('sip')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-left transition-colors ${
              activeTab === 'sip' ? 'bg-teal-500/10 text-teal-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <PhoneCall className="w-5 h-5" />
            SIP 轉接設定
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg font-medium text-left transition-colors">
            <Shield className="w-5 h-5" />
            安全性與權限
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg font-medium text-left transition-colors">
            <Database className="w-5 h-5" />
            資料備份
          </button>
        </div>

        {/* Settings Content */}
        <div className="md:col-span-3 space-y-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            {activeTab === 'general' ? (
              <>
                <h2 className="text-lg font-medium text-white mb-6">一般設定</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">公司名稱</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">客服專線號碼</label>
                    <input 
                      type="text" 
                      value={hotlineNumber}
                      onChange={(e) => setHotlineNumber(e.target.value)}
                      placeholder="例如：0800-123-456"
                      className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                    <p className="text-xs text-slate-500 mt-2">此號碼將顯示於前台供客戶撥打。</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">時區</label>
                    <select className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500">
                      <option>Asia/Taipei (GMT+8)</option>
                      <option>Asia/Tokyo (GMT+9)</option>
                      <option>America/New_York (GMT-5)</option>
                    </select>
                  </div>

                  <div className="pt-6 flex justify-end">
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 text-slate-900 rounded-lg hover:bg-teal-400 transition-colors font-bold shadow-lg shadow-teal-500/20"
                    >
                      <Save className="w-5 h-5" />
                      儲存變更
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium text-white mb-6">SIP 轉接設定 (Zoiper)</h2>
                <div className="space-y-6">
                  <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-6">
                    <p className="text-sm text-blue-300 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      系統會優先使用您在 Secrets 中設定的環境變數。若此處留空，則會自動讀取 Secrets。
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">SIP URI (覆蓋 Secrets)</label>
                    <input 
                      type="text" 
                      value={sipUri}
                      onChange={(e) => setSipUri(e.target.value)}
                      placeholder="例如：sip:agent01@your-domain.sip.twilio.com"
                      className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                    <p className="text-xs text-slate-500 mt-2">若您想手動覆蓋 Secrets 中的 SIP_URI，請在此輸入。</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Twilio 發話號碼 (覆蓋 Secrets)</label>
                    <input 
                      type="text" 
                      value={twilioNumber}
                      onChange={(e) => setTwilioNumber(e.target.value)}
                      placeholder="例如：+886277001234"
                      className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  <div className="flex items-center gap-4 pt-4">
                    <button
                      onClick={handleTestSip}
                      disabled={isTestingSip}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm disabled:opacity-50"
                    >
                      {isTestingSip ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                      測試 Zoiper 呼叫
                    </button>
                    {testResult && (
                      <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-teal-400' : 'text-rose-400'}`}>
                        {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span>{testResult.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 flex justify-end">
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 text-slate-900 rounded-lg hover:bg-teal-400 transition-colors font-bold shadow-lg shadow-teal-500/20"
                    >
                      <Save className="w-5 h-5" />
                      儲存變更
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

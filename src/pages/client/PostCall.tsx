import { useState } from 'react';
import { CheckCircle2, Star, MessageSquare, PhoneCall } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function PostCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const summary = location.state?.summary || '無通話內容';
  const duration = location.state?.duration || '00:00';

  const handleSubmit = () => {
    navigate('/client');
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1c] relative font-sans p-6 overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto w-full py-12">
        
        {/* Success Header */}
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 bg-teal-500/10 text-teal-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-teal-500/20 shadow-lg shadow-teal-500/10">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">通話已結束</h1>
          <p className="text-slate-400 text-lg">通話時間 {duration}</p>
        </motion.div>

        {/* Summary Card */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/50 p-8 rounded-3xl shadow-xl border border-slate-800 backdrop-blur-sm w-full"
        >
          <h2 className="text-sm font-bold text-teal-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            本次通話摘要
          </h2>
          <p className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap">
            {summary}
          </p>
        </motion.div>

        {/* Rating Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-900/50 p-8 rounded-3xl shadow-xl border border-slate-800 backdrop-blur-sm w-full"
        >
          <h2 className="text-xl font-bold text-white mb-6 text-center">請評分本次服務</h2>
          <div className="flex justify-center gap-4 mb-8">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`p-2 transition-all hover:scale-110 ${rating >= star ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'text-slate-700 hover:text-yellow-400/50'}`}
              >
                <Star className="w-10 h-10 fill-current" />
              </button>
            ))}
          </div>
          
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="您的意見（選填）"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 resize-none h-32 placeholder:text-slate-600"
          />
        </motion.div>

        {/* Actions */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="w-full space-y-4 pt-4"
        >
          <button 
            onClick={handleSubmit}
            className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-teal-500/20 transition-colors flex items-center justify-center gap-2"
          >
            提交評分並回首頁
          </button>
          
          <button className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2">
            <PhoneCall className="w-5 h-5 text-slate-400" />
            申請真人回電
          </button>
          <p className="text-sm text-center text-slate-500 mt-4">問題未解決時使用，我們將在 2 小時內回電</p>
        </motion.div>

      </div>
    </div>
  );
}

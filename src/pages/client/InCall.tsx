import { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, Loader2, MessageSquare, MicOff, PhoneCall } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AudioRecorder, AudioPlayer } from '../../lib/audio';
import { db } from '../../firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc } from 'firebase/firestore';

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
  greetingText?: string;
}

import { isAbortedError } from '../../lib/utils';
import { Device } from '@twilio/voice-sdk';

export default function InCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState('初始化中');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  
  // Twilio State
  const [twilioDevice, setTwilioDevice] = useState<Device | null>(null);
  const twilioDeviceRef = useRef<Device | null>(null);
  const twilioCallRef = useRef<any>(null);
  const twilioReadyRef = useRef<boolean>(false); // Twilio Device 是否已完成 register
  
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Initialize Twilio Device
  useEffect(() => {
    let isMounted = true;
    let deviceInstance: Device | null = null;
    const abortController = new AbortController();

    const initTwilio = async () => {
      try {
        const res = await fetch('/api/auth/twilio-token', { signal: abortController.signal });
        if (!isMounted) return;
        
        const data = await res.json();
        if (data.error) {
          setErrorDetail(`Twilio 權限錯誤: ${data.error}`);
          return;
        }
        
        const device = new Device(data.token, {
          logLevel: 1,
        });
        deviceInstance = device;
        setTwilioDevice(device);
        twilioDeviceRef.current = device;
        
        device.on('registered', () => {
          if (!isMounted) {
            device.destroy();
            return;
          }
          console.log('Twilio Device Registered');
        });
        
        device.on('error', (error) => {
          if (!isMounted) return;
          if (isAbortedError(error)) return;
          console.error('Twilio Device Error:', error);
          setErrorDetail(`語音設備錯誤: ${error.message}`);
        });
        
        await device.register();
        if (!isMounted) {
          device.destroy();
          return;
        }
        twilioReadyRef.current = true;
        console.log('Twilio Device registered and ready');

        if (!data.hasAppSid) {
          console.warn('Missing TWILIO_TWIML_APP_SID. Outgoing calls might fail.');
        }
      } catch (err: any) {
        if (!isMounted || isAbortedError(err)) return;
        console.error('Failed to init Twilio Device:', err);
        setErrorDetail(`初始化語音設備失敗: ${err.message || err}`);
      }
    };
    initTwilio();

    return () => {
      isMounted = false;
      abortController.abort();
      if (deviceInstance) {
        deviceInstance.destroy();
      }
    };
  }, []);

  const [messages, setMessages] = useState<{ role: string; text: string; time: string; isFinished?: boolean }[]>([]);
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [channelInfo, setChannelInfo] = useState<{ id: string; name: string; phoneNumber: string; type: string } | null>(null);
  const [dbApiKey, setDbApiKey] = useState<string | null>(null);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<number>();
  const isCallingRef = useRef(false);
  const isEndingRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingTransferRef = useRef(false); // 等 AI 說完話後再轉接
  const isGreetingRef = useRef(false); // 標記 AI 正在發送開頭語，此期間麥克風保持靜音
  const sessionOpenedRef = useRef(false); // 標記 Gemini Live onopen 已觸發

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        // Fetch DB API Key from public config (accessible to visitors)
        const configDoc = await getDoc(doc(db, 'config', 'public'));
        if (configDoc.exists()) {
          const configData = configDoc.data();
          if (configData.geminiApiKey) {
            setDbApiKey(configData.geminiApiKey);
          }
        }

        const searchParams = new URLSearchParams(location.search);
        const agentId = searchParams.get('agentId');
        const channelId = searchParams.get('channelId');
        const slug = searchParams.get('slug');
        const callType = searchParams.get('type') || 'web';
        
        let targetAgentId = agentId;

        if (slug) {
          const q = query(collection(db, 'channels'), where('webSlug', '==', slug));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            setChannelInfo({
              id: snap.docs[0].id,
              name: data.name,
              phoneNumber: data.phoneNumber,
              type: callType === 'phone' ? 'Phone' : 'Web'
            });
            targetAgentId = data.agentId;
          }
        } else if (channelId) {
          const docSnap = await getDoc(doc(db, 'channels', channelId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setChannelInfo({
              id: docSnap.id,
              name: data.name,
              phoneNumber: data.phoneNumber,
              type: callType === 'phone' ? 'Phone' : 'Web'
            });
            if (!targetAgentId) targetAgentId = data.agentId;
          }
        }

        if (targetAgentId) {
          // 使用後端 API 讀取 agent（繞過 Firestore 安全規則，訪客也可讀取）
          try {
            const agentRes = await fetch(`/api/agents/${targetAgentId}`);
            if (agentRes.ok) {
              const agentData = await agentRes.json();
              setAgent(agentData as AIAgent);
            } else {
              // fallback: 嘗試直接從 Firebase 讀取
              const agentDoc = await getDoc(doc(db, 'agents', targetAgentId));
              if (agentDoc.exists()) {
                setAgent({ id: agentDoc.id, ...agentDoc.data() } as AIAgent);
              }
            }
          } catch (e) {
            // fallback: 嘗試直接從 Firebase 讀取
            const agentDoc = await getDoc(doc(db, 'agents', targetAgentId));
            if (agentDoc.exists()) {
              setAgent({ id: agentDoc.id, ...agentDoc.data() } as AIAgent);
            }
          }
        }

        setStatus('準備就緒');
      } catch (err: any) {
        if (!isMountedRef.current || isAbortedError(err)) return;
        console.error('Failed to fetch agent info:', err);
        setStatus('初始化失敗');
      }
    };

    fetchAgentInfo();

    return () => {
      if (recorderRef.current) recorderRef.current.stop();
      if (playerRef.current) playerRef.current.stop();
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
          try {
            const res = session.close();
            if (res && typeof res.catch === 'function') {
              res.catch(() => {});
            }
          } catch (e) {}
        }).catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [location.search]);

  const startCall = async () => {
    try {
      setErrorDetail(null);
      // 1. 檢查並保持麥克風權限
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        if (isAbortedError(e) || e?.name === 'NotAllowedError') {
          console.log('Microphone access aborted or denied');
          if (isMountedRef.current) setStatus('準備就緒');
          return;
        }
        throw e;
      }
      
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      setStatus('連接中');
      isCallingRef.current = true;
      
      // iOS 需要在用戶手勢中預先建立 AudioContext，之後才能播放等候音樂
      if (!holdAudioCtxRef.current || holdAudioCtxRef.current.state === 'closed') {
        holdAudioCtxRef.current = new AudioContext();
      }
      if (holdAudioCtxRef.current.state === 'suspended') {
        holdAudioCtxRef.current.resume().catch(() => {});
      }

      // iOS 相容性：如果 Twilio Device 尚未就緒，在用戶手勢中重新初始化
      if (!twilioDeviceRef.current) {
        console.log('Twilio Device not ready, re-initializing in user gesture...');
        try {
          const tokenRes = await fetch('/api/auth/twilio-token');
          const tokenData = await tokenRes.json();
          if (!tokenData.error) {
            // 使用已静態 import 的 Device（避免重複動態 import）
            const newDevice = new Device(tokenData.token, { logLevel: 1 });
            twilioDeviceRef.current = newDevice;
            setTwilioDevice(newDevice);
            newDevice.register().then(() => {
              twilioReadyRef.current = true;
              console.log('Twilio Device re-registered in user gesture');
            }).catch(e => console.warn('Twilio re-register failed:', e));
          }
        } catch (e) {
          console.warn('Twilio re-init failed:', e);
        }
      }

      playerRef.current = new AudioPlayer();
      await playerRef.current.resume();
      
      const recorder = new AudioRecorder((base64Data) => {
        if (!isMutedRef.current && sessionRef.current && isCallingRef.current) {
          sessionRef.current.then((session: any) => {
            try {
              const res = session.sendRealtimeInput({
                media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
              if (res && typeof res.catch === 'function') {
                res.catch(() => {});
              }
            } catch (e) {
              // Ignore send errors if session is closing
            }
          }).catch(() => {});
        }
      });
      recorderRef.current = recorder;
      await recorderRef.current.resume();

      const customApiKey = localStorage.getItem('CUSTOM_GEMINI_API_KEY') || dbApiKey;
      const isUsingCustom = !!(customApiKey && customApiKey.trim() !== '');
      const apiKey = isUsingCustom ? customApiKey : process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === 'undefined') {
        setStatus('API Key 缺失');
        setErrorDetail('請在後台設定中填寫您的 Gemini API Key');
        isCallingRef.current = false;
        stream.getTracks().forEach(t => t.stop());
        throw new Error('Missing Gemini API Key');
      }

      aiRef.current = new GoogleGenAI({ apiKey });
      
      let formattedKnowledge = agent?.knowledgeBase || '無';
      try {
        const parsed = JSON.parse(agent?.knowledgeBase || '');
        if (Array.isArray(parsed)) {
          formattedKnowledge = parsed.map((src: any) => `【${src.title}】\n${src.content}`).join('\n\n');
        }
      } catch (e) {
        // Not JSON, use as is
      }
      
      const baseInstruction = agent 
        ? `${agent.systemPrompt}\n\n知識庫內容：\n${formattedKnowledge}`
        : "你是一個專業的 AI 語音客服人員。你的名字是「小幫手」。你的語氣應該要禮貌、專業且簡潔。";
      
      const transferInstruction = `
【絕對優先指令 - 真人轉接】：
1. 當客戶提到「真人」、「專人」、「轉接」、「找人」、「客服人員」或任何表達想與人類通話的意圖時，你必須「立刻」回覆轉接標籤。
2. 你的回覆格式必須嚴格遵守：先說一段簡短的禮貌回覆，然後緊接著加上 [TRANSFER_TO_HUMAN] 標籤。
3. 範例回覆：「好的，沒問題，我現在立刻為您轉接專人，請稍候。[TRANSFER_TO_HUMAN]」
4. 請注意：[TRANSFER_TO_HUMAN] 標籤僅供系統辨識，請勿將標籤文字唸出來。
5. 嚴禁在客戶要求轉接時嘗試繼續回答問題或詢問原因，必須直接執行轉接。
`;

      const systemInstruction = `${transferInstruction}\n\n${baseInstruction}\n\n【強制指令 - 嚴格遵守】：\n1. 直接開口說話，絕對不要輸出任何思考過程、動作描述（如 **Acknowledge**）或英文。\n2. 只能輸出你要說出口的「繁體中文」台詞。\n3. 保持極度簡短，1到2句話結束。\n4. 當服務完成或客戶要離開時，請務必說出「再見」或「祝您有美好的一天」來結束通話。`;

      // Determine voice name from agent settings
      let voiceName = "Zephyr";
      if (agent?.voiceModel) {
        if (agent.voiceModel.includes('Zephyr')) voiceName = "Zephyr";
        else if (agent.voiceModel.includes('Puck')) voiceName = "Puck";
        else if (agent.voiceModel.includes('Charon')) voiceName = "Charon";
        else if (agent.voiceModel.includes('Kore')) voiceName = "Kore";
        else if (agent.voiceModel.includes('Fenrir')) voiceName = "Fenrir";
      }

      const sessionPromise = aiRef.current.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            if (!isMountedRef.current) {
              sessionPromise.then((s: any) => s.close()).catch(() => {});
              return;
            }
            console.log('Live API Connection Opened');
            sessionOpenedRef.current = true; // 標記連線已開啟
            setStatus('通話中');
            isCallingRef.current = true;
            timerRef.current = window.setInterval(() => {
              setTime(t => t + 1);
            }, 1000);
            
            if (recorderRef.current) {
              recorderRef.current.startWithStream(stream).catch(e => {
                console.error('Failed to start recorder with stream:', e);
              });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!isMountedRef.current) return;
            const modelTurn = message.serverContent?.modelTurn;
            if (modelTurn && playerRef.current) {
              const audioPart = modelTurn.parts.find(p => p.inlineData?.data);
              if (audioPart && audioPart.inlineData?.data) {
                // AI 開始說話，防止手機回音：停止收音
                if (recorderRef.current) recorderRef.current.muteInput();
                playerRef.current.playBase64(audioPart.inlineData.data);
              }
            }
            
            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.stop();
              // 用戶打斷 AI，立即恢復收音
              if (recorderRef.current) recorderRef.current.unmuteInput();
            }

            // 忽略 modelTurn 裡的 text (通常是 AI 的英文思考過程)，只使用語音的逐字稿 (outputTranscription)
            let outputTranscription = message.serverContent?.outputTranscription?.text;
            if (outputTranscription) {
              console.log('AI Transcription:', outputTranscription);
              
              setMessages(prev => {
                const last = prev[prev.length - 1];
                let newText = outputTranscription;
                
                // 檢查是否包含轉接標籤
                const hasTransferTag = outputTranscription.includes('[TRANSFER_TO_HUMAN]');
                
                // 移除轉接標籤，避免顯示在 UI 上
                const cleanTranscription = outputTranscription.replace('[TRANSFER_TO_HUMAN]', '').trim();
                
                if (last && last.role === 'ai' && !last.isFinished) {
                  const updatedMessages = [...prev.slice(0, -1), { ...last, text: last.text + cleanTranscription }];
                  
                  // 檢查整個最後一則訊息是否包含標籤 (防止標籤被切斷)
                  const fullText = last.text + outputTranscription;
                  if (fullText.includes('[TRANSFER_TO_HUMAN]')) {
                    console.log('Web Call Transfer detected in full text - waiting for AI to finish speaking');
                    pendingTransferRef.current = true;
                    setStatus('正在轉接專人...');
                  }
                  
                  return updatedMessages;
                } else {
                  if (hasTransferTag) {
                    console.log('Web Call Transfer detected in new chunk - waiting for AI to finish speaking');
                    pendingTransferRef.current = true;
                    setStatus('正在轉接專人...');
                  }
                  return [...prev, { role: 'ai', text: cleanTranscription, time: getCurrentTimeStr(), isFinished: false }];
                }
              });
            }

            if (message.serverContent?.turnComplete) {
               setMessages(prev => {
                 const last = prev[prev.length - 1];
                 if (last && last.role === 'ai') {
                   return [...prev.slice(0, -1), { ...last, isFinished: true }];
                 }
                 return prev;
               });
               // AI 說完話，等音訊播完後再恢復收音（防止回音）
               const resumeRecordingAfterPlayback = () => {
                 if (playerRef.current && playerRef.current.getIsPlaying()) {
                   setTimeout(resumeRecordingAfterPlayback, 100);
                 } else {
                   if (recorderRef.current) recorderRef.current.unmuteInput();
                 }
               };
               setTimeout(resumeRecordingAfterPlayback, 100);
               // AI 說完話了，如果有待執行的轉接
               if (pendingTransferRef.current) {
                 pendingTransferRef.current = false;
                 console.log('turnComplete - starting hold music immediately and waiting for audio');
                 // 立即播放等候音樂（AI 說完話的瞬間就開始）
                 startHoldMusic();
                 // 等音訊播放完畢再執行轉接：同時用 getIsPlaying() 和備用計時器（iOS 相容）
                 let transferred = false;
                 const doTransfer = () => {
                   if (transferred) return;
                   transferred = true;
                   console.log('Executing transfer now');
                   handleWebTransfer();
                 };
                 // 備用計時器：最多等 3 秒強制執行（iOS 上 getIsPlaying 可能不可靠）
                 const fallbackTimer = setTimeout(doTransfer, 3000);
                 const waitForAudio = () => {
                   if (playerRef.current && playerRef.current.getIsPlaying()) {
                     setTimeout(waitForAudio, 200);
                   } else {
                     clearTimeout(fallbackTimer);
                     doTransfer();
                   }
                 };
                 setTimeout(waitForAudio, 300);
               }
            }
            
            const inputTranscription = message.serverContent?.inputTranscription;
            if (inputTranscription && inputTranscription.text) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user' && !last.isFinished) {
                  return [...prev.slice(0, -1), { ...last, text: last.text + inputTranscription.text }];
                } else {
                  return [...prev, { role: 'user', text: inputTranscription.text, time: getCurrentTimeStr(), isFinished: false }];
                }
              });
              
              if (inputTranscription.finished) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.role === 'user') {
                    return [...prev.slice(0, -1), { ...last, isFinished: true }];
                  }
                  return prev;
                });
              }
            }
          },
          onerror: (error) => {
            if (!isMountedRef.current || isAbortedError(error)) return;
            console.error('Live API Error Detail:', error);
            setStatus('連接錯誤');
            
            const errMsg = error.message || '';
            if (errMsg.includes('Rate exceeded') || errMsg.includes('Quota exceeded')) {
              setErrorDetail('API 使用量已達上限。如果您使用的是免費版 API，請稍候再試，或在後台設定中更換為您的個人 API Key 以獲得更高配額。');
            } else {
              setErrorDetail(errMsg || '連線發生未知錯誤');
            }
            
            isCallingRef.current = false;
            if (recorderRef.current) recorderRef.current.stop();
          },
          onclose: (event: any) => {
            if (!isMountedRef.current) return;
            console.log('Live API Connection Closed:', event);
            isCallingRef.current = false;
            if (recorderRef.current) recorderRef.current.stop();
            
            // 如果是異常關閉，顯示更多資訊
            if (event && event.reason) {
              if (isAbortedError(event.reason)) return;
              console.warn('Close Reason:', event.reason);
              const reason = event.reason || '';
              
              if (reason.includes('API key not valid')) {
                setStatus('API Key 無效');
                setErrorDetail('您的 API Key 權限不足或尚未開啟帳單功能。請確認 Google Cloud 專案已綁定信用卡並啟用 Generative Language API。');
              } else if (reason.includes('Rate exceeded') || reason.includes('Quota exceeded')) {
                setStatus('配額用盡');
                setErrorDetail('API 使用量已達上限。請稍候再試，或在後台設定中更換為您的個人 API Key。');
              } else {
                setStatus('通話結束');
                setErrorDetail(reason);
              }
            } else {
              setStatus('通話結束');
            }
            if (timerRef.current) clearInterval(timerRef.current);
          }
        }
      });
      
      sessionRef.current = sessionPromise;
      // 等待 onopen 觸發後再播放開頭語（最多等 5 秒）
      sessionOpenedRef.current = false;
      const greetingText = agent?.greetingText?.trim();
      if (greetingText) {
        (async () => {
          // 等待 onopen 觸發（最多 5 秒）
          let waitMs = 0;
          while (!sessionOpenedRef.current && waitMs < 5000) {
            await new Promise(r => setTimeout(r, 100));
            waitMs += 100;
          }
          if (!isMountedRef.current || !isCallingRef.current) return;
          if (!sessionOpenedRef.current) {
            console.warn('onopen not triggered within 5s, skipping greeting');
            return;
          }
          // 再等 300ms 確保 AudioPlayer 完全就緒
          await new Promise(r => setTimeout(r, 300));
          if (!isMountedRef.current || !isCallingRef.current) return;

          try {
            console.log('Playing TTS greeting:', greetingText);
            // 確保 AudioPlayer AudioContext 已 resume
            if (playerRef.current) await playerRef.current.resume();
            const resp = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: greetingText })
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.audio && playerRef.current && isMountedRef.current) {
                playerRef.current.playBase64(data.audio);
                console.log('TTS greeting played successfully');
              }
            } else {
              const errText = await resp.text();
              console.warn('TTS API failed:', errText);
            }
          } catch (e) {
            console.warn('TTS greeting error:', e);
          }
        })();
      }
      sessionPromise.catch(err => {
        if (!isMountedRef.current || isAbortedError(err)) return;
        console.error('Live API Session Connection Failed:', err);
        if (isMountedRef.current) {
          setStatus(`連線失敗: ${err.message || err}`);
        }
      });
    } catch (err: any) {
      if (!isMountedRef.current || isAbortedError(err)) return;
      console.error('Failed to initialize call:', err);
      if (isMountedRef.current) {
        setStatus(`連接失敗: ${err.message || err}`);
      }
    }
  };

  // 播放前端等候音樂（用 Web Audio API 產生輕柔的提示音循環）
  // iOS 要求 AudioContext 必須在用戶手勢中建立，所以在通話開始時預先建立並保存
  const holdAudioCtxRef = useRef<AudioContext | null>(null);
  const holdMusicRef = useRef<{ stop: () => void } | null>(null);

  const startHoldMusic = () => {
    try {
      // 重用已建立的 AudioContext，或建立新的
      let ctx = holdAudioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContext();
        holdAudioCtxRef.current = ctx;
      }
      // iOS 上需要 resume
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      let stopped = false;
      const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
        if (!ctx || ctx.state === 'closed') return;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(gain, startTime + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const scheduleLoop = () => {
        if (stopped || !ctx || ctx.state === 'closed') return;
        const now = ctx.currentTime;
        playTone(392, now + 0.05, 0.3, 0.08);       // G4
        playTone(523, now + 0.4, 0.3, 0.08);         // C5
        setTimeout(scheduleLoop, 1500);
      };
      scheduleLoop();
      holdMusicRef.current = {
        stop: () => {
          stopped = true;
        }
      };
    } catch (e) {
      console.warn('Hold music failed:', e);
    }
  };

  const stopHoldMusic = () => {
    if (holdMusicRef.current) {
      holdMusicRef.current.stop();
      holdMusicRef.current = null;
    }
  };

  const handleWebTransfer = async () => {
    setStatus('轉接真人中...');

    try {
      // 1. Stop Gemini
      if (sessionRef.current) {
        sessionRef.current.then((s: any) => {
          try {
            const res = s.close();
            if (res && typeof res.catch === 'function') {
              res.catch(() => {});
            }
          } catch (e) {}
        }).catch(() => {});
        isCallingRef.current = false;
      }
      if (recorderRef.current) recorderRef.current.stop();
      if (playerRef.current) playerRef.current.stop();

      // 等候音樂已在 turnComplete 時開始，這裡不重複呼叫

      // 2. Initiate Twilio Conference Transfer
      const conferenceId = 'conf_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      console.log('Initiating Web Transfer with Conference ID:', conferenceId);

      // Tell server to call the SIP URI and join the conference
      const transferRes = await fetch('/api/web/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent?.id,
          fromName: 'Web User',
          conferenceId: conferenceId
        })
      });

      const transferData = await transferRes.json();
      if (!transferRes.ok || !transferData.success) {
        throw new Error(transferData.error || '無法啟動伺服器端轉接');
      }

      // 3. Connect the browser client to the same conference
      // 如果 Twilio Device 尚未就緒，等候最多 5 秒
      let waitAttempts = 0;
      while (!twilioDeviceRef.current && waitAttempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        waitAttempts++;
      }
      console.log(`Twilio Device status: ${twilioDeviceRef.current ? 'ready' : 'null'} (waited ${waitAttempts * 100}ms)`);
      
      if (twilioDeviceRef.current) {
        console.log('Connecting Twilio Device to conference...');
        const call = await twilioDeviceRef.current.connect({
          params: { confId: conferenceId }
        });
        twilioCallRef.current = call;
        
        call.on('accept', () => {
          // Twilio 連線建立，等候音樂繼續播放（需等真人實際接聽才停止）
          console.log('Twilio conference connected, hold music continues until agent answers');
        });

        // 真人接聽時，會話就會有音訊輸入，此時停止等候音樂
        call.on('volume', (_inputVolume: number, outputVolume: number) => {
          if (outputVolume > 0.01) {
            stopHoldMusic();
          }
        });

        call.on('disconnect', () => {
          console.log('Twilio Call disconnected');
          stopHoldMusic();
          setStatus('通話結束');
        });

        call.on('error', (error: any) => {
          console.error('Twilio Call Error:', error);
          stopHoldMusic();
          setErrorDetail(`語音連線錯誤: ${error.message}`);
        });
      } else {
        // Twilio Device 尚未就緒，嘗試重新初始化
        console.error('Twilio Device is null after waiting, attempting re-init...');
        throw new Error('語音設備尚未就緒（請確認網路連線後再試）');
      }

      setStatus('真人通話中');
      console.log('Web Client successfully joined conference for SIP transfer');

    } catch (err: any) {
      if (!isMountedRef.current || isAbortedError(err)) return;
      console.error('Transfer failed:', err);
      stopHoldMusic();
      setStatus('通話中');
      setErrorDetail(`轉接失敗: ${err.message || err}`);
    }
  };

  const handleEndCall = async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    try {
      if (recorderRef.current) recorderRef.current.stop();
      if (playerRef.current) playerRef.current.stop();
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => {
          try {
            const res = session.close();
            if (res && typeof res.catch === 'function') {
              res.catch(() => {});
            }
          } catch (e) {
            // Ignore close errors
          }
        }).catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (twilioCallRef.current) {
        try {
          twilioCallRef.current.disconnect();
        } catch (e) {}
      }
    
    let finalSummary = '無通話內容';
    
    // Save call history
    try {
      const callId = `CALL-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const now = new Date();
      const timeString = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const transcriptText = messages.map(m => `[${m.time}] ${m.role === 'ai' ? 'AI' : 'User'}: ${m.text}`).join('\n');
      
      const callerPhone = channelInfo?.type === 'Phone' ? '0912-345-678' : '網頁通話';
      
      if (transcriptText.trim()) {
        try {
          const customApiKey = localStorage.getItem('CUSTOM_GEMINI_API_KEY') || dbApiKey;
          const apiKey = (customApiKey && customApiKey.trim() !== '') ? customApiKey : process.env.GEMINI_API_KEY;
          
          if (apiKey) {
            const genAI = new GoogleGenAI({ apiKey });
            const response = await genAI.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: `請根據以下客服通話紀錄，產生一段簡短的繁體中文摘要（約 30-50 字），說明客戶的來電目的與處理結果：\n\n${transcriptText}`,
            });
            finalSummary = response.text || '無法生成摘要';
          }
        } catch (e: any) {
          if (isAbortedError(e)) {
            console.log('Summary generation aborted');
          } else {
            console.error('Failed to generate summary:', e);
            finalSummary = '摘要生成失敗';
          }
        }
      }
      
      const exchangeRate = 32.0; // USD to TWD
      const durationMinutes = time / 60;
      // DIDWW 與 Twilio 以 60 秒為單位計費 (不滿一分鐘以一分鐘計)
      const billedMinutes = Math.ceil(durationMinutes || 0.0001); 
      
      // Verified Rates (March 2026)
      const didwwMonthlyRate = 30.0; // Taiwan Toll-Free MRC (from PDF p.27)
      
      // 自動辨別市話 ($0.18) 或手機 ($0.25)
      const isMobile = callerPhone.startsWith('09');
      const didwwCallRate = isMobile ? 0.25 : 0.18;
      
      const twilioRate = 0.0085;     // Twilio SIP Interface ($0.004) + WebRTC ($0.004) + buffer
      const aiModelRate = 0.004;     // Gemini 1.5 Flash Audio (Input $0.0012/m + Output $0.0024/m + buffer)
      
      const didwwMonthlyUsd = Number((didwwMonthlyRate / 1000).toFixed(6)); // Amortized over 1000 calls
      const didwwCallUsd = Number((billedMinutes * didwwCallRate).toFixed(6));
      const twilioUsd = Number((billedMinutes * twilioRate).toFixed(6));
      const aiModelUsd = Number((durationMinutes * aiModelRate).toFixed(6)); // AI 通常按秒或 Token 計費，維持精確值
      
      const totalUsd = Number((didwwMonthlyUsd + didwwCallUsd + twilioUsd + aiModelUsd).toFixed(4));
      const totalTwd = Number((totalUsd * exchangeRate).toFixed(2));
      
      const costBreakdown = {
        didwwMonthlyUsd,
        didwwCallUsd,
        twilioUsd,
        aiModelUsd,
        totalUsd,
        totalTwd,
        rates: {
          didwwMonthly: didwwMonthlyRate,
          didwwCall: didwwCallRate,
          twilio: twilioRate,
          aiModel: aiModelRate,
          exchangeRate
        }
      };
      
      await addDoc(collection(db, 'call_logs'), {
        time: timeString,
        phone: callerPhone,
        channel: channelInfo?.type || 'Web',
        duration: formatTime(time),
        status: 'AI完成',
        intent: agent ? agent.type : '一般諮詢',
        agentId: agent ? agent.id : null,
        transcript: transcriptText,
        summary: finalSummary,
        estimatedCost: totalUsd,
        currency: 'USD',
        exchangeRate: exchangeRate,
        costBreakdown: costBreakdown,
        createdAt: Date.now()
      });
    } catch (error: any) {
      if (isAbortedError(error)) {
        console.log('Firestore operation aborted');
      } else {
        console.error('Failed to save call history:', error);
      }
    }
    
    if (isMountedRef.current) {
      navigate('/client/summary', { state: { summary: finalSummary, duration: formatTime(time) } });
    }
    } catch (e: any) {
      if (isAbortedError(e)) {
        console.log('End call aborted');
      } else {
        console.error('Failed to end call:', e);
      }
    }
  };

  // 自動結束通話：當 AI 說出再見關鍵字時
  useEffect(() => {
    if (messages.length === 0 || isEndingRef.current) return;
    
    const lastMessage = messages[messages.length - 1];
    // 只要是 AI 說的話，且包含再見關鍵字，就準備結束通話
    // 這裡不嚴格要求 isFinished，因為有時候 turnComplete 可能會慢一點
    if (lastMessage && lastMessage.role === 'ai') {
      const farewells = [
        '再見', '拜拜', '掰掰', '下次見', '祝您有美好的一天', '祝您生活愉快', 
        '期待下次為您服務', '祝您順心', 'Goodbye', 'Bye bye', 'Have a nice day',
        '再會', '告辭', '晚安'
      ];
      
      const text = lastMessage.text.toLowerCase();
      const hasFarewell = farewells.some(f => text.includes(f.toLowerCase()));
      
      if (hasFarewell) {
        console.log('AI detected farewell keyword, will end call shortly...');
        
        // 如果已經 finished，就快一點結束；如果還沒，就等一下
        const delay = lastMessage.isFinished ? 2000 : 4000;
        
        const timer = setTimeout(() => {
          if (isMountedRef.current && !isEndingRef.current) {
            console.log('Automatically ending call after AI farewell.');
            handleEndCall();
          }
        }, delay);
        
        return () => clearTimeout(timer);
      }
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1c] relative font-sans">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-slate-800/50 bg-[#0a0f1c]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-500/20 rounded-xl flex items-center justify-center text-teal-400 font-bold border border-teal-500/30">
            AI
          </div>
          <span className="font-bold text-white text-lg">智能客服中心</span>
        </div>
        <button 
          onClick={handleEndCall}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-400 rounded-full text-sm font-medium hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          結束通話
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 pb-32 flex flex-col max-w-4xl mx-auto w-full">
        {/* AI Avatar & Status */}
        <div className="flex flex-col items-center justify-center py-12 mb-8">
          <div className="relative">
            {/* Wave Animation */}
            {status === '通話中' && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -inset-6 bg-teal-500 rounded-full z-0 blur-md"
                />
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                  className="absolute -inset-10 bg-teal-400 rounded-full z-0 blur-lg"
                />
              </>
            )}
            
            <div className="relative z-10 w-28 h-28 bg-slate-800 rounded-full flex items-center justify-center shadow-2xl border border-slate-700">
              <Mic className={`w-12 h-12 ${status === '通話中' ? 'text-teal-400' : 'text-slate-500'}`} />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mt-8">AI 語音助理</h2>
          <div className="flex flex-col items-center gap-3 mt-3">
            <div className="flex items-center gap-2 text-teal-400 font-medium bg-teal-500/10 px-5 py-2 rounded-full border border-teal-500/20">
              {status === '通話中' && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                </span>
              )}
              {status === '通話中' ? `通話中... ${formatTime(time)}` : status}
            </div>
            {errorDetail && (
              <div className="text-xs text-rose-400 bg-rose-500/10 px-4 py-2 rounded-xl max-w-sm text-center border border-rose-500/20">
                {errorDetail}
              </div>
            )}
          </div>
          
          {status === '準備就緒' && (
            <button
              onClick={startCall}
              className="mt-8 flex items-center gap-2 px-8 py-4 bg-teal-500 text-white rounded-full font-bold text-lg hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20"
            >
              <PhoneCall className="w-6 h-6" />
              開始通話
            </button>
          )}
        </div>

        {/* Chat Transcript */}
        <div className="space-y-6 flex-1 flex flex-col justify-end">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-4 text-[15px] shadow-lg ${
                msg.role === 'user' 
                  ? 'bg-slate-800 text-slate-200 rounded-br-sm border border-slate-700' 
                  : 'bg-teal-500/10 text-teal-50 border border-teal-500/20 rounded-bl-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#0a0f1c]/90 backdrop-blur-xl border-t border-slate-800 flex justify-center gap-6">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          disabled={status !== '通話中'}
          className={`flex flex-col items-center gap-2 p-2 transition-colors ${isMuted ? 'text-rose-400' : 'text-slate-400 hover:text-white'} disabled:opacity-50`}
        >
          <div className={`w-14 h-14 rounded-full flex items-center justify-center border ${isMuted ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-800 border-slate-700'}`}>
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </div>
          <span className="text-sm font-medium">{isMuted ? '解除靜音' : '靜音'}</span>
        </button>
      </div>
    </div>
  );
}

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import wavefile from 'wavefile';
const { WaveFile } = wavefile;
import twilio from 'twilio';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

// Load Firebase config manually to avoid import assertion issues
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

import { db } from './src/firebase.ts';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';

// Debug Logger
const logFile = path.join(process.cwd(), 'debug.log');
const debugLog = (msg: string) => {
  const time = new Date().toISOString();
  const line = `[${time}] ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {}
};

// Initialize Firebase Admin for server-side access (bypasses security rules)
if (!admin.apps.length) {
  try {
    const adminKeyPath = path.join(process.cwd(), 'firebase-admin-key.json');
    if (fs.existsSync(adminKeyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(adminKeyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
      debugLog(`✅ Firebase Admin initialized with service account key`);
    } else {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
      debugLog(`✅ Firebase Admin initialized with projectId: ${firebaseConfig.projectId}`);
    }
  } catch (err) {
    debugLog(`⚠️ Firebase Admin initialization warning: ${err}`);
    admin.initializeApp();
  }
}
// Use the named database from config
const adminDb = getAdminFirestore(firebaseConfig.firestoreDatabaseId);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isAbortedError = (err: any) => {
  if (!err) return false;
  const errMsg = (typeof err === 'string' ? err : (err?.message || err?.toString() || '')).toLowerCase();
  const errName = (err?.name || '').toLowerCase();
  
  return errName === 'aborterror' || 
         errMsg.includes('aborted') || 
         errMsg.includes('abort') ||
         errMsg.includes('the user aborted a request');
};

// Twilio Client Helper
const getTwilioClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_S;
  const token = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEI;
  if (!sid || !token) {
    debugLog('❌ Missing Twilio credentials in process.env');
    return null;
  }
  return twilio(sid, token);
};

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath);
  const isProd = process.env.NODE_ENV === 'production';
  
  console.log(`--- Initializing Server ---`);
  console.log(`Mode: ${process.env.NODE_ENV}`);
  console.log(`Dist folder exists: ${hasDist}`);
  console.log(`Final serving mode: ${(isProd || hasDist) ? 'Production' : 'Development (Vite)'}`);

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request Logging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV, hasDist: fs.existsSync(distPath) }));

  // API to get Twilio Access Token for Web Client
  app.get('/api/auth/twilio-token', (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_S;
      const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEI;
      const apiKey = process.env.TWILIO_API_KEY;
      const apiSecret = process.env.TWILIO_API_SECRET;
      const appSid = process.env.TWILIO_TWIML_APP_SID || process.env.TWILIO_TWIML_APP_;

      if (!accountSid || (!authToken && !apiSecret)) {
        return res.status(500).json({ error: '缺少必要的 Twilio 環境變數 (SID/Token)' });
      }

      if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: '請在環境變數中設定 TWILIO_API_KEY 與 TWILIO_API_SECRET 才能啟用網頁通話功能' });
      }

      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const identity = 'web-client-' + Math.random().toString(36).substring(7);
      
      debugLog(`🔐 Using Twilio API Key: ${apiKey.substring(0, 5)}...`);
      const finalKey = apiKey;
      const finalSecret = apiSecret;

      const token = new AccessToken(accountSid, finalKey, finalSecret, { identity });

      const voiceGrant = new VoiceGrant({
        incomingAllow: true,
        outgoingApplicationSid: appSid,
      });

      token.addGrant(voiceGrant);
      res.json({ 
        token: token.toJwt(), 
        identity,
        hasAppSid: !!appSid 
      });
    } catch (err: any) {
      console.error('Token Generation Error:', err);
      res.status(500).json({ error: '產生 Token 失敗: ' + err.message });
    }
  });

  // Helper to get dynamic config from Firestore or Env
  const getDynamicConfig = async () => {
    let sipUri = process.env.SIP_URI;
    let twilioNumber = process.env.TWILIO_PHONE_NUMBER;

    try {
      // Use Web SDK db if adminDb has permission issues
      const configDoc = await getDoc(doc(db, 'config', 'global'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        if (data?.sipUri) sipUri = data.sipUri;
        if (data?.twilioNumber) twilioNumber = data.twilioNumber;
        debugLog(`✅ Fetched dynamic config from Firestore (Web SDK): sipUri=${sipUri}`);
      } else {
        debugLog(`ℹ️ Global config document not found in Firestore (Web SDK), using defaults.`);
      }
    } catch (err: any) {
      debugLog(`⚠️ Failed to fetch dynamic config from Firestore (Web SDK): ${err.message}`);
      
      // Fallback to adminDb just in case
      try {
        const adminConfigDoc = await adminDb.collection('config').doc('global').get();
        if (adminConfigDoc.exists) {
          const data = adminConfigDoc.data();
          if (data?.sipUri) sipUri = data.sipUri;
          if (data?.twilioNumber) twilioNumber = data.twilioNumber;
        }
      } catch (adminErr: any) {
        debugLog(`⚠️ Admin SDK also failed: ${adminErr.message}`);
      }
    }

    // Defaults
    if (!sipUri) sipUri = 'sip:bmc001@bmc-ai-000-to-human.sip.twilio.com';
    if (!sipUri.startsWith('sip:')) sipUri = 'sip:' + sipUri;
    
    return { sipUri, twilioNumber };
  };

  // Debug endpoint to check current config
  app.get('/api/debug/config', async (req, res) => {
    const dynamic = await getDynamicConfig();
    res.json({
      sipUri: dynamic.sipUri,
      twilioNumber: dynamic.twilioNumber || process.env.TWILIO_PHONE_NUMBER || 'DEFAULT',
      appUrl: process.env.APP_URL || 'DEFAULT',
      hasTwilioSid: !!process.env.TWILIO_ACCOUNT_SID,
      hasTwilioToken: !!process.env.TWILIO_AUTH_TOKEN,
      usingFirestore: !!db
    });
  });

  // TTS API - 將文字轉換為語音（用於開頭語播放）
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, agentId } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: '缺少文字內容' });
      }

      // 取得 Gemini API Key（使用 Admin SDK 繞過安全規則）
      let apiKey = process.env.GEMINI_API_KEY;
      try {
        const configDoc = await adminDb.collection('config').doc('global').get();
        if (configDoc.exists && configDoc.data()?.geminiApiKey) {
          apiKey = configDoc.data()!.geminiApiKey;
        }
      } catch (e) { debugLog(`TTS: 讀取 config 失敗: ${e}`); }

      if (!apiKey) {
        return res.status(500).json({ error: '缺少 Gemini API Key' });
      }

      // 使用 Gemini TTS 生成語音
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ role: 'user', parts: [{ text: `請將以下文字轉換為自然的繁體中文語音：${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) {
        return res.status(500).json({ error: 'TTS 生成失敗' });
      }

      // 回傳 base64 PCM 音訊
      res.json({ audio: audioData });
    } catch (err: any) {
      debugLog(`TTS Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Agents API - 使用 Admin SDK 繞過 Firestore 安全規則
  // GET /api/agents - 取得所有 agents
  app.get('/api/agents', async (req, res) => {
    try {
      const snapshot = await adminDb.collection('agents').get();
      const agents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ agents });
    } catch (err: any) {
      debugLog(`GET agents error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agents/:id - 取得單一 agent
  app.get('/api/agents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const docSnap = await adminDb.collection('agents').doc(id).get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({ id: docSnap.id, ...docSnap.data() });
    } catch (err: any) {
      debugLog(`GET agents/${req.params.id} error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agents - 建立新 agent
  app.post('/api/agents', async (req, res) => {
    try {
      const data = req.body;
      const ref = await adminDb.collection('agents').add(data);
      res.json({ id: ref.id, ...data });
    } catch (err: any) {
      debugLog(`POST agents error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/agents/:id - 更新 agent
  app.put('/api/agents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      await adminDb.collection('agents').doc(id).set(data, { merge: true });
      res.json({ id, ...data });
    } catch (err: any) {
      debugLog(`PUT agents/${req.params.id} error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/agents/:id - 刪除 agent
  app.delete('/api/agents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await adminDb.collection('agents').doc(id).delete();
      res.json({ success: true });
    } catch (err: any) {
      debugLog(`DELETE agents/${req.params.id} error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Zoiper Test Endpoint
  app.get('/api/test-zoiper', async (req, res) => {
    try {
      const client = getTwilioClient();
      if (!client) {
        return res.status(500).json({ error: 'Twilio credentials missing. Please check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' });
      }
      
      const { sipUri, twilioNumber } = await getDynamicConfig();
      const fromNumber = twilioNumber || process.env.TWILIO_PHONE_NUMBER || '+1234567890';
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="zh-TW">這是一通測試電話。如果您聽到這個聲音，代表您的 Zoiper 與 Twilio 設定完全正確。通話即將結束，再見。</Say>
</Response>`;
      
      const call = await client.calls.create({
        twiml: twiml,
        to: sipUri,
        from: fromNumber,
      });
      
      res.json({ 
        success: true, 
        message: '測試電話已撥出！請檢查您的 Zoiper 是否響起。', 
        callSid: call.sid, 
        sipUri: sipUri 
      });
    } catch (err: any) {
      console.error('Zoiper Test Call Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  // Shared Voice Webhook Logic
  const handleVoiceWebhook = async (req: any, res: any) => {
    try {
      const confId = req.body.confId || req.query.confId;
      const transferToHuman = req.body.transferToHuman || req.query.transferToHuman;
      
      debugLog(`📞 Voice Webhook: confId=${confId}, transferToHuman=${transferToHuman}, method=${req.method}`);
      
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      
      const response = new twilio.twiml.VoiceResponse();

      // 1. Handle Transfer to Human (Direct SIP)
      if (transferToHuman === 'true' || transferToHuman === true || req.body.transferToHuman === 'true') {
        const { sipUri, twilioNumber } = await getDynamicConfig();
        const fromNumber = twilioNumber || process.env.TWILIO_PHONE_NUMBER;
        
        if (!sipUri) {
          debugLog(`⚠️ Transfer requested but SIP_URI is empty`);
          response.say({ voice: 'alice', language: 'zh-TW' }, '抱歉，系統尚未設定轉接目標，無法轉接。');
          res.type('text/xml');
          return res.send(response.toString());
        }

        const finalSipUri = sipUri.startsWith('sip:') ? sipUri : `sip:${sipUri}`;
        debugLog(`📞 Transferring to SIP: ${finalSipUri} (CallerID: ${fromNumber})`);
        
        response.say({ voice: 'alice', language: 'zh-TW' }, '好的，正在為您轉接專人，請稍候。');
        // 播放等候音樂（Twilio 官方等候音樂）
        response.play({ loop: 5 }, 'https://demo.twilio.com/docs/classic.mp3');
        const dial = response.dial({ 
          timeout: 30, 
          callerId: fromNumber || undefined,
          action: '/api/twilio/dial-status'
        });
        dial.sip(finalSipUri);
        
        res.type('text/xml');
        return res.send(response.toString());
      }

      // 2. Handle Conference
      if (confId) {
        debugLog(`🌐 Joining conference: ${confId}`);
        const dial = response.dial();
        dial.conference({
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        }, String(confId));
        res.type('text/xml');
        return res.send(response.toString());
      }

      // 3. Default: Connect to AI Stream
      const agentId = req.query.agentId || req.body.agentId || '';
      const from = req.body.From || req.query.From || 'Unknown';
      const wsUrl = `${protocol === 'https' ? 'wss' : 'ws'}://${host}/api/twilio/stream?agentId=${agentId}&from=${encodeURIComponent(from)}`;
      
      debugLog(`Incoming call from ${from}. Routing to AI Stream: ${wsUrl}`);

      const connect = response.connect();
      connect.stream({ url: wsUrl });

      res.type('text/xml');
      return res.send(response.toString());
    } catch (err: any) {
      debugLog(`❌ Voice Webhook Error: ${err.message}`);
      const response = new twilio.twiml.VoiceResponse();
      response.say({ voice: 'alice', language: 'zh-TW' }, '系統發生錯誤。');
      res.type('text/xml');
      res.send(response.toString());
    }
  };

  // Twilio Voice Webhook (Main entry point for both incoming calls and Web SDK)
  app.post('/api/twilio/voice', handleVoiceWebhook);

  // Twilio Dial Status Webhook
  app.post('/api/twilio/dial-status', (req, res) => {
    try {
      const dialStatus = req.body.DialCallStatus;
      const sipResponseCode = req.body.SipResponseCode;
      debugLog(`Dial Status: ${dialStatus}, SIP Code: ${sipResponseCode}`);
      
      const response = new twilio.twiml.VoiceResponse();
      
      if (dialStatus !== 'completed' && dialStatus !== 'answered') {
        response.say({ voice: 'alice', language: 'zh-TW' }, '客服專員目前忙線中，請稍後再撥。謝謝您的來電。');
        response.hangup();
      }
      
      res.type('text/xml');
      res.send(response.toString());
    } catch (err: any) {
      debugLog(`❌ Dial Status Error: ${err.message}`);
      res.status(500).end();
    }
  });

  // API for Web Call to trigger a SIP call to Zoiper
  app.post('/api/web/transfer', async (req, res) => {
    const { agentId, fromName, conferenceId = 'conf_' + Date.now() } = req.body;
    debugLog(`🌐 Web Transfer Triggered for Agent: ${agentId}, User: ${fromName}, Conference: ${conferenceId}`);

    try {
      const client = getTwilioClient();
      if (!client) throw new Error('Twilio client not initialized');

      const { sipUri, twilioNumber } = await getDynamicConfig();
      const fromNumber = twilioNumber || process.env.TWILIO_PHONE_NUMBER || '+1234567890';

      // Ensure we have a valid APP_URL
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const appUrl = process.env.APP_URL || `${protocol}://${host}`;

      const call = await client.calls.create({
        url: `${appUrl}/api/voice/join-conference?confId=${conferenceId}&role=agent`,
        to: sipUri,
        from: fromNumber, 
      });

      debugLog(`✅ Outbound SIP Call Created: ${call.sid} to ${sipUri} with CallerID: ${fromNumber}`);
      res.json({ success: true, callSid: call.sid, conferenceId });
    } catch (err: any) {
      const errorMsg = `❌ Web Transfer Failed: ${err.message}`;
      debugLog(errorMsg);
      res.status(500).json({ error: errorMsg });
    }
  });

  // TwiML to join a conference
  app.post('/api/voice/join-conference', (req, res) => {
    try {
      const confId = req.query.confId || req.body.confId;
      const role = req.query.role || req.body.role;
      
      debugLog(`📞 Join Conference Request: ID=${confId}, Role=${role}`);
      const response = new twilio.twiml.VoiceResponse();
      
      if (!confId) {
        debugLog(`❌ Join Conference Failed: Missing confId`);
        response.say({ voice: 'alice', language: 'zh-TW' }, '會議連線失敗，請重新撥打。');
        res.type('text/xml');
        return res.send(response.toString());
      }

      const dial = response.dial();
      dial.conference({
        startConferenceOnEnter: true,
        endConferenceOnExit: role === 'agent', // 客服掛斷則結束會議
        waitUrl: 'https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
        waitMethod: 'GET',
      }, String(confId));

      res.type('text/xml');
      res.send(response.toString());
    } catch (err: any) {
      debugLog(`❌ Join Conference Error: ${err.message}`);
      const response = new twilio.twiml.VoiceResponse();
      response.say({ voice: 'alice', language: 'zh-TW' }, '系統發生錯誤。');
      res.type('text/xml');
      res.send(response.toString());
    }
  });

  // Handle outgoing calls from Web SDK (Redirect to the main voice webhook for consistency)
  app.post('/api/voice/outgoing', handleVoiceWebhook);

  // Vite Integration
  if (isProd || hasDist) {
    if (isProd) console.log('Serving production build (NODE_ENV=production)...');
    else console.log('Serving production build (dist folder found)...');
    
    app.use(express.static(distPath));
    
    // Catch-all route for SPA
    app.get('*', (req, res, next) => {
      // API routes should have been handled already, but just in case:
      if (req.url.startsWith('/api')) return next();
      
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Index file not found in dist');
      }
    });
  } else {
    console.log('Starting Vite in development mode...');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true, 
        hmr: false,
        host: '0.0.0.0',
        port: 3000
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    app.get('*', async (req, res, next) => {
      if (req.url.startsWith('/api')) return next();
      
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  const httpServer = createServer(app);

  // ===== 方案 A：全域 Agent 快取（5 分鐘 TTL）=====
  const agentCache = new Map<string, { data: any; expireAt: number }>();
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分鐘

  const getCachedAgentData = async (agentId: string): Promise<any | null> => {
    const cached = agentCache.get(agentId);
    if (cached && Date.now() < cached.expireAt) {
      debugLog(`✅ [Cache HIT] agent=${agentId}`);
      return cached.data;
    }
    debugLog(`🔄 [Cache MISS] Fetching agent=${agentId} from Firestore...`);
    try {
      const agentDoc = await getDoc(doc(db, 'agents', agentId));
      if (agentDoc.exists()) {
        const data = agentDoc.data();
        agentCache.set(agentId, { data, expireAt: Date.now() + CACHE_TTL_MS });
        debugLog(`✅ [Cache SET] agent=${agentId}, expires in 5 min`);
        return data;
      }
    } catch (err) {
      console.error('Error fetching agent data:', err);
    }
    return null;
  };
  // ===== 方案 A 結束 =====

  // WebSocket for Twilio Stream
  const wss = new WebSocketServer({ server: httpServer, path: '/api/twilio/stream' });
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  wss.on('connection', async (ws, req) => {
    console.log('New Twilio Media Stream connection established.');
    
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const agentId = url.searchParams.get('agentId');
    const fromPhone = url.searchParams.get('from') || 'Unknown';
    
    let callSid: string | null = null;
    let streamSid: string | null = null;
    let geminiSession: any = null;
    let isTransferring = false;
    let startTime = Date.now();
    let transcript: { role: string; text: string; time: string }[] = [];

    const getCurrentTimeStr = () => {
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    };

    let baseInstruction = "你是一個專業的 AI 語音客服人員。你的語氣應該要禮貌、專業且簡潔。";
    if (agentId) {
      // 方案 A：使用快取讀取 agent 設定（避免每通電話重讀 Firestore）
      const agentData = await getCachedAgentData(agentId);
      if (agentData) {
        let knowledge = agentData.knowledgeBase || '';
        try {
          const parsed = JSON.parse(knowledge);
          if (Array.isArray(parsed)) {
            knowledge = parsed.map((src: any) => `【${src.title}】\n${src.content}`).join('\n\n');
          }
        } catch (e) {}
        baseInstruction = `${agentData.systemPrompt}\n\n知識庫內容：\n${knowledge}`;
      }
    }

    const transferInstruction = `
【絕對優先指令 - 真人轉接】：
1. 當客戶提到「真人」、「專人」、「轉接」、「找人」、「客服人員」或任何表達想與人類通話的意圖時，你必須「立刻」回覆轉接標籤。
2. 你的回覆格式必須嚴格遵守：先說一段簡短的禮貌回覆，然後緊接著加上 [TRANSFER_TO_HUMAN] 標籤。
3. 範例回覆：「好的，沒問題，我現在立刻為您轉接專人，請稍候。[TRANSFER_TO_HUMAN]」
4. 請注意：[TRANSFER_TO_HUMAN] 標籤僅供系統辨識，請勿將標籤文字唸出來。
5. 嚴禁在客戶要求轉接時嘗試繼續回答問題或詢問原因，必須直接執行轉接。
`;

    const systemInstruction = `${transferInstruction}\n\n${baseInstruction}`;

    const connectGemini = async () => {
      const executeTransfer = async (targetCallSid: string) => {
        if (isTransferring) return;
        isTransferring = true;
        
        debugLog(`🚀 Starting Direct SIP Transfer for Call: ${targetCallSid}`);
        
        if (targetCallSid) {
          const client = getTwilioClient();
          if (!client) {
            debugLog(`❌ Transfer Failed: Twilio client not initialized`);
            isTransferring = false;
            return;
          }

          try {
            const { sipUri, twilioNumber } = await getDynamicConfig();
            const fromNumber = twilioNumber || process.env.TWILIO_PHONE_NUMBER;
            
            const response = new twilio.twiml.VoiceResponse();
            if (!sipUri) {
              debugLog(`⚠️ Transfer requested but SIP_URI is empty`);
              response.say({ voice: 'alice', language: 'zh-TW' }, '抱歉，系統尚未設定轉接目標，無法轉接。');
              await client.calls(targetCallSid).update({ twiml: response.toString() });
              isTransferring = false;
              return;
            }

            const finalSipUri = sipUri.startsWith('sip:') ? sipUri : `sip:${sipUri}`;
            
            response.say({ voice: 'alice', language: 'zh-TW' }, '好的，正在為您轉接專人，請稍候。');
            const dial = response.dial({ timeout: 30, callerId: fromNumber || undefined });
            dial.sip(finalSipUri);
            
            await client.calls(targetCallSid).update({ twiml: response.toString() });
            debugLog(`✅ Call ${targetCallSid} successfully handed off to SIP: ${finalSipUri} with CallerID: ${fromNumber || 'Original'}`);

            if (geminiSession) {
              geminiSession.close();
              geminiSession = null;
            }
            isTransferring = false;
          } catch (err: any) {
            debugLog(`❌ Transfer Failed: ${err.message}`);
            isTransferring = false;
          }
        } else {
          debugLog(`❌ Transfer Failed: targetCallSid is missing (Call might not be from Twilio or start event not received)`);
          isTransferring = false;
        }
      };

      try {
        const session = await genAI.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
            },
            systemInstruction: systemInstruction,
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
          callbacks: {
            onopen: () => {
              console.log('Gemini Session Opened');
              // 方案 B：移除 800ms 延遲，在 onopen 中立即發送問候指令
              debugLog('🚀 [B] Gemini connected, sending greeting immediately (no 800ms delay)');
              setImmediate(() => {
                if (geminiSession) {
                  geminiSession.sendClientContent({
                    turns: [{ role: 'user', parts: [{ text: "請開始對話，向客戶打招呼並詢問需求。" }] }],
                    turnComplete: true
                  });
                }
              });
            },
            onmessage: async (message) => {
              if (isTransferring) return;
              const audioData = message.serverContent?.modelTurn?.parts.find(p => p.inlineData)?.inlineData?.data;
              if (audioData && streamSid) {
                try {
                  const pcmBuffer = Buffer.from(audioData, 'base64');
                  const pcm16 = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
                  
                  // Naive resampling from 24000Hz to 8000Hz (drop 2 out of 3 samples)
                  const resampled = new Int16Array(Math.floor(pcm16.length / 3));
                  for (let i = 0; i < resampled.length; i++) {
                    resampled[i] = pcm16[i * 3];
                  }
                  
                  const wav = new WaveFile();
                  wav.fromScratch(1, 8000, '16', resampled);
                  wav.toMuLaw();
                  const mulawData = Buffer.from((wav.data as any).samples as Uint8Array);
                  ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload: mulawData.toString('base64') } }));
                } catch (err) {
                  console.error('Error converting pcm to mu-law:', err);
                }
              }
              const aiText = message.serverContent?.outputTranscription?.text;
              if (aiText) {
                debugLog(`🤖 AI Transcription: ${aiText}`);
                const last = transcript[transcript.length - 1];
                let fullAiText = aiText;
                if (last && last.role === 'ai') {
                  last.text += aiText;
                  fullAiText = last.text;
                } else {
                  transcript.push({ role: 'ai', text: aiText, time: getCurrentTimeStr() });
                }
                if (fullAiText.includes('[TRANSFER_TO_HUMAN]')) {
                  debugLog(`🚩 Transfer tag detected in AI response`);
                  await executeTransfer(callSid || '');
                }
              }
              const userText = message.serverContent?.inputTranscription?.text;
              if (userText) {
                const last = transcript[transcript.length - 1];
                if (last && last.role === 'user') {
                  last.text += userText;
                } else {
                  transcript.push({ role: 'user', text: userText, time: getCurrentTimeStr() });
                }
                // 移除關鍵字自動轉接，完全交由 AI 判斷意圖並發送 [TRANSFER_TO_HUMAN] 標籤
                // 這樣可以避免使用者提到「轉接」但其實是不想轉接時誤觸發
              }
            },
            onerror: (err) => {
              if (isAbortedError(err)) return;
              console.error('Gemini Live API Error:', err);
            },
            onclose: () => console.log('Gemini Live API Connection Closed')
          }
        });
        geminiSession = session;
        // 方案 B：問候指令已移至 onopen 回調，不再需要 setTimeout 800ms
      } catch (err) {
        console.error('Failed to connect to Gemini:', err);
      }
    };

    const saveCallLog = async () => {
      if (transcript.length === 0) return;
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const transcriptText = transcript.map(m => `[${m.time}] ${m.role === 'ai' ? 'AI' : 'User'}: ${m.text}`).join('\n');
      let summary = '無通話內容';
      try {
        const result = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `請根據以下客服通話紀錄，產生一段簡短的繁體中文摘要：\n\n${transcriptText}`,
        });
        summary = result.text || '無法生成摘要';
      } catch (e) {}

      try {
        await addDoc(collection(db, 'call_logs'), {
          time: new Date().toLocaleString(),
          phone: fromPhone,
          channel: 'Phone',
          duration: `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, '0')}`,
          status: isTransferring ? '已轉接' : '已完成',
          intent: summary.slice(0, 20),
          agentId: agentId || 'default',
          transcript: transcriptText,
          summary: summary,
          createdAt: Date.now()
        });
      } catch (err) {
        console.error('Failed to save call log:', err);
      }
    };

    connectGemini();

    ws.on('message', (message: string) => {
      const data = JSON.parse(message);
      switch (data.event) {
        case 'start':
          callSid = data.start.callSid;
          streamSid = data.start.streamSid;
          break;
        case 'media':
          if (geminiSession && !isTransferring) {
            try {
              const wav = new WaveFile();
              wav.fromScratch(1, 8000, '8m', Buffer.from(data.media.payload, 'base64'));
              wav.fromMuLaw();
              const buffer = Buffer.from((wav.data as any).samples as Uint8Array);
              geminiSession.sendRealtimeInput({ media: { data: buffer.toString('base64'), mimeType: 'audio/pcm;rate=8000' } });
            } catch (err) {
              console.error('Error converting mu-law to pcm:', err);
            }
          }
          break;
        case 'stop':
          if (geminiSession) {
            geminiSession.close();
            geminiSession = null;
          }
          saveCallLog();
          break;
      }
    });

    ws.on('close', () => {
      if (geminiSession) {
        geminiSession.close();
        geminiSession = null;
      }
      saveCallLog();
    });
    ws.on('error', console.error);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is fully operational on port ${PORT}`);
  });
}

startServer().catch(console.error);

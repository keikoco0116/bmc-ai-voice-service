import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Play, Square } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AudioRecorder, AudioPlayer } from '../../lib/audio';
import { isAbortedError } from '../../lib/utils';

export default function WebRTCTest() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const [status, setStatus] = useState('Disconnected');
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const connect = async () => {
    try {
      setStatus('Connecting...');
      
      playerRef.current = new AudioPlayer();
      recorderRef.current = new AudioRecorder((base64Data) => {
        if (!isMutedRef.current && sessionRef.current) {
          sessionRef.current.then((session: any) => {
            session.sendRealtimeInput({
              media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          });
        }
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Missing Gemini API Key');
      }

      aiRef.current = new GoogleGenAI({ apiKey });
      
      const sessionPromise = aiRef.current.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are a helpful AI assistant.",
        },
        callbacks: {
          onopen: () => {
            setStatus('Connected');
            setIsConnected(true);
            if (recorderRef.current) {
              recorderRef.current.start().catch(err => {
                console.error('Failed to start recorder:', err);
              });
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const modelTurn = message.serverContent?.modelTurn;
            if (modelTurn && playerRef.current) {
              const audioPart = modelTurn.parts.find(p => p.inlineData?.data);
              if (audioPart && audioPart.inlineData?.data) {
                playerRef.current.playBase64(audioPart.inlineData.data);
              }
            }
            
            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.stop();
            }

            if (modelTurn) {
              const textPart = modelTurn.parts.find(p => p.text);
              if (textPart && textPart.text) {
                setTranscript(prev => [...prev, `AI: ${textPart.text}`]);
              }
            }
          },
          onerror: (error) => {
            if (isAbortedError(error)) {
              console.log('Live API connection aborted by user');
              return;
            }
            console.error('Live API Error:', error);
            setStatus('Error');
            disconnect();
          },
          onclose: () => {
            setStatus('Disconnected');
            disconnect();
          }
        }
      });
      
      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error('Failed to connect:', err);
      setStatus('Connection Failed');
    }
  };

  const disconnect = () => {
    if (recorderRef.current) recorderRef.current.stop();
    if (playerRef.current) playerRef.current.stop();
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close());
    }
    setIsConnected(false);
    setStatus('Disconnected');
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">WebRTC & Gemini Live API Test</h1>
      
      <div className="flex items-center gap-4 p-4 bg-slate-100 rounded-lg">
        <div className="flex-1">
          <p className="font-medium text-slate-700">Status: <span className={isConnected ? 'text-green-600' : 'text-slate-500'}>{status}</span></p>
        </div>
        
        {!isConnected ? (
          <button 
            onClick={connect}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Play className="w-4 h-4" /> Connect
          </button>
        ) : (
          <button 
            onClick={disconnect}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Square className="w-4 h-4" /> Disconnect
          </button>
        )}
      </div>

      {isConnected && (
        <div className="flex gap-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isMuted ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-700'}`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 h-64 overflow-y-auto">
        <h3 className="font-medium text-slate-700 mb-2">Transcript</h3>
        <div className="space-y-2">
          {transcript.map((text, i) => (
            <div key={i} className="text-sm text-slate-600">{text}</div>
          ))}
          {transcript.length === 0 && <p className="text-sm text-slate-400 italic">No transcript yet...</p>}
        </div>
      </div>
    </div>
  );
}

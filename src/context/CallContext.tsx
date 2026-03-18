import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../AuthContext';

export interface CallRecord {
  id: string;
  time: string;
  phone: string;
  channel: string;
  duration: string;
  status: string;
  intent: string;
  summary?: string;
  transcript?: string;
  estimatedCost?: number;
  currency?: string;
  exchangeRate?: number;
  costBreakdown?: {
    didwwMonthlyUsd: number;
    didwwCallUsd: number;
    twilioUsd: number;
    aiModelUsd: number;
    totalUsd: number;
    totalTwd: number;
    rates?: {
      didwwMonthly: number;
      didwwCall: number;
      twilio: number;
      aiModel: number;
      exchangeRate: number;
    };
  };
}

interface CallContextType {
  calls: CallRecord[];
  addCall: (call: CallRecord) => void;
  clearCalls: () => void;
  fetchCalls: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const { isAdmin } = useAuth();

  useEffect(() => {
    let unsubscribe: () => void;

    if (isAdmin) {
      const q = query(collection(db, 'call_logs'), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(q, (snap) => {
        const data = snap.docs.map(doc => {
          const docData = doc.data();
          return {
            id: docData.id || doc.id,
            time: docData.time,
            phone: docData.phone,
            channel: docData.channel,
            duration: docData.duration,
            status: docData.status,
            intent: docData.intent,
            summary: docData.summary,
            transcript: docData.transcript,
            estimatedCost: docData.estimatedCost,
            currency: docData.currency,
            exchangeRate: docData.exchangeRate,
            costBreakdown: docData.costBreakdown
          } as CallRecord;
        });
        setCalls(data);
      }, (error) => {
        // Ignore benign Firestore idle stream timeout errors
        const errMsg = error?.message || '';
        if (errMsg.includes('Disconnecting idle stream') || errMsg.includes('CANCELLED')) {
          return;
        }
        console.error('Failed to fetch calls in context:', error);
      });
    } else {
      setCalls([]);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isAdmin]);

  const fetchCalls = async () => {
    // Kept for compatibility, but data is now synced automatically
  };

  const addCall = (call: CallRecord) => {
    setCalls(prev => [call, ...prev]);
  };

  const clearCalls = () => {
    setCalls([]);
  };

  return (
    <CallContext.Provider value={{ calls, addCall, clearCalls, fetchCalls }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCalls() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCalls must be used within a CallProvider');
  }
  return context;
}

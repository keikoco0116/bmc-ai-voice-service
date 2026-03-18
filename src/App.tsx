import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { CallProvider } from './context/CallContext';
import Landing from './pages/Landing';
import AdminLayout from './layouts/AdminLayout';
import ClientLayout from './layouts/ClientLayout';
import Dashboard from './pages/admin/Dashboard';
import SetupWizard from './pages/admin/SetupWizard';
import CallHistory from './pages/admin/CallHistory';
import AIConfig from './pages/admin/AIConfig';
import KnowledgeBase from './pages/admin/KnowledgeBase';
import Analytics from './pages/admin/Analytics';
import LiveAgent from './pages/admin/LiveAgent';
import SystemSettings from './pages/admin/SystemSettings';
import AdminLogin from './pages/admin/Login';
import ClientHome from './pages/client/ClientHome';
import InCall from './pages/client/InCall';
import PostCall from './pages/client/PostCall';
import WebRTCTest from './pages/client/WebRTCTest';

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing Page */}
            <Route path="/" element={<Landing />} />

            {/* Admin Login */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="setup" element={<SetupWizard />} />
              <Route path="calls" element={<CallHistory />} />
              <Route path="ai-config" element={<AIConfig />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="live" element={<LiveAgent />} />
              <Route path="settings" element={<SystemSettings />} />
            </Route>

            {/* Client Routes */}
            <Route path="/client" element={<ClientLayout />}>
              <Route index element={<ClientHome />} />
              <Route path="call" element={<InCall />} />
              <Route path="summary" element={<PostCall />} />
              <Route path="webrtc" element={<WebRTCTest />} />
            </Route>

            {/* Default Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CallProvider>
    </AuthProvider>
  );
}

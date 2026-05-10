import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ChatPage     from './pages/ChatPage'
import ProfilePage  from './pages/ProfilePage'
import IntegrationsPage from './pages/IntegrationsPage'
import LlmSettingsPage from './pages/LlmSettingsPage'
import BoardingPage from './pages/BoardingPage'
import CliPage        from './pages/CliPage'
import WorkflowPage   from './pages/WorkflowPage'
import PrivacyPage    from './pages/PrivacyPage'

function Protected({ children }) {
  const token = useAuthStore(s => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/privacy"  element={<PrivacyPage />} />
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/onboarding" element={<Protected><BoardingPage /></Protected>} />
      <Route path="/chat"     element={<Protected><ChatPage /></Protected>} />
      <Route path="/profile"  element={<Protected><ProfilePage /></Protected>} />
      <Route path="/integrations" element={<Protected><IntegrationsPage /></Protected>} />
      <Route path="/llm"      element={<Protected><LlmSettingsPage /></Protected>} />
      <Route path="/cli"      element={<Protected><CliPage /></Protected>} />
      <Route path="/workflow" element={<Protected><WorkflowPage /></Protected>} />
      <Route path="*"         element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}

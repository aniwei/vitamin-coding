import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { RepositoryDetailPage } from './components/CodeWiki/RepositoryDetailPage'
import { ChatPage } from './pages/ChatPage'
import { CodeWikiPage } from './pages/CodeWikiPage'
import { TraceAnalysisPage } from './pages/TraceAnalysisPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/codewiki" element={<CodeWikiPage />} />
        <Route path="/codewiki/:repoName" element={<RepositoryDetailPage />} />
        <Route path="/traces" element={<TraceAnalysisPage />} />
        <Route path="/" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Router>
  )
}

export default App

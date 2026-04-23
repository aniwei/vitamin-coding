import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { RepositoryDetailPage } from './components/CodeWiki/RepositoryDetailPage'
import { Chat } from './pages/Chat'
import { CodeWiki } from './pages/CodeWiki'
import { TraceAnalysis } from './pages/TraceAnalysis'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/chat" element={<Chat />} />
        <Route path="/codewiki" element={<CodeWiki />} />
        <Route path="/codewiki/:repoName" element={<RepositoryDetailPage />} />
        <Route path="/traces" element={<TraceAnalysis />} />
        <Route path="/" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Router>
  )
}

export default App

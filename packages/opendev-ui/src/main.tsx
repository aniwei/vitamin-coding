import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ws } from './api/websocket'

// WebSocket 在应用启动时连接
ws.connect()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

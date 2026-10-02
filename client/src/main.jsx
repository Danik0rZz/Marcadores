import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (no request to Google Fonts)
import '@fontsource-variable/outfit'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

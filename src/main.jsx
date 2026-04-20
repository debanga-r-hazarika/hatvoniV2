import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import hatvoniTheme from './theme/hatvoniTheme'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={hatvoniTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)

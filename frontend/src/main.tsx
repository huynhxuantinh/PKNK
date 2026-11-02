import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { AuthProvider } from './auth/AuthContext'
import 'leaflet/dist/leaflet.css'
import './components/admin/ui/LegacyBranchModal.css'
import './styles/tokens.css'
import './styles/reset.css'
import './styles/management-shared.css'
import './styles/public-navigation.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

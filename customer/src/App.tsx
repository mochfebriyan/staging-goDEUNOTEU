import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import BayarBatch from './pages/BayarBatch'
import Kalkulator from './pages/Kalkulator'
import Landing from './pages/Landing'
import LineCallback from './pages/LineCallback'
import TagihanPajak from './pages/TagihanPajak'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/id" replace />} />
          <Route path="/id" element={<Landing />} />
          <Route path="/id/order" element={<BayarBatch />} />
          <Route path="/id/calculator" element={<Kalkulator />} />
          <Route path="/id/ems-tax" element={<TagihanPajak />} />
          <Route path="/id/line-callback" element={<LineCallback />} />
          <Route path="*" element={<Navigate to="/id" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

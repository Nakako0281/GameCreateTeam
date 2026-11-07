import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { GamePlayPage } from './pages/GamePlayPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games/:gameId" element={<GamePlayPage />} />
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { GamePlayPage } from './pages/GamePlayPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games/:gameId" element={<GamePlayPage />} />
      </Routes>
    </BrowserRouter>
  )
}

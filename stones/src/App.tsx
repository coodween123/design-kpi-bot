import Navbar from './components/Navbar'
import Hero from './components/Hero'

export default function App() {
  return (
    <div className="min-h-screen bg-black tracking-[-0.02em]" style={{ fontFamily: 'Inter' }}>
      <Navbar />
      <Hero />
    </div>
  )
}

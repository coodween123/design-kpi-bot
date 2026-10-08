import { Menu } from 'lucide-react'

const NAV_ITEMS = ['Field Guides', 'Geology', 'Plans', 'Live Tour']

export default function Navbar() {
  return (
    <nav
      className="hero-anim hero-fade-down fixed top-0 left-0 right-0 z-[100] flex items-center justify-between p-4 sm:p-5"
      style={{ animationDelay: '0.1s' }}
    >
      <a href="#" className="flex items-center gap-2.5">
        <svg width="26" height="26" viewBox="0 0 256 256" fill="#ffffff" aria-hidden="true">
          <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" />
        </svg>
        <span className="text-white text-2xl font-playfair italic">Stones</span>
      </a>

      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full px-2 py-2 items-center gap-1">
        <a href="#" className="bg-white text-gray-900 px-4 py-1.5 rounded-full text-sm font-medium">
          Course
        </a>
        {NAV_ITEMS.map((item) => (
          <a
            key={item}
            href="#"
            className="text-white/80 hover:bg-white/20 hover:text-white transition-colors px-4 py-1.5 rounded-full text-sm font-medium"
          >
            {item}
          </a>
        ))}
      </div>

      <button className="hidden md:block bg-white text-gray-900 text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-100 transition-colors">
        Sign Up
      </button>
      <button className="md:hidden text-white p-2" aria-label="Open menu">
        <Menu size={24} />
      </button>
    </nav>
  )
}

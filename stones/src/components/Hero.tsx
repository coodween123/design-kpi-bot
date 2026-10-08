import { useEffect, useRef, useState } from 'react'
import baseImage from '../assets/base.png'
import RevealLayer from './RevealLayer'

export const SPOTLIGHT_R = 260

const MOBILE_QUERY = '(max-width: 639px)'

export default function Hero() {
  const mouse = useRef({ x: -999, y: -999 })
  const smooth = useRef({ x: -999, y: -999 })
  const rafRef = useRef(0)
  const [cursorPos, setCursorPos] = useState({ x: -999, y: -999 })
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  // Сдвигает скалу вниз и уменьшает; одинаково для картинки и видео, чтобы слои совпадали
  const mediaTransform = 'translate(0px, 132px) scale(0.79)'

  // Следим за брейкпоинтом мобильной версии
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Прожектор: следует за курсором с плавным запаздыванием; без мыши — медленно кружит вокруг скалы
  useEffect(() => {
    if (isMobile) return
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches

    const onMove = (e: MouseEvent) => {
      if (!hasFinePointer) return
      mouse.current.x = e.clientX
      mouse.current.y = e.clientY
    }

    const tick = (time: number) => {
      if (!hasFinePointer) {
        const cx = window.innerWidth / 2
        const cy = window.innerHeight * 0.55
        const r = Math.min(window.innerWidth, window.innerHeight) * 0.22
        const t = time * 0.0004
        mouse.current.x = cx + Math.cos(t) * r
        mouse.current.y = cy + Math.sin(t) * r * 0.7
      }
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1
      setCursorPos({ x: smooth.current.x, y: smooth.current.y })
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [isMobile])

  return (
    // sticky + z-0: следующие секции будут наезжать поверх героя
    <section className="sticky top-0 z-0 w-full overflow-hidden h-screen bg-black" style={{ height: '100dvh' }}>
      {isMobile ? (
        <video
          src="/reveal.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-contain z-10"
          style={{ transform: 'scale(1.3)' }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0 bg-center bg-cover bg-no-repeat z-10"
            style={{ backgroundImage: `url(${baseImage})`, transform: mediaTransform }}
          />
          <RevealLayer cursorX={cursorPos.x} cursorY={cursorPos.y} mediaTransform={mediaTransform} />
        </>
      )}

      <div className="absolute top-[14%] left-0 right-0 z-50 flex flex-col items-center text-center px-5 pointer-events-none">
        <h1 className="text-white leading-[0.95]">
          <span
            className="hero-anim hero-reveal block font-playfair italic font-normal text-5xl sm:text-7xl md:text-8xl"
            style={{ letterSpacing: '-0.05em', animationDelay: '0.25s' }}
          >
            Stone remembers
          </span>
          <span
            className="hero-anim hero-reveal block font-normal text-5xl sm:text-7xl md:text-8xl -mt-1"
            style={{ letterSpacing: '-0.08em', animationDelay: '0.42s' }}
          >
            what time forgets
          </span>
        </h1>
      </div>

      <div
        className="hero-anim hero-fade hidden sm:block absolute bottom-14 left-10 md:left-14 max-w-[260px] z-50"
        style={{ animationDelay: '0.7s' }}
      >
        <p className="text-sm text-white/80 leading-relaxed">
          Beneath every ridge lies a record of fire and flood — strata pressed into pages that only patient eyes learn
          to read.
        </p>
      </div>

      <div
        className="hero-anim hero-fade absolute bottom-10 sm:bottom-24 left-5 right-5 sm:left-auto sm:right-10 md:right-14 max-w-full sm:max-w-[260px] z-50 flex flex-col items-start gap-4 sm:gap-5"
        style={{ animationDelay: '0.85s' }}
      >
        <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
          Follow mineral veins, fault lines, and fossil beds in layered detail to watch living landscapes rise from
          ancient stone.
        </p>
        <button className="bg-[#e8702a] hover:bg-[#d2611f] text-white text-sm font-medium px-7 py-3 rounded-full transition-all hover:scale-[1.03] active:scale-95 hover:shadow-lg hover:shadow-[#e8702a]/30">
          Start Digging
        </button>
      </div>
    </section>
  )
}

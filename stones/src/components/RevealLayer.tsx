import { useEffect, useRef } from 'react'
import { SPOTLIGHT_R } from './Hero'

interface RevealLayerProps {
  cursorX: number
  cursorY: number
  mediaTransform: string
}

export default function RevealLayer({ cursorX, cursorY, mediaTransform }: RevealLayerProps) {
  const maskRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Канвас маски всегда размером с окно
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Рисуем мягкий круг в позиции курсора и применяем его как маску к обёртке видео
  useEffect(() => {
    const canvas = canvasRef.current
    const maskEl = maskRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !maskEl || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const gradient = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, SPOTLIGHT_R)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)')
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)')
    gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(cursorX, cursorY, SPOTLIGHT_R, 0, Math.PI * 2)
    ctx.fill()

    const mask = `url(${canvas.toDataURL()})`
    maskEl.style.maskImage = mask
    maskEl.style.webkitMaskImage = mask
    maskEl.style.maskSize = '100% 100%'
    maskEl.style.webkitMaskSize = '100% 100%'
  }, [cursorX, cursorY])

  return (
    // Маска на обёртке (а не на видео): прожектор остаётся в координатах экрана, а видео двигается вместе с базовой картинкой
    <div ref={maskRef} className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
      <video
        src="/reveal.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center', transform: mediaTransform }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ display: 'none' }} />
    </div>
  )
}

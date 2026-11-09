import { useEffect, useRef, useState } from 'react'
import { Modal, Slider } from 'antd'
import styles from './AvatarCropper.module.less'

const VIEW = 260
const OUTPUT = 256

const AvatarCropper = ({ open, src, loading, onCancel, onConfirm }) => {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!open) return
    setNatural({ w: 0, h: 0 })
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [open, src])

  const baseScale = natural.w && natural.h ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1
  const effScale = baseScale * zoom
  const drawW = natural.w * effScale
  const drawH = natural.h * effScale

  const clampOffset = (next: { x: number; y: number }, z = zoom) => {
    const scale = baseScale * z
    const w = natural.w * scale
    const h = natural.h * scale
    const maxX = Math.max(0, (w - VIEW) / 2)
    const maxY = Math.max(0, (h - VIEW) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }

  const handleImgLoad = (e) => {
    const img = e.currentTarget as HTMLImageElement
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const handlePointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(clampOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleZoom = (value: number) => {
    setZoom(value)
    setOffset((prev) => clampOffset(prev, value))
  }

  const handleConfirm = () => {
    const img = imgRef.current
    if (!img || !natural.w || !natural.h) return

    const left = (VIEW - drawW) / 2 + offset.x
    const top = (VIEW - drawH) / 2 + offset.y
    const sourceW = Math.min(natural.w, VIEW / effScale)
    const sourceH = Math.min(natural.h, VIEW / effScale)
    const sourceX = Math.max(0, Math.min(natural.w - sourceW, -left / effScale))
    const sourceY = Math.max(0, Math.min(natural.h - sourceH, -top / effScale))

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, OUTPUT, OUTPUT)
    onConfirm(canvas.toDataURL('image/jpeg', 0.85))
  }

  return (
    <Modal
      open={open}
      title="裁剪头像"
      okText="确定"
      cancelText="取消"
      centered
      destroyOnClose
      confirmLoading={loading}
      onOk={handleConfirm}
      onCancel={onCancel}
    >
      <div className={styles.stage}>
        <div
          className={styles.viewport}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt="待裁剪头像"
              draggable={false}
              onLoad={handleImgLoad}
              className={styles.image}
              style={{
                width: drawW || 'auto',
                height: drawH || 'auto',
                left: (VIEW - drawW) / 2 + offset.x,
                top: (VIEW - drawH) / 2 + offset.y,
              }}
            />
          )}
          <div className={styles.ring} />
        </div>
      </div>

      <div className={styles.zoomRow}>
        <span className={styles.zoomLabel}>缩放</span>
        <Slider
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={handleZoom}
          tooltip={{ formatter: (v) => `${Math.round((v || 1) * 100)}%` }}
        />
      </div>
    </Modal>
  )
}

export default AvatarCropper

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i

export const createThumbnail = async (file, maxSize = 320, quality = 0.72) => {
  const isImage = String(file?.type || '').startsWith('image/') || IMAGE_EXT_RE.test(file?.name || '')
  if (!isImage) return ''

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width || 1, bitmap.height || 1))
  const width = Math.max(1, Math.round((bitmap.width || 1) * scale))
  const height = Math.max(1, Math.round((bitmap.height || 1) * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return ''
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  return canvas.toDataURL('image/jpeg', quality)
}

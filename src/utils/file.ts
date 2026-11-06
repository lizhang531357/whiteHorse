export const MAX_FILE_SIZE = 8 * 1024 * 1024
export const MAX_FILES = 5

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp)$/i

export const isImageFile = (file) => {
  return String(file?.type || '').startsWith('image/') || IMAGE_EXT_RE.test(file?.name || '')
}

export const formatSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const filesToPayload = (files = []) => {
  return Promise.all(
    files.map(async (item) => ({
      name: item.name,
      type: item.type,
      data: await fileToBase64(item.file),
    })),
  )
}

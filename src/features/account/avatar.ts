const MAX_AVATAR_EDGE = 256
const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function resizeAvatar(file: File): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Escolha uma imagem de até 5 MB.')

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
    if (!blob) throw new Error('Não foi possível processar a imagem.')
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  } finally {
    bitmap.close()
  }
}

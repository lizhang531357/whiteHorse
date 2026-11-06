export function deriveTitle(text = '', files = []) {
  const clean = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (clean) return clean.slice(0, 24)
  if (files?.length) return files[0].name || '附件对话'
  return '新对话'
}

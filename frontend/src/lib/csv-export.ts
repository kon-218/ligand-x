export function downloadCSV(
  columns: Array<{ key: string; label: string }>,
  data: Array<Record<string, any>>,
  filename: string
): void {
  const header = columns.map(c => `"${c.label}"`).join(',')
  const rows = data.map(row =>
    columns.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

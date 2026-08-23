const csvEscape = (value) => {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const rowsToCSV = (rows) => {
  if (!rows || rows.length === 0) return ''
  const columns = [...rows.reduce((set, row) => {
    Object.keys(row).forEach(k => set.add(k))
    return set
  }, new Set())]
  const header = columns.map(csvEscape).join(',')
  const body = rows.map(row => columns.map(c => csvEscape(row[c])).join(',')).join('\n')
  return `${header}\n${body}`
}

const downloadBlob = (filename, content, mimeType) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const downloadCSV = (filename, rows) => {
  downloadBlob(filename, rowsToCSV(rows), 'text/csv;charset=utf-8;')
}

export const downloadJSON = (filename, data) => {
  downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8;')
}

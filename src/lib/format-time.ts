// Formats a timestamp for conversation list rows.
// - Same day  → "14:03"
// - Yesterday → "Yesterday"
// - Same year → "12 Jan"
// - Older     → "12/01/25"
export function formatConvTime(isoString: string): string {
  const date = new Date(isoString)
  const now  = new Date()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000)

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  if (date >= startOfYesterday) {
    return 'Yesterday'
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })
}

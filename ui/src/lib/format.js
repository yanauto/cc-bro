import { t, lang } from './i18n.svelte.js'

export function duration(ms) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

export function ago(iso, now = Date.now()) {
  if (!iso) return '—'
  const diff = Math.max(0, now - new Date(iso).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 45) return t('justNow')
  const units = [[86400, 'd', '天'], [3600, 'h', '小时'], [60, 'm', '分钟']]
  for (const [size, en, zh] of units) {
    if (s >= size) {
      const n = Math.floor(s / size)
      return lang.current === 'zh' ? `${n} ${zh}${t('ago')}` : `${n}${en} ${t('ago')}`
    }
  }
  return t('justNow')
}

export function clock(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(lang.current === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
}

export function shortPath(p) {
  if (!p) return ''
  return p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~')
}

export function liveElapsed(ticket, now) {
  if (ticket.status === 'working' && ticket.startedAt) {
    return Math.max(ticket.elapsedMs || 0, now - new Date(ticket.startedAt).getTime())
  }
  return ticket.elapsedMs
}

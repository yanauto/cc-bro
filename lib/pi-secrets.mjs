export function secretsFrom(records,env) {
  const values = new Set(Object.entries(env).filter(([name,value]) => /(?:API_KEY|TOKEN|ACCESS_KEY|SECRET)$/.test(name) && value).map(([,v]) => v))
  function visit(obj,inHeaders = false) {
    for (const [key,v] of Object.entries(obj ?? {})) {
      if (v && typeof v === 'object') visit(v,key === 'headers')
      if (typeof v !== 'string' || !v || (!inHeaders && !/^(key|apiKey|access|refresh|access_token|refresh_token|authorization|x-api-key)$/i.test(key))) continue
      if (!v.startsWith('$')) values.add(v)
      for (const m of v.matchAll(/\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g)) {
        const value = env[m[1] ?? m[2]]
        if (value) values.add(value)
      }
    }
  }
  for (const record of records) visit(record)
  return [...values].filter(v => v.length >= 4).sort((a,b) => b.length-a.length)
}

export function mask(text,secrets) {
  for (const secret of secrets) text = text.replaceAll(secret,'[redacted]')
  return text
}

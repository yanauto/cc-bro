export class Slots {
  constructor(limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('CC_BRO_CONCURRENCY must be a positive integer')
    this.limit = limit
    this.active = new Set()
    this.queue = new Map()
    this.paused = false
  }

  reserve(crew, c) {
    if (!this.paused && this.active.size < this.limit && !this.queue.size) {
      this.active.add(c.id)
      return true
    }
    this.queue.set(c.id, { crew, name: c.name, turn: c.turn })
    return false
  }

  release(id) {
    this.active.delete(id)
    this.queue.delete(id)
    this.drain()
  }

  drain() {
    for (const [id, { crew, name, turn }] of this.queue) {
      if (this.paused || this.active.size >= this.limit) break
      this.queue.delete(id)
      if (crew.closing) continue
      this.active.add(id)
      crew.serial(name, async () => {
        const c = crew.store.byName(name)
        if (!crew.closing && c.turn === turn && c.status === 'queued') await crew.dispatch(c)
        else this.release(id)
      }).catch(() => {})
    }
  }
}

import type { LifeMapConcern, LifeMapData } from '../../types'
import { forLabel } from '../../utils/names'

export interface Item extends LifeMapConcern {
  kind: 'hope' | 'worry'
}

export interface Circle {
  key: string
  title: string
  sub?: string
  initial: string
  child: boolean
  self: boolean
  items: Item[]
  said?: string
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const CHILD = /^(daughter|son|child|kid|baby|toddler)/i
const SELF = /^(self|me|myself|customer|client|him|her|they|them|himself|herself)?$/i

/** Who is in the customer's world and what each person hopes for and worries about. The customer themselves come first; anything not about a named person is theirs. */
const said = (t: string) => (t === 'Added by the advisor' ? 'Added by you' : t)

export function groupWorld(lifeMap: LifeMapData | null | undefined, customerName?: string | null): { circles: Circle[]; self: Circle; people: Circle[]; counts: { people: number; hopes: number; worries: number } } {
    const map = lifeMap ?? { people: [], dreams: [], worries: [] }
    const name = customerName?.trim() || 'Your customer'
    const me: Circle = { key: 'self', title: name, sub: 'The customer', initial: name.charAt(0).toUpperCase(), child: false, self: true, items: [] }
    const byRelation = new Map<string, Circle>()
    // The model sometimes lists the customer among the people ("Rahul, husband"): they already have their own card.
    const lc = name.toLowerCase()
    const isMe = (n?: string | null, rel?: string) =>
      /^(self|myself|customer|client)$/i.test((rel ?? '').trim()) || (!!n && (n.trim().toLowerCase() === lc || lc.split(/\s+/)[0] === n.trim().toLowerCase()))
    const people: Circle[] = map.people.filter((p) => !isMe(p.name, p.relation)).map((p) => {
      const c: Circle = {
        key: `p:${p.relation.toLowerCase()}:${(p.name ?? '').toLowerCase()}`,
        title: p.name ? forLabel(p.name) : cap(forLabel(p.relation)),
        sub: p.name ? cap(forLabel(p.relation)) : undefined,
        initial: (p.name ?? p.relation).trim().charAt(0).toUpperCase(),
        child: CHILD.test(p.relation), self: false, items: [], said: said(p.said),
      }
      if (!byRelation.has(p.relation.toLowerCase())) byRelation.set(p.relation.toLowerCase(), c)
      return c
    })
    const put = (c: LifeMapConcern, kind: Item['kind']) => {
      const rel = (c.forRelation ?? '').trim().toLowerCase()
      const target = SELF.test(rel) || rel === name.toLowerCase() ? me : byRelation.get(rel) ?? me
      target.items.push({ ...c, said: said(c.said), kind })
    }
    map.dreams.forEach((c) => put(c, 'hope'))
    map.worries.forEach((c) => put(c, 'worry'))
    const circles = [me, ...people].filter((c) => c.self ? c.items.length > 0 || people.length > 0 : true)
  return { circles, self: me, people, counts: { people: people.length, hopes: map.dreams.length, worries: map.worries.length } }
  }

/**
 * whereFilterExpr.js
 *
 * AST + serializer for LoopBack-style where filters.
 *
 * Node shapes:
 *  - ConditionNode: { type: 'condition', field: string, op: string, value?: string, value2?: string }
 *  - AndNode:       { type: 'and', children: Node[] }
 *  - OrNode:        { type: 'or', children: Node[] }
 *  - GroupNode:     { type: 'group', child: Node }
 */

export const WHERE_OPERATOR_OPTIONS = [
  { value: 'eq', label: 'eq (=)', needsValue: true },
  { value: 'neq', label: 'neq (!=)', needsValue: true },
  { value: 'gt', label: 'gt (>)', needsValue: true },
  { value: 'gte', label: 'gte (>=)', needsValue: true },
  { value: 'lt', label: 'lt (<)', needsValue: true },
  { value: 'lte', label: 'lte (<=)', needsValue: true },
  { value: 'between', label: 'between', needsValue: true, needsSecondValue: true },
  { value: 'inq', label: 'inq (in list)', needsValue: true },
  { value: 'nin', label: 'nin (not in list)', needsValue: true },
  { value: 'like', label: 'like', needsValue: true },
  { value: 'nlike', label: 'nlike', needsValue: true },
  { value: 'ilike', label: 'ilike', needsValue: true },
  { value: 'nilike', label: 'nilike', needsValue: true },
  { value: 'regexp', label: 'regexp', needsValue: true },
]

export function makeWhereCondition(field, op = 'eq', value = '', value2 = '') {
  return { type: 'condition', field, op, value, value2 }
}

export function makeWhereAnd(children) {
  return { type: 'and', children }
}

export function makeWhereOr(children) {
  return { type: 'or', children }
}

export function makeWhereGroup(child) {
  return { type: 'group', child }
}

function parseLiteral(raw) {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return undefined

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)

  const lowered = trimmed.toLowerCase()
  if (lowered === 'true') return true
  if (lowered === 'false') return false
  if (lowered === 'null') return null

  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function serializeCondition(qs, prefix, cond) {
  const field = String(cond?.field ?? '').trim()
  const op = String(cond?.op ?? 'eq').trim().toLowerCase()
  if (!field || !op) return

  if (op === 'between') {
    const left = parseLiteral(cond?.value)
    const right = parseLiteral(cond?.value2)
    if (left === undefined || right === undefined) return
    qs.set(`${prefix}[${field}][between][0]`, String(left))
    qs.set(`${prefix}[${field}][between][1]`, String(right))
    return
  }

  if (op === 'inq' || op === 'nin') {
    const parts = String(cond?.value ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => parseLiteral(p))
      .filter((v) => v !== undefined)

    if (parts.length === 0) return
    parts.forEach((part, i) => {
      qs.set(`${prefix}[${field}][${op}][${i}]`, String(part))
    })
    return
  }

  const value = parseLiteral(cond?.value)
  if (value === undefined) return

  if (op === 'eq') {
    qs.set(`${prefix}[${field}]`, String(value))
    return
  }

  qs.set(`${prefix}[${field}][${op}]`, String(value))
}

export function applyWhereExprToQS(qs, node, prefix = 'filter[where]') {
  if (!node) return

  if (node.type === 'group') {
    applyWhereExprToQS(qs, node.child, prefix)
    return
  }

  if (node.type === 'condition') {
    serializeCondition(qs, prefix, node)
    return
  }

  if (node.type !== 'and' && node.type !== 'or') return

  const validChildren = (node.children ?? []).filter(Boolean)
  if (validChildren.length === 0) return
  if (validChildren.length === 1) {
    applyWhereExprToQS(qs, validChildren[0], prefix)
    return
  }

  validChildren.forEach((child, i) => {
    applyWhereExprToQS(qs, child, `${prefix}[${node.type}][${i}]`)
  })
}

export function buildWhereFilterQuery(qs, expr) {
  if (!expr) return qs
  applyWhereExprToQS(qs, expr, 'filter[where]')
  return qs
}

function formatConditionToken(cond) {
  const field = cond.field
  const op = cond.op
  if (op === 'between') {
    return `${field} between ${cond.value || '?'} and ${cond.value2 || '?'}`
  }
  if (op === 'inq' || op === 'nin') {
    return `${field} ${op} [${cond.value || '?'}]`
  }
  return `${field} ${op} ${cond.value || '?'}`
}

let tokenCounter = 0
function nextTokenId() {
  tokenCounter += 1
  return String(tokenCounter)
}

export function whereExprToTokens(node) {
  if (!node) return []

  if (node.type === 'condition') {
    return [{ type: 'condition', condition: node, label: formatConditionToken(node), id: nextTokenId() }]
  }

  if (node.type === 'group') {
    const inner = whereExprToTokens(node.child)
    return [{ type: 'lparen', id: nextTokenId() }, ...inner, { type: 'rparen', id: nextTokenId() }]
  }

  if (node.type === 'and' || node.type === 'or') {
    const out = []
    node.children.forEach((child, i) => {
      if (i > 0) out.push({ type: 'op', op: node.type, id: nextTokenId() })
      out.push(...whereExprToTokens(child))
    })
    return out
  }

  return []
}

export function whereTokensToExpr(tokens) {
  if (!tokens || tokens.length === 0) return null

  let pos = 0
  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]

  function parseAtom() {
    const token = peek()
    if (!token) return null

    if (token.type === 'condition') {
      consume()
      const c = token.condition
      return makeWhereCondition(c.field, c.op, c.value, c.value2)
    }

    if (token.type === 'lparen') {
      consume()
      const inner = parseExpr()
      if (peek()?.type === 'rparen') consume()
      return inner ? makeWhereGroup(inner) : null
    }

    consume()
    return null
  }

  function parseExpr() {
    let left = parseAtom()
    if (!left) return null

    while (pos < tokens.length) {
      const opToken = peek()
      if (opToken?.type !== 'op') break
      consume()
      const right = parseAtom()
      if (!right) break

      const op = opToken.op
      if (left.type === op) {
        left = { ...left, children: [...left.children, right] }
      } else {
        left = { type: op, children: [left, right] }
      }
    }

    return left
  }

  return parseExpr()
}

export function appendWhereBlock(existing, block, joinOp) {
  if (!existing) return block

  if (existing.type === joinOp) {
    return { ...existing, children: [...existing.children, block] }
  }

  const left =
    (existing.type === 'and' || existing.type === 'or') && existing.children.length > 1
      ? makeWhereGroup(existing)
      : existing

  const right =
    (block.type === 'and' || block.type === 'or') && block.children.length > 1
      ? makeWhereGroup(block)
      : block

  return { type: joinOp, children: [left, right] }
}

export function buildWhereBlockFromClauses(clauses, internalOp = 'and') {
  if (!Array.isArray(clauses)) return null

  const conditions = clauses
    .filter((c) => {
      if (!c || !String(c.field ?? '').trim()) return false
      const op = String(c.op ?? 'eq').trim().toLowerCase()
      const hasValue = String(c.value ?? '').trim() !== ''
      const hasSecondValue = String(c.value2 ?? '').trim() !== ''
      if (op === 'between') return hasValue && hasSecondValue
      return hasValue
    })
    .map((c) => makeWhereCondition(c.field, c.op || 'eq', c.value ?? '', c.value2 ?? ''))

  if (conditions.length === 0) return null
  if (conditions.length === 1) return conditions[0]

  return internalOp === 'or'
    ? makeWhereOr(conditions)
    : makeWhereAnd(conditions)
}

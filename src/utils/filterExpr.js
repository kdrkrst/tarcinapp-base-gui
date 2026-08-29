/**
 * filterExpr.js
 *
 * A lightweight AST for composing `set[…]` query-string expressions.
 *
 * Node shapes
 * ──────────────────────────────────────────────────────────────────────────
 *   SetNode   { type: 'set',  key: string, meta: { isObject, userIds?, groupIds? } }
 *   AndNode   { type: 'and',  children: Node[] }
 *   OrNode    { type: 'or',   children: Node[] }
 *   GroupNode { type: 'group', child: Node }  ← parenthesised sub-expression
 *
 * Only SetNodes, AndNodes, OrNodes, and GroupNodes are used at runtime.
 * GroupNodes wrap a single sub-expression and affect how the serialiser
 * maps the tree to the nested `set[and][…][or][…]` key format.
 *
 * Serialisation rules (order-of-operations respected for grouping)
 * ──────────────────────────────────────────────────────────────────────────
 *  1. Single SetNode               → set[key]=true   (or with userIds/groupIds)
 *  2. Pure-Or  of N SetNodes       → set[or][i][key]
 *  3. Pure-And of N SetNodes       → set[and][i][key]  (each slot has 1 item)
 *  4. And of Or-groups             → set[and][i][or][j][key]
 *  5. Arbitrary nesting: the serialiser flattens a depth-first walk into the
 *     flat LoopBack-style bracket notation used by the backend.
 */

// ─── Constructors ────────────────────────────────────────────────────────────

export function makeSet(key, meta = { isObject: false }) {
  return { type: 'set', key, meta: { isObject: false, userIds: '', groupIds: '', ...meta } }
}

export function makeOr(children) {
  return { type: 'or', children }
}

export function makeAnd(children) {
  return { type: 'and', children }
}

export function makeGroup(child) {
  return { type: 'group', child }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Unwrap a GroupNode to its inner child. */
export function unwrap(node) {
  return node?.type === 'group' ? node.child : node
}

/** Returns true when a node is a flat leaf (SetNode or GroupNode wrapping a SetNode). */
export function isLeaf(node) {
  if (!node) return false
  if (node.type === 'set') return true
  if (node.type === 'group') return isLeaf(node.child)
  return false
}

// ─── Serialiser ──────────────────────────────────────────────────────────────

/**
 * Serialise a FilterExpr node into URLSearchParams keys.
 * The path argument tracks the current bracket-notation prefix as we recurse.
 *
 * @param {URLSearchParams} qs
 * @param {object} node
 * @param {string} [prefix]  e.g. '' | 'set' | 'set[and][0]'
 */
export function applyExprToQS(qs, node, prefix = 'set') {
  if (!node) return

  if (node.type === 'group') {
    applyExprToQS(qs, node.child, prefix)
    return
  }

  if (node.type === 'set') {
    const { key, meta } = node
    if (meta.isObject) {
      if (meta.userIds?.trim()) qs.set(`${prefix}[${key}][userIds]`, meta.userIds.trim())
      if (meta.groupIds?.trim()) qs.set(`${prefix}[${key}][groupIds]`, meta.groupIds.trim())
    } else {
      qs.set(`${prefix}[${key}]`, 'true')
    }
    return
  }

  if (node.type === 'or') {
    const children = node.children
    if (children.length === 0) return
    if (children.length === 1) {
      applyExprToQS(qs, children[0], prefix)
      return
    }
    children.forEach((child, i) => {
      applyExprToQS(qs, child, `${prefix}[or][${i}]`)
    })
    return
  }

  if (node.type === 'and') {
    const children = node.children
    if (children.length === 0) return
    if (children.length === 1) {
      applyExprToQS(qs, children[0], prefix)
      return
    }
    children.forEach((child, i) => {
      applyExprToQS(qs, child, `${prefix}[and][${i}]`)
    })
    return
  }
}

/**
 * Top-level entry: write a FilterExpr into a URLSearchParams starting at key `set`.
 */
export function buildFilterExprQuery(qs, expr) {
  if (!expr) return qs
  applyExprToQS(qs, expr, 'set')
  return qs
}

// ─── Display renderer ────────────────────────────────────────────────────────

/**
 * Convert a FilterExpr node into a human-readable token list for the VisualFilterBuilder.
 *
 * Returns an array of tokens:
 *   { type: 'set',    key: string, id: string }
 *   { type: 'op',     op: 'and'|'or', id: string }
 *   { type: 'lparen', id: string }
 *   { type: 'rparen', id: string }
 *
 * IDs are positional strings used as React keys.
 */
let _tokenId = 0
function nextId() { return String(++_tokenId) }

export function exprToTokens(node) {
  if (!node) return []

  if (node.type === 'set') {
    return [{ type: 'set', key: node.key, meta: node.meta, id: nextId() }]
  }

  if (node.type === 'group') {
    const inner = exprToTokens(node.child)
    return [
      { type: 'lparen', id: nextId() },
      ...inner,
      { type: 'rparen', id: nextId() },
    ]
  }

  if (node.type === 'or' || node.type === 'and') {
    const op = node.type
    const result = []
    node.children.forEach((child, i) => {
      if (i > 0) result.push({ type: 'op', op, id: nextId() })
      result.push(...exprToTokens(child))
    })
    return result
  }

  return []
}

// ─── Mutation helpers for the builder ────────────────────────────────────────

/**
 * Append a block to an existing expression joined by `joinOp`.
 *
 * @param {object|null} existing   Current root expr (may be null)
 * @param {object}      block      The new sub-expression to append
 * @param {'and'|'or'}  joinOp     How to join block to the existing expression
 * @returns {object}               New root expr
 */
export function appendBlock(existing, block, joinOp) {
  if (!existing) return block

  // If existing root is the same op type, just push another child
  if (existing.type === joinOp) {
    return { ...existing, children: [...existing.children, block] }
  }

  // Different op — wrap both sides. If the existing node is a multi-child
  // and/or expression, wrap it in a group so parentheses appear in the UI.
  const left =
    (existing.type === 'and' || existing.type === 'or') && existing.children.length > 1
      ? makeGroup(existing)
      : existing
  const right =
    (block.type === 'and' || block.type === 'or') && block.children.length > 1
      ? makeGroup(block)
      : block
  return { type: joinOp, children: [left, right] }
}

/**
 * Build a block from an array of set-keys, combining them with `internalOp`.
 *
 * @param {string[]}   keys         Array of set key names
 * @param {object}     setSchemaProps  The navItem.setSchemaProps map
 * @param {'and'|'or'} internalOp   How to join the keys within this block
 * @returns {object|null}
 */
export function buildBlockFromKeys(keys, setSchemaProps, internalOp) {
  if (!keys.length) return null
  const setNodes = keys.map((k) => makeSet(k, setSchemaProps?.[k] ?? { isObject: false }))
  if (setNodes.length === 1) return setNodes[0]
  return { type: internalOp, children: setNodes }
}

// ─── Token-index edit helpers (for the visual builder UI) ─────────────────────

/**
 * Re-parse token list mutations back into an AST.
 * This is used after the user removes a token or changes an operator token.
 *
 * Strategy: the token list is the source of truth; we rebuild the AST from it
 * via a simple recursive-descent parse that respects parentheses.
 *
 * Token types:
 *   set   → leaf
 *   op    → binary infix operator
 *   lparen / rparen → grouping
 *
 * Grammar (informal):
 *   expr   := atom (op atom)*
 *   atom   := set | '(' expr ')'
 */
export function tokensToExpr(tokens) {
  if (!tokens || tokens.length === 0) return null

  let pos = 0

  function peek() { return tokens[pos] }
  function consume() { return tokens[pos++] }

  function parseAtom() {
    const t = peek()
    if (!t) return null
    if (t.type === 'set') {
      consume()
      return makeSet(t.key, t.meta)
    }
    if (t.type === 'lparen') {
      consume() // consume '('
      const inner = parseExpr()
      if (peek()?.type === 'rparen') consume() // consume ')'
      return inner ? makeGroup(inner) : null
    }
    // Skip unexpected tokens
    consume()
    return null
  }

  function parseExpr() {
    let left = parseAtom()
    if (!left) return null

    while (pos < tokens.length) {
      const opToken = peek()
      if (opToken?.type !== 'op') break
      consume() // consume op
      const right = parseAtom()
      if (!right) break
      const op = opToken.op
      // Flatten same-op sequences: (a or b) or c → or[a,b,c]
      if (left.type === op) {
        left = { ...left, children: [...left.children, right] }
      } else {
        left = { type: op, children: [left, right] }
      }
    }
    return left
  }

  const result = parseExpr()
  return result
}

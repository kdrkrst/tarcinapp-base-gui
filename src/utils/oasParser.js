/**
 * OAS Parser
 *
 * Converts an OpenAPI 3.x spec object into:
 *   - navItems  – hierarchical sidebar navigation
 *   - tagMap    – raw tag → paths lookup
 *
 * Navigation structure:
 *   Top-level items  = tags that own a root collection endpoint (no path params, GET)
 *   Child items      = traversal endpoints under {id}/subResource
 */

export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Resolve a JSON Pointer $ref from the spec root (e.g. '#/components/schemas/Foo') */
function resolveRef(spec, ref) {
  if (!ref?.startsWith('#/')) return null
  return ref.slice(2).split('/').reduce((cur, part) => cur?.[part], spec) ?? null
}

/**
 * Returns the schema for a single item in a collection GET 200 response.
 * Follows array → items and resolves $ref.
 */
function getCollectionItemSchema(spec, collectionPath) {
  let schema = spec?.paths?.[collectionPath]?.get?.responses?.['200']
    ?.content?.['application/json']?.schema
  if (!schema) return null
  if (schema.type === 'array' && schema.items) schema = schema.items
  if (schema.$ref) schema = resolveRef(spec, schema.$ref)
  return schema
}

/** Returns true when a path string contains at least one {param} segment */
function hasPathParam(pathStr) {
  return /\{[^}]+\}/.test(pathStr)
}

/**
 * Returns the sub-resource name if the path is a traversal, e.g.
 *   /api/v1/entities/{id}/children  →  "children"
 *   /api/v1/entities/{id}           →  null
 *   /api/v1/entities                →  null
 */
function traversalSubResource(pathStr) {
  const m = pathStr.match(/\{[^}]+\}\/(.+)$/)
  return m ? m[1] : null
}

/**
 * Parse an OAS spec and return nav items + tag map.
 *
 * @param {object} spec  OpenAPI 3.x spec
 * @returns {{ navItems: NavItem[], tagMap: object }}
 *
 * NavItem: {
 *   id, label, routePath, collectionPath,
 *   collectionMethods, itemPathTemplate, itemMethods,
 *   children: [{ id, label, routePath, pathTemplate, parentTag, subResource }]
 * }
 */
export function parseOasSpec(spec) {
  if (!spec?.paths) return { navItems: [], tagMap: {} }

  // tagMap: { [tagName]: { tag, collectionPath, collectionMethods, itemPathTemplate, itemMethods, traversals } }
  const tagMap = {}

  for (const [pathStr, pathObj] of Object.entries(spec.paths)) {
    if (!pathObj || typeof pathObj !== 'object') continue

    for (const [method, op] of Object.entries(pathObj)) {
      // Skip non-operation keys (parameters, summary, etc.)
      if (!op?.tags || !Array.isArray(op.tags)) continue

      for (const tag of op.tags) {
        if (!tagMap[tag]) {
          tagMap[tag] = {
            tag,
            collectionPath: null,
            collectionMethods: new Set(),
            itemPathTemplate: null,
            itemMethods: new Set(),
            traversals: [],
          }
        }

        // Root collection: no path params, GET, not a /count path
        if (
          !hasPathParam(pathStr) &&
          !pathStr.endsWith('/count')
        ) {
          if (!tagMap[tag].collectionPath) {
            tagMap[tag].collectionPath = pathStr
          }
          if (tagMap[tag].collectionPath === pathStr) {
            tagMap[tag].collectionMethods.add(method)
          }
        }

        // Traversal: has {param}/subResource, GET
        if (method === 'get') {
          const sub = traversalSubResource(pathStr)
          if (sub && !tagMap[tag].traversals.find((t) => t.subResource === sub)) {
            tagMap[tag].traversals.push({ subResource: sub, pathTemplate: pathStr })
          }
        }

        // Single-item operations: /collection/{id} with no additional segment
        const isSingleItemPath =
          hasPathParam(pathStr) &&
          !traversalSubResource(pathStr) &&
          /\/\{[^}]+\}$/.test(pathStr)

        if (isSingleItemPath && ['get', 'put', 'patch', 'delete'].includes(method)) {
          if (!tagMap[tag].itemPathTemplate || tagMap[tag].itemPathTemplate === pathStr) {
            tagMap[tag].itemPathTemplate = pathStr
            tagMap[tag].itemMethods.add(method)
          }
        }
      }
    }
  }

  // Build flat nav items (only tags with a collection path)
  const navItems = Object.values(tagMap)
    .filter((t) => t.collectionPath)
    .map((t) => {
      const collectionGetParams = Array.isArray(spec?.paths?.[t.collectionPath]?.get?.parameters)
        ? spec.paths[t.collectionPath].get.parameters
        : []
      const hasSearch = collectionGetParams.some((p) => p?.name === 's' && p?.in === 'query')

      const itemSchema = getCollectionItemSchema(spec, t.collectionPath)
      const schemaProps = itemSchema?.properties ?? {}
      const hasValidityDates = '_validFromDateTime' in schemaProps || '_validUntilDateTime' in schemaProps

      // Detect filter[fields] capability: filter param with deepObject style that has a `fields` property
      const filterParam = collectionGetParams.find(
        (p) => p?.name === 'filter' && p?.in === 'query' && p?.style === 'deepObject'
      )
      const hasFilterFields = !!(filterParam?.schema?.properties?.fields)

      const hasFieldset = collectionGetParams.some((p) => p?.name === 'fieldset' && p?.in === 'query')
      const hasFields = collectionGetParams.some((p) => p?.name === 'fields' && p?.in === 'query')

      // Detect q parameter and its enum values
      const qParam = collectionGetParams.find((p) => p?.name === 'q' && p?.in === 'query')
      const qEnumValues = Array.isArray(qParam?.schema?.enum) ? qParam.schema.enum : null

      // Derive available field names from the response schema properties (all fields, including validity dates)
      const availableFields = Object.keys(schemaProps)

      return ({
        id: slugify(t.tag),
        label: t.tag,
        routePath: `/r/${slugify(t.tag)}`,
      collectionPath: t.collectionPath,
      collectionMethods: ['get', 'post', 'patch', 'put', 'delete'].filter((m) => t.collectionMethods.has(m)),
        hasSearch,
        hasValidityDates,
        hasFilterFields,
        hasFieldset,
        hasFields,
        qEnumValues,
        availableFields,
        itemPathTemplate: t.itemPathTemplate,
        itemMethods: ['get', 'put', 'patch', 'delete'].filter((m) => t.itemMethods.has(m)),
        children: t.traversals.map((tr) => ({
          id: `${slugify(t.tag)}-${slugify(tr.subResource)}`,
          label: capitalize(tr.subResource),
          routePath: `/r/${slugify(t.tag)}/${encodeURIComponent(tr.subResource)}`,
          pathTemplate: tr.pathTemplate,
          parentTag: slugify(t.tag),
          subResource: tr.subResource,
        })),
      })
    })

  return { navItems, tagMap }
}

/**
 * Resolve pagination query keys for an operation.
 * Prefer native `limit`/`skip` when declared by OAS, otherwise fall back to LoopBack filter notation.
 */
export function resolvePaginationQueryKeys(spec, pathStr, method = 'get') {
  const op = spec?.paths?.[pathStr]?.[method]
  const queryParams = Array.isArray(op?.parameters)
    ? op.parameters.filter((p) => p?.in === 'query').map((p) => p?.name)
    : []

  const hasLimit = queryParams.includes('limit')
  const hasSkip = queryParams.includes('skip')

  return {
    limitKey: hasLimit ? 'limit' : 'filter[limit]',
    skipKey: hasSkip ? 'skip' : 'filter[skip]',
    hasNativeLimit: hasLimit,
    hasNativeSkip: hasSkip,
  }
}

/** System field display order (prefix with _). Validity date fields are excluded — shown as row status indicator instead. */
const SYSTEM_FIELD_ORDER = [
  '_id',
  '_name',
  '_kind',
  '_visibility',
  '_createdBy',
  '_createdDateTime',
  '_updatedDateTime',
]

const HIDDEN_FIELDS = new Set(['_validFromDateTime', '_validUntilDateTime'])

/**
 * Derive DataGrid column definitions from an array of row objects.
 * System fields are shown first in a fixed order; custom fields follow alphabetically.
 */
export function deriveColumns(data) {
  if (!data?.length) return []

  const allKeys = new Set()
  for (const row of data) {
    for (const k of Object.keys(row)) {
      if (!HIDDEN_FIELDS.has(k)) allKeys.add(k)
    }
  }

  const keys = [...allKeys]
  keys.sort((a, b) => {
    const ai = SYSTEM_FIELD_ORDER.indexOf(a)
    const bi = SYSTEM_FIELD_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  return keys.map((key) => ({
    key,
    label: formatLabel(key),
  }))
}

function formatLabel(key) {
  return key
    .replace(/^_/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

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
 * Normalizes a base record type value from the OAS x-base-record-type extension
 * into a consistent kebab-case string used throughout the UI.
 * Accepts camelCase (entityReaction, listReaction) from the OAS extension, and
 * kebab-case from the path-segment fallback.
 */
const BASE_TYPE_NORMALIZE = {
  entity: 'entity',
  list: 'list',
  relation: 'relation',
  entityReaction: 'entity-reaction',
  'entity-reaction': 'entity-reaction',
  listReaction: 'list-reaction',
  'list-reaction': 'list-reaction',
}

function normalizeBaseType(raw) {
  if (!raw) return null
  return BASE_TYPE_NORMALIZE[raw] ?? null
}

/**
 * Derives the base record type from a collection path as a fallback.
 * Looks for a known plural segment (entities, lists, relations, …) in the path.
 */
function deriveBaseTypeFromPath(collectionPath) {
  if (!collectionPath) return null
  const PATH_SEGMENT_MAP = {
    entities: 'entity',
    lists: 'list',
    relations: 'relation',
    'entity-reactions': 'entity-reaction',
    'list-reactions': 'list-reaction',
  }
  for (const seg of collectionPath.replace(/^\//, '').split('/')) {
    if (PATH_SEGMENT_MAP[seg]) return PATH_SEGMENT_MAP[seg]
  }
  return null
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
const FALLBACK_SET_PROPS = {
  publics:    { isObject: false },
  privates:   { isObject: false },
  protecteds: { isObject: false },
  actives:    { isObject: false },
  expireds:   { isObject: false },
  pendings:   { isObject: false },
  roots:      { isObject: false },
  owners:     { isObject: true },
  viewers:    { isObject: true },
  audience:   { isObject: true },
}

export function parseOasSpec(spec) {
  if (!spec?.paths) return { navItems: [], tagMap: {} }

  // Build a lookup of tag name → baseType from the top-level tags array.
  // Primary source: tag.extensions['x-base-record-type'] (set by the backend).
  // Also handles flat tag['x-base-record-type'] for standard OAS serializers.
  const tagBaseTypeMap = {}
  for (const tagDef of spec.tags ?? []) {
    if (!tagDef?.name) continue
    const raw = tagDef.extensions?.['x-base-record-type']
      ?? tagDef['x-base-record-type']
      ?? null
    tagBaseTypeMap[tagDef.name] = normalizeBaseType(raw)
  }

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

        // Traversal: has {param}/subResource — collect all methods
        const sub = traversalSubResource(pathStr)
        if (sub) {
          const existing = tagMap[tag].traversals.find((t) => t.subResource === sub)
          if (existing) {
            existing.methods.add(method)
          } else {
            tagMap[tag].traversals.push({ subResource: sub, pathTemplate: pathStr, methods: new Set([method]) })
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
      // Simplified search: gateway translates ?s=value to filter[where][_name][regexp]=.*value.*
      const hasSimplifiedSearch = collectionGetParams.some((p) => p?.name === 's' && p?.in === 'query')

      const itemSchema = getCollectionItemSchema(spec, t.collectionPath)
      const schemaProps = itemSchema?.properties ?? {}
      const hasValidityDates = '_validFromDateTime' in schemaProps || '_validUntilDateTime' in schemaProps

      // Detect filter deepObject: covers filter[where], filter[fields], filter[order], filter[limit], filter[skip]
      const filterParam = collectionGetParams.find(
        (p) => p?.name === 'filter' && p?.in === 'query' && p?.style === 'deepObject'
      )
      const hasFilterFields = !!(filterParam?.schema?.properties?.fields)
      const hasFilterOrder = !!(filterParam?.schema?.properties?.order)
      // filter[where] is the base fallback for search when ?s= is not available
      const hasFilterWhere = !!(filterParam?.schema?.properties?.where)
      // search box is shown when either the simplified ?s= or the base filter[where] is declared
      const hasSearch = hasSimplifiedSearch || hasFilterWhere

      // Pagination: prefer native ?limit=/?skip=; fall back to filter[limit]/filter[skip]
      const hasNativeLimit = collectionGetParams.some((p) => p?.name === 'limit' && p?.in === 'query')
      const hasFilterLimit = !!(filterParam?.schema?.properties?.limit)
      // hasPagination: false only when neither form is declared in the spec
      const hasPagination = hasNativeLimit || hasFilterLimit

      const hasFieldset = collectionGetParams.some((p) => p?.name === 'fieldset' && p?.in === 'query')
      const hasFields = collectionGetParams.some((p) => p?.name === 'fields' && p?.in === 'query')

      // Detect set parameter capability: deepObject query param named 'set'
      const setParam = collectionGetParams.find(
        (p) => p?.name === 'set' && p?.in === 'query' && p?.style === 'deepObject'
      )
      const hasSet = !!setParam

      // Derive set schema props for Sets dropdown (key → { isObject })
      const setSchemaProps = setParam
        ? (setParam.schema?.properties
            ? Object.fromEntries(
                Object.entries(setParam.schema.properties).map(([k, v]) => [
                  k, { isObject: v?.type === 'object' || v?.properties != null },
                ])
              )
            : FALLBACK_SET_PROPS)
        : null

      // Detect q parameter and its enum values
      const qParam = collectionGetParams.find((p) => p?.name === 'q' && p?.in === 'query')
      const qEnumValues = Array.isArray(qParam?.schema?.enum) ? qParam.schema.enum : null

      // Detect fieldset parameter and its enum values
      const fieldsetParam = collectionGetParams.find((p) => p?.name === 'fieldset' && p?.in === 'query')
      const fieldsetEnumValues = Array.isArray(fieldsetParam?.schema?.enum) ? fieldsetParam.schema.enum : null

      // Derive available field names from the response schema properties (all fields, including validity dates)
      const availableFields = Object.keys(schemaProps)

      // Prefer the extension value from spec.tags; fall back to path-segment detection.
      const baseType = tagBaseTypeMap[t.tag] ?? deriveBaseTypeFromPath(t.collectionPath)

      return ({
        id: slugify(t.tag),
        label: t.tag,
        baseType,
        routePath: `/r/${slugify(t.tag)}`,
      collectionPath: t.collectionPath,
      collectionMethods: ['get', 'post', 'patch', 'put', 'delete'].filter((m) => t.collectionMethods.has(m)),
        hasSearch,
        hasSimplifiedSearch,
        hasFilterWhere,
        hasPagination,
        hasValidityDates,
        hasSet,
        setSchemaProps,
        hasFilterFields,
        hasFilterOrder,
        hasFieldset,
        hasFields,
        qEnumValues,
        fieldsetEnumValues,
        availableFields,
        itemSchemaProps: schemaProps,
        itemAllowsAdditionalProps: itemSchema != null && itemSchema.additionalProperties !== false,
        itemPathTemplate: t.itemPathTemplate,
        itemMethods: ['get', 'put', 'patch', 'delete'].filter((m) => t.itemMethods.has(m)),
        children: t.traversals.map((tr) => ({
          id: `${slugify(t.tag)}-${slugify(tr.subResource)}`,
          label: capitalize(tr.subResource),
          routePath: `/r/${slugify(t.tag)}/${encodeURIComponent(tr.subResource)}`,
          pathTemplate: tr.pathTemplate,
          parentTag: slugify(t.tag),
          subResource: tr.subResource,
          methods: ['get', 'post', 'patch', 'delete'].filter((m) => tr.methods.has(m)),
        })),
      })
    })

  const BASE_TYPE_ORDER = ['entity', 'list', 'relation', 'entity-reaction', 'list-reaction']
  navItems.sort((a, b) => {
    const ai = BASE_TYPE_ORDER.indexOf(a.baseType)
    const bi = BASE_TYPE_ORDER.indexOf(b.baseType)
    const ao = ai === -1 ? BASE_TYPE_ORDER.length : ai
    const bo = bi === -1 ? BASE_TYPE_ORDER.length : bi
    return ao - bo
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

/**
 * Returns the resolved POST request body schema for a collection endpoint.
 * Follows $ref if needed. Returns null if no POST body schema is found.
 */
export function getPostBodySchema(spec, collectionPath) {
  if (!spec || !collectionPath) return null
  let schema = spec?.paths?.[collectionPath]?.post
    ?.requestBody?.content?.['application/json']?.schema
  if (!schema) return null
  if (schema.$ref) schema = resolveRef(spec, schema.$ref)
  return schema ?? null
}

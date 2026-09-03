# Repository Context: tarcinapp-base-gui

## Purpose

`tarcinapp-base-gui` is a **domain-agnostic base UI** for the Tarcinapp entity persistence platform. Its role is to provide a ready-to-use browser interface for browsing and managing any data stored in a Tarcinapp deployment, regardless of what business domain that deployment is configured for.

The UI is not built for a specific domain. It has no knowledge of domain concepts. Instead, it connects to an `entity-persistence-gateway` instance, fetches the OpenAPI spec that gateway generates for the current user, and builds the entire interface from that spec at runtime: navigation structure, page routes, data grid columns, form fields, and available actions are all derived from the spec, never hardcoded.

This means the same codebase, without modification, can serve as the admin and explorer UI for a books application, a product catalog, a CRM, a content platform, or any other domain that the Tarcinapp been projected through the gateway we are connecting to. Swapping the connected gateway changes what the UI renders. The UI code stays the same.

---

## How the UI is Generated

The central mechanism of this application is **OAS-driven UI generation**. On first load, `oasParser.js` fetches the OpenAPI spec from the connected gateway and derives:

- **Sidebar navigation**: grouped by record type (`entity`, `list`, `relation`, `entity-reaction`, `list-reaction`) using the `x-base-record-type` extension on each OAS **tag definition**. This is the primary and path-independent grouping mechanism. If the extension is absent, `oasParser.js` falls back to scanning the collection path for known segment names (`entities`, `lists`, `relations`, `entity-reactions`, `list-reactions`). Each OAS tag becomes a nav entry and a URL slug (e.g., tag `books` becomes route `/r/books`).
- **Data grid columns**: read from the 200-response schema of each collection GET operation. Only fields present in the response schema are rendered as columns.
- **Create/edit form fields**: read from the POST (`New{Kind}`) and PATCH (`Patch{Kind}`) request body schemas. Only fields present in those schemas are offered for input.
- **Available actions**: Create, Edit, and Delete buttons are rendered only when the corresponding HTTP methods are present in the spec for that resource.
- **Traversal links**: sub-resource paths (e.g., `/books/{id}/chapters`) are discovered from the spec and surfaced as navigation within item views.

Nothing in the UI is hardcoded to a specific resource name, field name, or business concept. The spec is the only configuration the UI needs.

---

## OAS as Security Boundary

The gateway does not generate a generic, public OpenAPI spec. It generates a **personalized spec per caller**, shaped by the caller's identity, roles, and the active OPA authorization policies. This has a direct consequence for the UI:

- Fields the caller may not read are **physically removed** from GET response schemas. The GUI will not render them as columns or show them in item views.
- Fields the caller may not write are **physically removed** from POST/PATCH request schemas. The GUI will not include them in forms.
- Routes the caller may not access are **absent from the spec entirely**. The GUI will not render Create/Edit/Delete actions for those operations.

**The GUI implements no client-side access control logic.** It renders exactly what the spec describes, nothing more. This means changing a user's role or updating an OPA policy in the gateway is immediately reflected in the UI on the next spec fetch, without any frontend changes.

### Runtime Authorization

The OAS-driven rendering described above covers **spec-time** access control: what fields and routes are visible to the caller's role. However, some authorization decisions can only be made at **request time**, because they depend on the actual data being sent, not just the caller's identity.

Examples of runtime-only authorization checks:
- A caller may be allowed to write `_validFromDateTime`, but not allowed to set it to a date in the past.
- A caller may be allowed to update a field, but not allowed to set it to `null`.
- A caller may be allowed to create records with `_visibility = "public"` but not `"private"`.

These constraints cannot be expressed in an OAS schema in a way that is tied to caller identity, so the gateway evaluates them against the actual request payload using OPA policies at the time the request is made.

When a runtime authorization check fails, the gateway returns an error response. The GUI catches this and displays the error message in a toast notification. For routes that are present in the spec, the UI has no way to predict the policy outcome at form-render time, so it does not prevent the user from attempting the operation. If the operation is not permitted at all for the caller's role, the gateway removes the route from the spec entirely and the UI does not render the corresponding button.

---

## What the GUI Manages: The Tarcinapp Data Model

The Tarcinapp platform stores all data as records in five structural types. Every record, regardless of domain, is an arbitrary JSON document decorated with a standard set of **managed fields** (underscore-prefixed).

### Resource Types

| Resource | Resource Segment | Notes |
|---|---|---|
| **Entity** | `entities` | Primary domain objects. Supports hierarchy (`/children`, `/parents`). |
| **List** | `lists` | Collections/groupings of entities. Supports hierarchy. |
| **Relation** | `relations` | Many-to-many join records linking a list to an entity. Flat, no hierarchy. |
| **Entity Reaction** | `entity-reactions` | Interactions on entities (ratings, comments, etc.). Supports hierarchy (threaded). |
| **List Reaction** | `list-reactions` | Interactions on lists. Supports hierarchy. |

The "Resource Segment" is the path segment the gateway uses for each structural type. The actual full path depends on gateway configuration: a base prefix may or may not precede these segments (e.g., the gateway may be configured to expose `/entities` directly, or with a prefix like `/api/v1/entities`, or completely unprefixed like `/items`).

The GUI supports two deployment modes, both fully functional:

- **No domain projection** (generic mode): The gateway exposes the structural types directly. The OAS contains paths like `/entities`, `/lists`, etc. (with whatever prefix is configured), and operation tags like `Entities`, `Lists`, `Relations`, `Entity reactions`, `List reactions`. The sidebar shows these five entries grouped by type. The bundled `oas.json` in this repository is an example of this mode (configured with an `/api/v1` prefix during development).
- **Domain projection active**: The gateway overlays a business domain. The OAS contains kind-alias paths like `/entities/books`, `/lists/shelves` (again, prefix may vary), and tags like `Books`, `Shelves`, `Authors`. The sidebar shows the domain-specific entries instead. The five structural types are still the underlying contract; only the paths and tags visible to the GUI change.

Traversal paths (e.g. `/lists/{id}/entities`, `/entities/{id}/reactions`) allow navigating relationships without knowing join IDs upfront.

### Managed Fields

Every record is automatically decorated with managed fields. These are governed by strict rules about who sets them and when.

**Category 1: Strictly Managed (set by the system, user input ignored)**

| Field | Type | Description |
|---|---|---|
| `_version` | `number` | Optimistic locking version. Auto-incremented on updates. |
| `_idempotencyKey` | `string` | Computed hash for deduplication. Never returned in responses but filterable. |
| `_parentsCount` | `number` | Cached count of `_parents`. Never returned but filterable (e.g. `filter[where][_parentsCount]=0` finds root records). |
| `_children` | `string[]` | Array of child record IDs. Populated by the backend by inverting `_parents` references — when a record's `_parents` is set to include a parent ID, that parent's `_children` is updated automatically. Not accepted in POST, PUT, or PATCH requests; modify `_parents` on the child record to influence this field indirectly. |
| `_ownerUsersCount` | `number` | Cached count of owner users. Never returned but filterable. |
| `_ownerGroupsCount` | `number` | Same for owner groups. |
| `_viewerUsersCount` | `number` | Same for viewer users. |
| `_viewerGroupsCount` | `number` | Same for viewer groups. |
| `_recordType` | `string` | Virtual field (`entity`, `list`, etc.). Not persisted. Always masked from all users. Used internally by the gateway for field masking on included records. |

**Category 2: Gateway Managed (injected from JWT; admin-modifiable via OPA policy)**

| Field | Type | Description |
|---|---|---|
| `_createdBy` | `string` | User ID of the creator. Injected by the gateway from the JWT at creation. |
| `_createdDateTime` | `datetime` | Timestamp of creation. Set by the gateway. |
| `_lastUpdatedBy` | `string` | User ID of last modifier. Injected by the gateway on every write. |
| `_lastUpdatedDateTime` | `datetime` | Timestamp of last modification. Set by the gateway. |
| `_validFromDateTime` | `datetime` | Approval gate / lifecycle start. Auto-filled by the service if not provided. |
| `_ownerUsers` | `string[]` | User IDs with ownership rights. Injected by the gateway at creation. |
| `_ownerGroups` | `string[]` | Group IDs with ownership rights. |

**Category 3: Auto-Filled (defaults applied if the caller omits them)**

| Field | Type | Description |
|---|---|---|
| `_kind` | `string` | Record subtype/variant (e.g. `book`, `shelf`, `review`). Injected by the gateway for kind-alias routes. Immutable after creation; changing it throws `422 IMMUTABLE-ENTITY-KIND`. |
| `_visibility` | `enum` | `"public"` \| `"protected"` \| `"private"`. Default configured per deployment. |
| `_slug` | `string` | URL-safe identifier. Auto-derived from `_name` if not provided. |

**Category 4: User-Settable**

| Field | Type | Description |
|---|---|---|
| `_id` | `string` | UUID. Server-generated. Immutable. |
| `_name` | `string` | Display name (minLength: 2). Required on Entity and List. |
| `_validUntilDateTime` | `datetime` | Soft-delete / expiry. Records past this date are considered expired. |
| `_viewerUsers` | `string[]` | User IDs with viewer (read) access. |
| `_viewerGroups` | `string[]` | Group IDs with viewer (read) access. |
| `_parents` | `string[]` | Array of `tapp://localhost/{type}/{uuid}` URIs enabling hierarchies. |

**Resource-specific fields**

| Field | Applies To | Description |
|---|---|---|
| `_listId` | Relation, List Reaction | Required. ID of the linked list. |
| `_entityId` | Relation, Entity Reaction | Required. ID of the linked entity. |
| `_relationMetadata` | Entity, List (traversal responses) | Metadata on the join record when returned via traversal. |
| `_fromMetadata` | Entity, List (traversal responses) | Metadata on the relation from the source side. |
| `_toMetadata` | Entity, List (traversal responses) | Metadata on the relation from the destination side. |

### Record Lifecycle and Visibility

Every record participates in a **status lifecycle** driven by two datetime fields, and an independent **visibility level** controlling audience. The GUI exposes both as filter dimensions.

**Status (based on `_validFromDateTime` / `_validUntilDateTime`)**:
- `actives`: `_validFromDateTime` is in the past and `_validUntilDateTime` is null or in the future
- `pendings`: `_validFromDateTime` is null or in the future (awaiting approval/publication)
- `expireds`: `_validUntilDateTime` is in the past (soft-deleted)

**Visibility (based on `_visibility`)**:
- `publics`: `_visibility = "public"`
- `protecteds`: `_visibility = "protected"`
- `privates`: `_visibility = "private"`

**Ownership**:
- `set[owners][userIds]=<userId>`: records where the given user is in `_ownerUsers`

The gateway injects appropriate set filters into backend queries based on the caller's identity and OPA policies. The GUI may also send explicit set filters when the user interacts with the status/visibility filter controls.

---

## Gateway Route Structure

The gateway exposes 140 routes in two categories. The GUI works with both, depending on how the connected gateway is configured. For the authoritative route reference, see [entity-persistence-gateway: Routes](https://github.com/tarcinapp/entity-persistence-gateway/blob/dev/.context/10-ROUTES.md).

> **Path shapes are fully configurable.** The gateway may expose paths with any prefix (e.g., `/api/v1`, `/v2`, nothing at all) and may rename the resource type segments (`entities`, `lists`, etc.) to any arbitrary string (e.g., `/catalog/books` instead of `/entities/books`). The GUI does not rely on path shape to understand what a route is — it reads the `x-base-record-type` extension from the OAS tag definition instead. The patterns below omit any base prefix; a real deployment will prepend whatever the gateway is configured with.

### Base Generic Routes (65 routes)

Direct paths using the backend's structural resource names. This is what the GUI sees when the gateway is not configured with a domain projection. OAS operation tags in this mode are per-resource-type names (`Entities`, `Lists`, `Relations`, `Entity reactions`, `List reactions`) — one tag per operation, no top-level tag definitions.

| Pattern | HTTP Methods | Description |
|---|---|---|
| `/{resource}` | GET, POST, PATCH | Collection: find, create, update-all |
| `/{resource}/count` | GET | Count matching records |
| `/{resource}/{id}` | GET, PATCH, PUT, DELETE | Single-item operations |
| `/{resource}/{id}/children` | GET, POST | Hierarchical children (Entity, List, Reactions) |
| `/{resource}/{id}/parents` | GET | Hierarchical parents |

Traversal paths:

| Path | Methods | Description |
|---|---|---|
| `/entities/{id}/reactions` | GET, POST, PATCH, DELETE | Entity reactions via entity |
| `/lists/{id}/reactions` | GET, POST, PATCH, DELETE | List reactions via list |
| `/lists/{id}/entities` | GET, POST, PATCH, DELETE | Entities within a list |
| `/entities/{id}/lists` | GET | Lists containing an entity |

### Kind Alias Routes (73 routes)

Domain-projected wrappers. This is what the GUI sees when the gateway is configured with a business domain. OAS operation tags in this mode are domain-specific names (`Books`, `Authors`, `Shelves`, etc.) — one tag per kind alias, each optionally carrying the `x-base-record-type` extension in the top-level `spec.tags` array. A `{kindAlias}` segment in the path resolves to a `_kind` filter at runtime; the GUI is unaware of the translation.

| Pattern | HTTP Methods | Example |
|---|---|---|
| `/{resource}/{kindAlias}` | GET, POST, PATCH | `GET /entities/books` |
| `/{resource}/{kindAlias}/count` | GET | `GET /entities/books/count` |
| `/{resource}/{kindAlias}/{id}` | GET, PATCH, PUT, DELETE | `PATCH /entities/books/abc123` |
| `/{resource}/{kindAlias}/{id}/children` | GET, POST | `POST /entities/books/abc123/children` |
| `/{resource}/{kindAlias}/{id}/parents` | GET | `GET /entities/books/abc123/parents` |
| `/{resource}/{kindAlias}/{id}/{hierarchyAlias}` | GET, POST | `GET /entities/books/abc123/chapters` |
| `/{resource}/{kindAlias}/{id}/reactions/{throughAlias}` | GET, POST, PATCH, DELETE | `GET /entities/books/abc123/reactions/reviews` |
| `/{resource}/{kindAlias}/{id}/entities/{throughAlias}` | GET, POST, PATCH, DELETE | `GET /lists/shelves/abc123/entities/books` |
| `/{resource}/{kindAlias}/{id}/lists/{throughAlias}` | GET | `GET /entities/books/abc123/lists/shelves` |

Example translations (books domain):

| GUI sends | Gateway rewrites to | Injected `_kind` |
|---|---|---|
| `GET /entities/books` | `GET /entities?filter[where][_kind]=book` | `book` |
| `POST /entities/books` | `POST /entities` + `{"_kind":"book",...}` | `book` |
| `GET /entities/books/{id}/chapters` | `GET /entities/{id}/children?filter[where][_kind]=chapter` | `chapter` |
| `GET /entities/books/{id}/reactions/reviews` | `GET /entities/{id}/reactions?filter[where][_kind]=review` | `review` |

### Gateway Route Tags

Every route in the gateway carries a set of internal **route tags** defined in `application-routes.yml`. These are Spring Cloud Gateway configuration tags, not OAS operation tags — the GUI never reads them directly. Their primary purpose is the **Route Toggles** feature: a single tag in the `off` list disables all matching routes without redeployment. For example, toggling off `generic` hides all 65 base generic routes, leaving only kind-alias endpoints active — producing a clean, domain-native API with no raw resource-type paths exposed. See the [Route Tags reference](https://github.com/tarcinapp/entity-persistence-gateway/blob/dev/.context/11-ROUTE-TAGS.md) for the full specification.

The 11 tag categories:

| Category | Tags | Notes |
|---|---|---|
| HTTP Method | `get`, `post`, `put`, `patch`, `delete` | One per route |
| Operation Type | `find`, `count`, `create`, `update`, `update-all`, `replace`, `delete` | What the operation does |
| Access Pattern | `read-only`, `write`, `destructive`, `manage` | GET → `read-only`; DELETE → `destructive`; write ops also get `manage` |
| Data Scope | `collection`, `by-id`, `single-record`, `bulk` | How many records are targeted |
| Record Type | `entities`, `lists`, `relations`, `entityReactions`, `listReactions` | Which structural type is operated on |
| Controller | `entitiesKindAlias`, `reactionsThroughEntity`, etc. | Internal controller identifier |
| Context | `generic`, `kind-alias` | **Most relevant to the GUI:** whether the route uses a domain alias or not |
| Topology | `through` | Traversal routes accessing a resource through a parent path segment |
| Hierarchy | `hierarchical`, `children`, `parents`, `domain-driven` | Parent-child relationship routes |
| Domain-Specific | `reaction` | Applied to reaction controllers and traversal reaction routes (not kind-alias reaction root routes) |
| Utility | `utility`, `health-check`, `api-discovery` | Non-business routes (`ping`, `explorer`) |

The `context` tag (`generic` vs `kind-alias`) is the most operationally significant for the GUI: it determines which route surface the GUI is connecting to, and toggling `generic` off is the standard way to expose a domain-native API.

> **How the GUI determines record type from the OAS**: The GUI reads the `x-base-record-type` extension value from each tag definition (`spec.tags[*]['x-base-record-type']`) to determine which structural type (entity, list, relation, etc.) a resource belongs to. This works regardless of how the gateway has named the paths. If the extension is missing, `oasParser.js` falls back to scanning the collection path string for the standard segment names (`entities`, `lists`, `relations`, `entity-reactions`, `list-reactions`). This fallback fails silently when the gateway has renamed those segments — in that case the resource will still appear in the sidebar but without correct group ordering. Deployments that rename resource type path segments should always set the `x-base-record-type` tag extension in the gateway configuration.

---

## Query Parameters and Fieldsets

### Query Parameters

The gateway **query simplification** feature adds shorter, top-level aliases (`s`, `limit`, `skip`, `fieldset`, `q`, `fields`) for parameters that the backend already accepts in LoopBack `filter[*]` notation. These simplified params are declared in the OAS spec per endpoint, and the GUI detects them at parse time. `filter`, `set`, and `where` are always part of the backend contract.

The GUI resolves which parameter to use per endpoint at runtime:

| Feature | Simplified (gateway-added) | Base fallback (always on backend) | Shown when |
|---|---|---|---|
| Search | `?s=value` | `filter[where][_name][regexp]=.*value.*` | `s` OR `filter` (deepObject with `where` property) is declared |
| Pagination | `?limit=N&skip=M` | `filter[limit]=N&filter[skip]=M` | `limit`/`skip` OR `filter` (deepObject with `limit` property) is declared |
| Sorting | _(no simplified form)_ | `filter[order]=field dir` | `filter` (deepObject with `order` property) is declared |
| Field projection | `?fields=f1,f2` | `filter[fields][f1]=true...` | `fields` OR `filter` (deepObject with `fields` property) is declared |
| Named query | `?q=name` with enum | _(no base fallback)_ | `q` with an `enum` schema is declared |
| Fieldset | `?fieldset=name` | _(no base fallback)_ | `fieldset` with an `enum` schema is declared |
| Status filter (actives/pendings/expireds) | `set[actives]=true` etc. | _(set is already backend-native)_ | `set` (deepObject) is declared |
| Visibility filter (publics/protecteds/privates) | `set[publics]=true` etc. | _(set is already backend-native)_ | `set` (deepObject) is declared |

If neither the simplified param nor its base fallback is declared in the spec for an endpoint, the corresponding UI control is not rendered and the parameter is never sent.

When the simplified form is declared the GUI uses it; when only the base form is available, the GUI constructs the equivalent `filter[*]` notation automatically.

### Fieldsets

The fieldset dropdown is rendered **only** when the spec declares a `fieldset` query parameter with an `enum` schema for that specific endpoint. If the parameter is absent, or is present but has no `enum`, no fieldset control is shown and no `fieldset` value is ever sent.

When the control is rendered, the dropdown is populated with exactly the enum values the spec declares — the GUI adds nothing to them. The set of available options therefore varies per endpoint and per gateway configuration; they are never hardcoded in the UI.

The gateway commonly includes the following values in its `fieldset` enum:

| Name | Effect |
|---|---|
| `show-all` | Returns all fields, bypasses any default fieldset |
| `show-managed-all` | Returns only managed fields |
| `hide-managed-all` | Strips all managed fields; returns only application-defined fields |
| `hide-managed-except-id` | Strips managed fields except `_id` |
| `hide-managed-except-id-kind-name` | Strips managed fields except `_id`, `_kind`, `_name` |

These are informational references about gateway defaults; the actual values offered in any given deployment are whatever the gateway includes in the spec's `enum`.

---

## GUI Components and Features

### Pages (src/components/dynamic/)

| Component | Route | Purpose |
|---|---|---|
| `ResourcePage` | `/r/:tagSlug` | Paginated data grid for a collection. Status/visibility set filter controls, `_name` search, fieldset selector, query info panel, cURL export, inline create and delete. |
| `ItemPage` | `/r/:tagSlug/item/:itemId` | Single-item detail view. Inline field editing via PATCH. Delete with confirmation dialog. |
| `TraversalPage` | `/r/:tagSlug/:subResource` | Sub-resource view. Resolves traversal path templates from the spec (e.g., `/books/{id}/chapters`, `/books/{id}/reactions/reviews`). |

### Layout

The `Sidebar` groups nav entries by `x-base-record-type` (entity, list, relation, entity-reaction, list-reaction) as read from the OAS spec. Each tag in the spec produces one nav entry and one route.

---

## Setup and Configuration

The `SetupScreen` is shown when no spec is loaded. Users provide:
- An API endpoint URL (the gateway address, or the nginx address in production)
- An optional Bearer token

Alternatively, a local OAS JSON file can be drag-and-dropped to use the UI in offline/spec-only mode.

Configuration is persisted to `localStorage` under the key `tarcinapp_config`. Environment variables `TAPP_API_ENDPOINT` and `TAPP_API_TOKEN` override stored config.

---

## Project Structure

```
src/
  App.jsx                     # Root component, router setup
  context/AppContext.jsx      # Global state: spec, endpoint, token, bypass-cache
  utils/oasParser.js          # Parses OAS spec -> navItems, column defs, pagination keys
  services/apiClient.js       # Generic fetch-based HTTP client (GET/POST/PATCH/DELETE)
  hooks/useResourceList.js    # Data-fetching hook with loading/error/refresh state
  components/
    dynamic/                  # OAS-driven pages (ResourcePage, ItemPage, TraversalPage)
    layout/                   # App shell (AppLayout, Sidebar, TopBar)
    setup/                    # Initial connection/setup screen
    ui/                       # Shared components (DataGrid, Badges, Toast, ConfirmDialog)
  pages/
    DashboardPage.jsx         # Overview with resource stat cards
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Routing | React Router v6 |
| Styling | Tailwind CSS v3 |
| Build | Vite 5 |
| Charts | Recharts |
| HTTP | Native `fetch` API |

---

## Development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # Production build
npm run preview    # Preview production build
```

In local development, the GUI connects directly to `entity-persistence-gateway` at `http://localhost:8081`. Use the VS Code task **"Start Dependencies"** to launch the gateway (Spring Boot, `booksapp` profile) and its Docker dependencies (MongoDB, Redis).

---

## System Architecture Reference

Tarcinapp is a layered microservices framework. This GUI sits at the top.

```
Browser (this GUI)
  └── tarcinapp-ingress-proxy  (Nginx: TLS termination, routing)
        └── tarcinapp-idm-service  (Keycloak: AuthN, token issuance)
        └── entity-persistence-gateway  (Spring Cloud Gateway + WebFlux)
              ↔ OPA  (entity-persistence-gateway-policies)
              ↔ Redis  (distributed locks, rate limiting, caching)
              └── entity-persistence-orchestrator  (optional: custom business logic)
                    └── entity-persistence-service  (Node.js, generic REST backend)
                          └── MongoDB
        └── entity-search-gateway  (search traffic -> Meilisearch)
```

In local development, the GUI connects directly to the gateway at `http://localhost:8081`, bypassing nginx and Keycloak. Whether an orchestration layer is active behind the gateway is a backend concern; the GUI cannot observe it and behaves identically regardless.

For gateway documentation, see [github.com/tarcinapp/entity-persistence-gateway](https://github.com/tarcinapp/entity-persistence-gateway).

# Contract: Auditoría — registro enriquecido y consulta con filtros

**Feature**: `006-authz-roles-auditoria`. Extiende
`src/server/persistence/audit.ts`, la tabla `audit_log` y
`GET /api/admin/audit`. Ver `research.md` D8/D9 y `data-model.md` §5/§6/§7.

---

## 1. Registro (append-only, transaccional)

`createAuditEntry` acepta y persiste los campos nuevos:

```ts
createAuditEntry({
  entity: 'partner_theme',
  entityId: themeId,
  action: 'publish',                 // vocabulario PRD 06 (alias de 'save_version'→'update')
  actorSub: session.subject,
  actorName: session.name,           // NUEVO (FR-008, US3 esc.4)
  themeVersion: publishedVersion,    // NUEVO (FR-012, US3 esc.1)
  diff: JSON.stringify(auditDiff),   // Record<field,{from,to}> (FR-008, US3 esc.1)
});
```

Invariantes (ya provistas por el adaptador `PartnerRepository`, no se relajan):
- **Misma transacción** que la mutación (FR-010, US3 esc.3): mutación revertida ⇒
  no queda entrada (SC-005: exactamente **una** entrada por mutación efectiva).
- **Append-only**: sin `UPDATE`/`DELETE` (FR-009, SC-006). Verificación: no hay
  método ni ruta que los ejecute; test intenta y confirma imposibilidad.

## 2. Diff por acción

| action | entity | diff | themeVersion |
|--------|--------|------|:--:|
| `create` | `partner` | campos iniciales `{ from: null, to: value }` | — |
| `update` | `partner_theme` | tokens/assets/legal/typography cambiados | versión guardada |
| `publish` | `partner_theme` | `{ status: { from:'draft', to:'published' } }` | versión publicada |
| `deactivate`/`activate` | `partner` | `{ status: { from, to } }` | — |

## 3. Consulta — `GET /api/admin/audit`

Roles: `auditor` \| `platform-admin` (403 en otro caso — US4 esc.3, FR-011).

Query params (todos opcionales, combinan con AND):

| Param | Tipo | Filtro |
|-------|------|--------|
| `partnerId` / `entityId` | string | por partner (US4 esc.1) |
| `actor` / `actorSub` | string | por actor (US4 esc.2) |
| `from` | ISO-8601 | `at >= from` |
| `to` | ISO-8601 | `at <= to` |
| `limit`, `offset` | number | paginación |

Respuesta `200`: `AuditEntry[]` ordenado por `at` DESC. Ejemplo:

```json
[
  {
    "id": "a1", "entity": "partner_theme", "entityId": "t9",
    "action": "publish", "actorSub": "u-123", "actorName": "Ana Pérez",
    "themeVersion": 4, "at": "2026-07-05T14:03:00.000Z",
    "diff": "{\"status\":{\"from\":\"draft\",\"to\":\"published\"}}"
  }
]
```

`listAuditLog(query: AuditQuery)` del `PartnerRepository` aplica los filtros en
SQL (índices `idx_audit_entity`, `idx_audit_actor`, `idx_audit_at`).

## 4. Reconstrucción "marca vigente en fecha X" (SC-008, US4 esc.4)

Consulta derivada (sin entidad nueva): última entrada `publish` del partner con
`at <= X`; su `themeVersion` = `partner_themes.version` vigente en esa fecha. El
front/consumidor puede resolverlo con un filtro `entityId + to=X + action=publish`
tomando el primer resultado (más reciente).

## 5. Invariantes verificables (tests)

- Cada mutación ⇒ exactamente 1 entrada con actor/acción/fecha/diff/version
  correctos (SC-005).
- Intento de modificar/borrar una entrada ⇒ imposible (SC-006).
- Filtros por partner+actor+rango devuelven exactamente el subconjunto (SC-007).
- Para una fecha, la versión vigente se determina unívocamente (SC-008).
</content>

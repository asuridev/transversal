# PRD 07 — Requisitos No Funcionales y Observabilidad

> **Depende de:** transversal a [01](./01-resolucion-de-tenant-y-routing.md)–[06](./06-authz-roles-y-auditoria.md).
> **Habilita:** criterios de "listo para producción" del [08 Roadmap](./08-roadmap-y-plan-de-entrega.md).

---

## 1. Objetivo

Consolidar los **requisitos no funcionales** (seguridad, escalabilidad,
performance, mantenibilidad) y la **observabilidad** (logging, trazabilidad,
métricas) de toda la plataforma, con criterios medibles y una estrategia de
**testing** alineada con la stack del proyecto.

---

## 2. Seguridad

- **RNF-Sec-1** Ningún token, API key, secreto o ID sensible en el **bundle**
  del cliente ni en el **network tab** (PRD 04). Verificable por inspección.
- **RNF-Sec-2** Secretos solo en secret manager; rotables sin redeploy (PRD 04
  §5).
- **RNF-Sec-3** Sesión admin por cookie httpOnly + SameSite; token del IdP
  nunca en JS (PRD 06).
- **RNF-Sec-4** **CSP** estricta, headers de seguridad (`X-Content-Type-Options`,
  `Referrer-Policy`, HSTS), sanitización de SVG subidos.
- **RNF-Sec-5** Rate limiting en endpoints públicos (anti-enumeración de slugs,
  PRD 01/04).
- **RNF-Sec-6** Respuestas de fallback uniformes (no revelar existencia/estado
  de un partner, PRD 01 §5).

---

## 3. Escalabilidad

- **RNF-Esc-1** Agregar un banco nuevo = **100% configuración, cero código,
  cero deploy** (decisión 5, PRD 00). Métrica: time-to-onboard < 1 día.
- **RNF-Esc-2** BFF **stateless** (sesión en cookie/almacén externo). **V1: una
  sola instancia** sirve lecturas y escrituras desde su **SQLite local** (vía el
  puerto de repositorio; escrituras raras, solo-admin). El **escalado horizontal
  pleno** se habilita **migrando a Postgres** (BD central) cambiando el adaptador
  del puerto (PRD 02 §5).
- **RNF-Esc-3** Theme y assets cacheados/servidos por CDN → carga de Mashery
  desacoplada del tráfico de experiencia (PRD 03 §6, PRD 04 §7).
- **RNF-Esc-4** El modelo de datos soporta cientos de partners sin rediseño
  (PRD 02).
- **RNF-Esc-5** La instancia (V1) se aprovisiona/reinicia **restaurando SQLite
  desde el bucket** (Litestream **single-node** `restore`) antes de servir
  tráfico — sin dependencia de una DB central (PRD 02 §5).
- **RNF-Esc-6** El escalado a multi-instancia se realiza **migrando a una BD
  cliente-servidor** (Postgres de referencia) intercambiando el adaptador del
  puerto `PartnerRepository`, sin cambios en dominio ni handlers (PRD 02 §5).
- **RNF-Dur-1** La config de partners tiene **respaldo continuo en el bucket**
  (Litestream **single-node**, WAL) con **RPO objetivo ~segundos**; se ejecuta
  una **prueba de restauración periódica** para verificar la integridad del
  backup (PRD 02 §5).

---

## 4. Performance

- **RNF-Perf-1** **FOUC = 0** (theme resuelto en SSR + `TransferState`,
  PRD 03 §5). Criterio duro.
- **RNF-Perf-2** Presupuestos web core: LCP < 2.5s, CLS < 0.1, TBT bajo en
  primera carga temática (assets optimizados, fuente con `preload`+`swap`).
- **RNF-Perf-3** Navegación SPA entre pasos del journey **sin** re-fetch de
  theme (caché, PRD 01 §9 / PRD 03 §6).
- **RNF-Perf-4** `NgOptimizedImage` para imágenes estáticas (CLAUDE.md); logos
  vía CDN.

---

## 5. Mantenibilidad

- **RNF-Man-1** TypeScript estricto; sin `any` (CLAUDE.md).
- **RNF-Man-2** Diseño modular feature-first (`ARCHITECTURE.md` §1); contratos
  tipados compartidos como fuente única (PRD 02).
- **RNF-Man-3** Cumplimiento de la **Constitución** verificado en revisión (sin
  axios, TanStack Query para servidor, NgRx solo síncrono, standalone+OnPush,
  Tailwind único, zoneless).
- **RNF-Man-4** Sin lógica de marca hardcodeada: todo vía tokens/variables
  (PRD 03).
- **RNF-Man-5** El acceso a datos está detrás de un **puerto de repositorio**
  (`PartnerRepository`); los adaptadores de persistencia son **intercambiables
  por configuración** (`PERSISTENCE_DRIVER`), lo que soporta la migración
  SQLite→Postgres con cambio mínimo (PRD 02 §5).

---

## 6. Observabilidad

### Logging del BFF

- **RNF-Obs-1** Logging **estructurado** (JSON) de errores del BFF, con nivel,
  mensaje, stack acotado y contexto.
- **RNF-Obs-2** **Correlación por `partnerSlug`** en cada log/traza de una
  llamada a servicios externos, para depurar por banco (PRD 04 §3).
- **RNF-Obs-3** Nunca loguear secretos, tokens ni PII sensible; redacción
  automática de campos sensibles.

### Trazabilidad de llamadas a externos

- **RNF-Obs-4** Cada llamada del BFF a Mashery lleva un `correlationId` (y
  `partnerSlug`) propagado, para reconstruir el árbol de una operación del
  journey.
- **RNF-Obs-5** Métricas por partner: latencia, tasa de error, throughput de
  las integraciones (dashboards).
- **RNF-Obs-7** Salud de la persistencia: **última subida al bucket** de
  Litestream single-node (antigüedad del respaldo) en los dashboards, con
  **alertas si el respaldo se atrasa** (PRD 02 §5).

### Auditoría (negocio)

- **RNF-Obs-6** La auditoría de cambios de partner (PRD 06 §5) es una faceta de
  observabilidad de negocio: inmutable, consultable, ligada al versionado.

```
Request journey ─(correlationId, partnerSlug)─► BFF ─► Mashery
      │                                          │
      └────────── logs/trazas correlacionados ───┘  ──► dashboards por partner
```

---

## 7. Testing (alineado con ARCHITECTURE.md §9)

Framework del proyecto: **Karma + Jasmine**, `*.spec.ts` colocado. Playwright
CLI (`TOOLS.md`) es verificación visual del agente, **no** framework de pruebas.

| Área | Qué se testea | Prioridad |
|------|---------------|-----------|
| **Resolución de tenant** (PRD 01) | slug válido/reservado/root/desconocido/inactivo, charset, longitud | Alta (PRD 00 exige tests aquí) |
| **BFF** (PRD 04) | proyección pública sin secretos, resolución de secretos (mock), normalización de errores | Alta (PRD 00 exige tests aquí) |
| Theming (PRD 03) | tokens→CSS vars, apply/reset del `ThemeStore`, fallback | Media |
| Back Office (PRD 05) | validación de slug/reservados, contraste, mutaciones→auditoría | Media |
| AuthZ (PRD 06) | guards, 401/403, mapeo claim→rol | Alta |

- **Anti-FOUC** se valida visualmente con Playwright CLI (comparar primer paint
  SSR vs. hidratación) — es verificación exploratoria, no una suite.

---

## 8. Criterios de aceptación (verificables)

- [ ] Inspección de bundle + network: **0** secretos expuestos.
- [ ] Onboarding de un partner de prueba sin tocar código ni redeploy.
- [ ] Lighthouse/medición: FOUC 0, LCP < 2.5s en primera carga temática.
- [ ] Logs del BFF correlacionados por `partnerSlug`; sin secretos/PII.
- [ ] Cobertura ≥ 90% de la lógica crítica en resolver de tenant y BFF.
- [ ] Dashboards muestran latencia/errores por partner.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Logs con secretos por error | Redacción automática + revisión de convención de logging. |
| Presupuesto de performance erosionado con el tiempo | Presupuestos en CI (bundle size, Lighthouse). |
| Deriva de la Constitución en features nuevos | Checklist de revisión + linters donde sea posible. |
| Observabilidad insuficiente para incidentes por banco | Correlación por `partnerSlug` obligatoria desde el día 1. |

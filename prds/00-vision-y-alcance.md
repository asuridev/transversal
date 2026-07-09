# PRD 00 — Visión y Alcance

> **Estado:** Base de la suite. **Depende de:** — (documento raíz).
> **Habilita:** todos los PRDs de plataforma (01–08) y la serie de páginas del
> journey (`09+`, una página = un PRD).

---

## 1. Objetivo

Definir la visión de producto, el modelo de dominio, las personas, el alcance
y los hitos de una **plataforma web multi-tenant** que sirve la **experiencia
modular de venta de un seguro de vida**, re-brandeada por **banco distribuidor
(partner)** desde una única base de código, sin deploy por socio, con un
**Back Office** de administración y un **BFF** que aísla los secretos del
navegador.

Este documento fija las **6 decisiones transversales** que el resto de PRDs
respeta sin reinterpretar.

---

## 2. Contexto y problema

BNP (y sus aseguradoras asociadas, p. ej. Seguros Alfa) distribuye un seguro
de vida modular a través de **múltiples bancos** del ecosistema (p. ej. Banco
Popular y otros de Grupo Aval). Hoy, ofrecer la misma experiencia con la marca
de cada banco implicaría duplicar código o hacer un deploy por socio — costoso,
lento y propenso a divergencias.

**Necesidad:** una sola aplicación que, según la URL, resuelva qué banco
(partner) corresponde y pinte la experiencia con su marca (logo, colores,
tipografía, footer co-branded, textos legales), manteniendo **idéntico el
journey de venta** para todos. Sumado a un panel interno para dar de alta y
configurar partners, y una capa server (BFF) que nunca exponga credenciales al
browser.

### Qué son los diseños de referencia (Figma)

Los dos archivos Figma **no** son el panel de administración: son **dos
referencias visuales del mismo journey de venta**, que es lo que se re-brandea.

> **Premisa de operación (innegociable):** la compra del seguro la realiza
> **siempre un asesor del banco**, nunca el cliente final. El asesor contacta
> al cliente **por teléfono**, le solicita los datos y ejecuta la compra en el
> sistema. **El cliente final NUNCA interactúa con el sistema.** No existe un
> canal de autogestión/self-service: el único canal es el **asistido por
> asesor**.

Por tanto, ambos archivos Figma representan **el mismo journey operado por un
asesor**; se conservan como referencia visual, pero no implican un canal de
cliente autónomo:

- **`-BP-`:** una superficie de la experiencia operada por el asesor.
- **`-BO-`:** el mismo journey operado por el asesor.

Journey (idéntico para todos los partners; **siempre operado por el asesor**):

```
Web login → Doble login → Home → Conoce a tu cliente (KYC) → Datos del cliente
→ Declaración de salud → Ofrecimiento del seguro → Agendamiento cita médica
→ Selección de beneficiarios → Resumen → Confirmación → OTP y TyC
→ Medio de pago + Activación → Activar beneficios digitales
→ Comunicaciones postventa → (Desistir de la venta)
```

El **panel de administración de partners no existe en diseño** y se especifica
desde cero en el [PRD 05](./05-back-office-gestion-de-partners.md).

---

## 3. Modelo de dominio

```
                 ┌─────────────────────────────────────────┐
                 │              Plataforma                  │
                 │  (una base de código, un deploy)         │
                 └───────────────┬─────────────────────────┘
                                 │ resuelve por URL
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                       ▼
   app.com/popular/…     app.com/otrobanco/…      app.com/admin
   Partner: Banco        Partner: Otro Banco       Back Office
   Popular (theme A)     (theme B)                 (gestión partners)
          │                      │
          └──────── mismo journey de venta ────────┘
                (Seguro de vida modular — Seguros Alfa)
```

| Concepto | Definición |
|----------|------------|
| **Partner / Tenant** | Banco distribuidor que ofrece el seguro bajo su marca (p. ej. Banco Popular). Se identifica por un `partnerSlug` en la URL. |
| **Aseguradora / Producto** | El seguro de vida modular (p. ej. Seguros Alfa). Es el mismo para todos los partners; **no** es el tenant. |
| **Theme / Branding** | Conjunto de tokens visuales + assets + textos legales de un partner: colores, logo, favicon, tipografía, **footer co-branded** (banco + Grupo Aval), disclaimers. |
| **Canal** | Único canal: **asistido por asesor**. El journey siempre lo opera un asesor del banco; no existe canal de autogestión del cliente final. |
| **Cliente final / asegurado** | Persona que contrata el seguro. Aporta sus datos **por teléfono** al asesor y **nunca accede al sistema**; no es usuario de la plataforma. |
| **Back Office** | Panel interno para dar de alta/editar/desactivar partners y su branding. |
| **BFF** | Capa server (Angular SSR) que media entre el front y los servicios externos, guardando los secretos. |

---

## 4. Personas

| Persona | Rol | Necesidad principal |
|---------|-----|---------------------|
| **Administrador de plataforma** | Usuario interno BNP | Dar de alta partners y configurar su marca sin pedir un deploy. |
| **Asesor del banco** | **Único operador del journey de venta** | Vender el seguro al cliente (contactado por teléfono) con la marca de su banco, operando de punta a punta el flujo en el sistema. |
| **Cliente final / asegurado** | Contratante del seguro — **NO es usuario del sistema** | Recibir la venta por teléfono a través de un asesor; nunca interactúa con la plataforma. Se lista solo como sujeto del negocio, no como usuario. |
| **Auditor / Compliance** | Interno BNP | Saber quién cambió qué configuración de un partner y cuándo. |
| **Ingeniería / SRE** | Interno BNP | Operar, observar y escalar la plataforma con seguridad de secretos. |

---

## 5. Las 6 decisiones transversales (north star)

Fijadas. No se reinterpretan por PRD; cambiarlas obliga a actualizar este
documento y propagar.

1. **Resolución de tenant = path prefix** (`app.com/{partnerSlug}/...`).
   Alternativa (subdominio) documentada en el [PRD 01](./01-resolucion-de-tenant-y-routing.md).
2. **BFF = Angular SSR (Node) en el mismo repo.** Un repo, un deploy; theme
   inyectado en SSR para evitar FOUC. → [PRD 04](./04-arquitectura-bff.md).
3. **Auth del Back Office = SSO corporativo (OIDC/SAML)**; el BFF valida
   tokens, roles vía claim del IdP. → [PRD 06](./06-authz-roles-y-auditoria.md).
4. **Persistencia dentro del alcance, tras un puerto de repositorio**: modelo de
   datos accedido vía el puerto `PartnerRepository`. **V1 = SQLite embebida de
   instancia única con respaldo continuo a bucket (Litestream single-node,
   restore al arranque)**; object storage/CDN para assets. El **escalado a
   multi-instancia se resuelve migrando a una BD cliente-servidor (Postgres de
   referencia) cambiando el adaptador del puerto**, sin tocar dominio ni
   handlers. → [PRD 02](./02-modelo-de-partner-y-contrato-de-theme.md).
5. **Multi-tenancy = SOLO branding visual.** El journey y los módulos del
   producto son **iguales para todos**; por partner cambian únicamente logo,
   colores, favicon, tipografía, footer co-branded y textos/disclaimers
   legales. El journey se **especifica página a página** en la serie `09+` (una
   página = un PRD, con sus validaciones propias); esas páginas son las mismas
   para todos los partners y solo se re-brandean. →
   [PRD 02](./02-modelo-de-partner-y-contrato-de-theme.md),
   [serie de páginas del journey](./README.md).
6. **El panel admin NO existe en diseño** — se especifica desde cero.
   → [PRD 05](./05-back-office-gestion-de-partners.md).

---

## 6. Alcance

### In-scope

- Resolución de partner por segmento de URL (path prefix) + fallback a theme
  default.
- Theming dinámico (colores, logo, favicon, tipografía, footer co-branded,
  textos legales) con caché y sin FOUC.
- Back Office: CRUD de partners (alta/edición/**desactivación** lógica),
  editor visual de marca, preview en vivo, listado con buscador.
- Roles y auditoría del Back Office (SSO OIDC/SAML).
- BFF: orquestación a servicios externos por partner, gestión segura de
  secretos, observabilidad.
- Persistencia: modelo de datos tras un **puerto de repositorio**; V1 con
  **SQLite + respaldo en bucket (Litestream single-node)** para config de
  partners y object storage/CDN para assets; el puerto habilita **migrar a
  Postgres** al escalar a varias instancias.
- **Especificación e implementación por página del journey de venta** (serie de
  PRDs `09+`, **una página = un PRD**), partiendo del Figma existente, con sus
  **validaciones individuales** por página. El journey sigue siendo el mismo para
  todos los partners (solo se re-brandea).

### Out-of-scope (por ahora)

- Cambiar el **journey de venta** o la **composición de módulos** por partner
  (decisión 5: mismo flujo para todos).
- **Rediseñar** las pantallas del journey: se respetan tal cual el Figma. La
  serie `09+` **documenta e implementa** cada página a partir de ese diseño, sin
  proponer un rediseño visual.
- Motor de reglas de negocio del seguro (tarifas, coberturas): vive en
  Mashery detrás del BFF.
- Portal de auto-registro para que un banco se dé de alta solo (el alta la
  hace un admin interno).
- **Canal de autogestión / self-service para el cliente final.** La compra la
  ejecuta **siempre un asesor**; el cliente nunca accede al sistema. Un
  eventual portal de cliente sería un producto distinto, fuera de esta suite.
- Multi-idioma más allá de textos configurables por partner (i18n completo es
  fase futura).

---

## 7. Requisitos no funcionales (resumen; detalle en PRD 07)

- **Seguridad:** ningún token/secret/ID sensible en el bundle ni en el network
  tab del browser.
- **Escalabilidad:** agregar un banco nuevo = 100% configuración, cero código
  ni deploy.
- **Performance:** carga de theme sin flash de estilos sin marca (FOUC).
- **Mantenibilidad:** diseño modular, TypeScript estricto, tests en la lógica
  de resolución de tenant y en el BFF.
- **Observabilidad:** logging de errores del BFF, trazabilidad de llamadas a
  externos por partner.

---

## 8. Métricas de éxito

| Métrica | Objetivo |
|---------|----------|
| Time-to-onboard de un partner nuevo | < 1 día, sin deploy |
| FOUC en primera carga temática | 0 (theme resuelto en SSR) |
| Secretos expuestos al cliente | 0 (verificado en bundle + network) |
| Cobertura de tests en resolución de tenant y BFF | ≥ 90% de la lógica crítica |
| Trazabilidad de cambios de partner | 100% de cambios auditados (quién/qué/cuándo) |

---

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Colisión entre `partnerSlug` y rutas reservadas (`/admin`, `/api`) | Ruteo incorrecto | Lista de slugs reservados; validación en alta (PRD 01/05). |
| FOUC si el theme se resuelve solo en cliente | UX de marca pobre | Inyección del theme en SSR (PRD 03). |
| Fuga de credenciales de un banco al browser | Incidente de seguridad | BFF con secret manager; nada sensible cruza al front (PRD 04). |
| Cambios de marca sin trazabilidad | Riesgo de compliance | Versionado + auditoría (PRD 02/06). |
| Assets pesados (logos) degradan performance | LCP alto | Object storage + CDN + optimización (PRD 02/03/07). |
| Pérdida de datos al reiniciar/caer la instancia (V1) | Config de partners perdida | Litestream single-node: respaldo continuo al bucket + `restore` al arranque; RPO ~segundos (PRD 02 §5). |
| Necesidad de escalar más allá de una instancia | Bloqueo de crecimiento | Puerto de repositorio: migración a Postgres con cambio mínimo (swap de adaptador, PRD 02 §5). |

---

## 10. Encadenamiento de PRDs

Este PRD **habilita**:
[01](./01-resolucion-de-tenant-y-routing.md) →
[02](./02-modelo-de-partner-y-contrato-de-theme.md) →
[03](./03-theming-dinamico-y-anti-fouc.md) →
[04](./04-arquitectura-bff.md) →
[05](./05-back-office-gestion-de-partners.md) →
[06](./06-authz-roles-y-auditoria.md) →
[07](./07-requisitos-no-funcionales-y-observabilidad.md) →
[08](./08-roadmap-y-plan-de-entrega.md).

Y la **serie de páginas del journey** (`09+`, una página = un PRD), que arranca
con [09 — Conoce a tu cliente (KYC)](./09-page-conoce-a-tu-cliente.md). El mapa
completo página→PRD está en el [README](./README.md).

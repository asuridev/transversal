# PRD 09 — Página: Conoce a tu cliente (KYC)

> **Depende de:** [00 Visión y alcance](./00-vision-y-alcance.md),
> [01 Resolución de tenant y routing](./01-resolucion-de-tenant-y-routing.md),
> [03 Theming dinámico y anti-FOUC](./03-theming-dinamico-y-anti-fouc.md),
> [04 Arquitectura BFF](./04-arquitectura-bff.md).
> **Habilita:** 10 Página: Datos del cliente (`10-page-datos-cliente.md`, siguiente paso del journey).

Primer PRD de la **serie de páginas del journey** (`09+`). Regla de la serie:
**una página = un PRD**, con sus validaciones especificadas de forma individual.
El mapa completo página→PRD vive en el [README](./README.md).

---

## 1. Objetivo

Especificar la página **"Conoce a tu cliente"**: el paso **KYC** con el que el
asesor **identifica al cliente** (tipo y número de documento + fecha de
expedición), **captura los dos consentimientos legales** obligatorios y
**consulta** la información asociada a través del BFF para poder continuar el
journey de venta.

> **Premisa (PRD 00 §2):** la página la opera **siempre un asesor del banco**; el
> cliente final aporta sus datos **por teléfono** y **nunca interactúa con el
> sistema**. No hay canal de autogestión.

Esta página es **journey**, por lo tanto es **idéntica para todos los partners** y
solo cambia su **branding** (decisión 5 del PRD 00): logo, colores, tipografía,
footer co-branded y textos legales.

---

## 2. Referencia visual (Figma)

- **fileKey:** `8igWn4MXoho4WHWtmT1LWt`
- **Sección:** `12286:175228` — "Conoce a tu cliente"

La sección **no** son varias páginas: es **una sola página** dibujada en todos
sus estados de interacción y validación. Variantes responsive en Mobile
(`M - Ofrecimiento / Mobile`), Tablet (`T - Ofrecimiento / Tablet`) y Desktop
(`D - Conoce a tu cliente`).

| # | Estado | Node (Desktop) |
|---|--------|----------------|
| 5.1 | Base vacío — `Consultar` deshabilitado | `12286:175464` |
| 5.2 | Dropdown tipo de documento abierto (CC / Pasaporte / CE) | `12286:175456` |
| 5.3 | Calendario "Fecha de expedición" abierto | `12286:175252`, `12286:175263` |
| 5.4 | Modal "Política de Tratamiento de Datos Personales" | `12286:175349`, `12286:175361` |
| 5.5 | Toast/alert: confirmación de TyC requerida | `12286:175301` |
| 5.6 | Error inline: número de identificación inválido | `12286:175540` |
| 5.7 | Error inline: fecha de expedición inválida | `12286:175577` |
| 5.8 | Modal: sin resultados de la consulta | `12286:175587` |
| 5.9 | Completo y válido — `Consultar` habilitado | `12286:175339` |

> Al implementar, extraer cada estado con `mcp__figma__get_screenshot` /
> `get_design_context` sobre el node correspondiente. Los copys de esta tabla y
> de la §5 se transcriben **literalmente** del diseño.

---

## 3. Anatomía de la página

```
┌───────────────────────────────────────────────────────────┐
│  [logo partner]                                            │  ← Header
├───────────────────────────────────────────────────────────┤
│  ‹ Volver                                                  │
│                                                            │
│  ┌─────────────────────┐   ┌───────────────────────────┐  │
│  │                     │   │ Tipo de documento     [▾] │  │
│  │  ilustración        │   │ Número de documento       │  │
│  │  "Conoce a          │   │ Fecha de expedición   [📅]│  │
│  │   tu cliente"       │   │ ☐ Autorización 1 (política)│ │
│  │                     │   │ ☐ Autorización 2 (banco+   │  │
│  │                     │   │    Seguros Alfa)           │  │
│  │                     │   │            [ Consultar ]   │  │
│  └─────────────────────┘   └───────────────────────────┘  │
├───────────────────────────────────────────────────────────┤
│ Vigilado Superfinanciera · [banco] · Grupo Aval · Seguros  │  ← Footer
│ Alfa                                                       │    co-branded
└───────────────────────────────────────────────────────────┘
```

- **Header:** logo del partner (theming, PRD 03).
- **Navegación:** link `‹ Volver` al paso anterior del journey.
- **Panel izquierdo:** ilustración + título **"Conoce a tu cliente"**.
- **Panel derecho:** formulario reactivo (Reactive Forms) + botón `Consultar`.
- **Footer co-branded:** disclaimer Superintendencia Financiera de Colombia +
  banco + Grupo Aval + Seguros Alfa (PRD 00 §5, decisión 5).
- **Responsive:** en Mobile/Tablet el título y la ilustración se apilan sobre el
  formulario; el footer colapsa a los logos.

---

## 4. Campos y controles

| Control | Tipo | Obligatorio | Detalle |
|---------|------|-------------|---------|
| Tipo de documento | Select | Sí | Opciones: `Cédula de Ciudadanía`, `Pasaporte`, `Cédula de Extranjería`. |
| Número de documento | Input texto/numérico | Sí | Formato validado según tipo de documento (§5.6). |
| Fecha de expedición del documento | Date picker | Sí | No futura; rango plausible (§5.7). |
| Autorización 1 | Checkbox | Sí | Autoriza al asesor a actuar en representación / política de tratamiento de datos. El enlace abre el modal de TyC (§5.4). |
| Autorización 2 | Checkbox | Sí | Autoriza al banco y a Seguros Alfa el tratamiento de datos. |
| Consultar | Botón primario | — | Deshabilitado hasta que el formulario sea válido **y** ambas autorizaciones estén marcadas (§5.1 / §5.9). |

**Estado del formulario:** Reactive Forms + signals; `Consultar` habilitado =
`form.valid && autorizacion1 && autorizacion2` (computed). Sin `NgZone` ni
`zone.js` (zoneless, OnPush).

---

## 5. Estados y validaciones

Cada validación se especifica de forma **individual** y tiene su criterio de
aceptación propio en la §9.

### 5.1 Estado inicial
Al entrar, todos los campos vacíos y ambos checkboxes sin marcar; el botón
`Consultar` está **deshabilitado**. Node: `12286:175464`.

### 5.2 Selección de tipo de documento
El select despliega exactamente tres opciones: **Cédula de Ciudadanía**,
**Pasaporte**, **Cédula de Extranjería**. La selección condiciona la validación
del número (§5.6). Node: `12286:175456`.

### 5.3 Fecha de expedición
El campo abre un **date picker (calendario)**. Regla: la fecha **no puede ser
futura** y debe estar dentro de un rango plausible. Al elegir una fecha, se
puebla el campo con formato `dd/mm/aaaa`. Node: `12286:175252` / `12286:175263`.

### 5.4 Consentimientos y modal de Términos y Condiciones
El enlace dentro de la Autorización 1 abre el modal **"Política de Tratamiento de
Datos Personales"** con el texto legal completo (scrolleable) y botón de cierre
(`X`). Cerrar el modal **no** marca automáticamente el checkbox. Node:
`12286:175349` / `12286:175361`.

### 5.5 Intento de continuar sin aceptar los TyC
Si el asesor intenta avanzar sin marcar las autorizaciones, se muestra un
**toast/alert** con el copy exacto:
> **Necesitamos tu confirmación para avanzar.** Revisa y acepta los Términos y
> Condiciones. Luego marca la casilla para continuar.

Node: `12286:175301`.

### 5.6 Número de documento inválido
Si el número no cumple el formato del tipo de documento seleccionado, se muestra
un **error inline** bajo el campo con el copy exacto:
> El número de identificación no es válido. Verifica nuevamente.

El campo se resalta en estado de error. Node: `12286:175540`.

### 5.7 Fecha de expedición inválida
Si la fecha es futura o fuera de rango, **error inline** bajo el campo con el
copy exacto:
> La fecha de expedición no es válida. Verifica nuevamente.

Node: `12286:175577`.

### 5.8 Consulta sin resultados
Si el BFF no encuentra información para los datos ingresados, se muestra un
**modal** con el copy exacto:
> **No fue posible encontrar información asociada a los datos ingresados.**
> Por favor, valida e intenta nuevamente.

Con botón **Aceptar** que cierra el modal y devuelve el foco al formulario (sin
limpiar los datos). Node: `12286:175587`.

### 5.9 Consulta exitosa
Con formulario válido, ambos consentimientos marcados y respuesta positiva del
BFF, `Consultar` queda habilitado (node `12286:175339`) y al confirmar se
**navega a la siguiente página del journey** (Datos del cliente). Los
consentimientos se registran para auditoría (§10).

---

## 6. Integración BFF

- La consulta se realiza **exclusivamente** a través del proxy de journey del
  BFF: `POST /api/journey/:slug/*` (PRD 04 §4 y §6). El front **no** conoce URLs,
  tokens ni IDs de Mashery.
- **Ningún secreto ni identificador sensible cruza al browser** (PRD 04 §5,
  PRD 00 §7). El BFF orquesta la consulta KYC por partner.
- El BFF **normaliza los errores** del backend a los estados de UI:
  validación de campos (§5.6 / §5.7) y "sin resultados" (§5.8).
- Estado de servidor/consulta gestionado con **TanStack Query**; estado
  síncrono de UI con signals / NgRx SignalStore (restricciones del README).

---

## 7. Theming

- La página consume los **tokens del partner** como CSS custom properties
  (PRD 03); logo, colores, tipografía y footer co-branded se resuelven por
  tenant.
- El theme se inyecta en **SSR** para evitar **FOUC** en la primera carga
  (PRD 03 §5).
- **Sin lógica de negocio por partner** (decisión 5, PRD 00): la validación y el
  flujo son idénticos para todos; solo cambia el branding.

---

## 8. Requisitos funcionales

- **RF-09.1** El formulario expone tipo de documento (CC / Pasaporte / CE),
  número de documento y fecha de expedición, todos obligatorios.
- **RF-09.2** `Consultar` permanece deshabilitado hasta que el formulario sea
  válido y **ambas** autorizaciones estén marcadas.
- **RF-09.3** El enlace de la Autorización 1 abre el modal de "Política de
  Tratamiento de Datos Personales" (scrolleable, cerrable), sin marcar el
  checkbox al cerrarlo.
- **RF-09.4** Intentar avanzar sin aceptar los TyC muestra el toast/alert de
  confirmación (§5.5) y bloquea el avance.
- **RF-09.5** El número de documento se valida según el tipo; si es inválido se
  muestra el error inline (§5.6).
- **RF-09.6** La fecha de expedición no puede ser futura ni fuera de rango; si lo
  es, error inline (§5.7).
- **RF-09.7** La consulta se realiza vía `POST /api/journey/:slug/*`; sin
  secretos ni IDs sensibles en el browser.
- **RF-09.8** Una consulta sin resultados muestra el modal de §5.8 y conserva los
  datos ingresados.
- **RF-09.9** Una consulta exitosa registra los consentimientos para auditoría y
  navega a la siguiente página del journey.
- **RF-09.10** La página se re-brandea por partner (theme en SSR, sin FOUC) sin
  alterar el flujo ni las validaciones.

---

## 9. Criterios de aceptación

- [ ] **§5.1** Al cargar, con campos vacíos, `Consultar` está deshabilitado.
- [ ] **§5.2** El select muestra exactamente CC / Pasaporte / Cédula de
      Extranjería.
- [ ] **§5.3** El date picker abre calendario y rechaza fechas futuras.
- [ ] **§5.4** El enlace abre el modal "Política de Tratamiento de Datos
      Personales"; cerrarlo no marca el checkbox.
- [ ] **§5.5** Intentar avanzar sin marcar los consentimientos muestra el toast
      "Necesitamos tu confirmación para avanzar…" y no avanza.
- [ ] **§5.6** Un número inválido muestra "El número de identificación no es
      válido. Verifica nuevamente." bajo el campo.
- [ ] **§5.7** Una fecha inválida muestra "La fecha de expedición no es válida.
      Verifica nuevamente." bajo el campo.
- [ ] **§5.8** Una consulta sin coincidencias muestra el modal "No fue posible
      encontrar información asociada a los datos ingresados." con botón Aceptar y
      conserva los datos.
- [ ] **§5.9** Con formulario válido + ambos consentimientos + respuesta positiva
      del BFF, `Consultar` se habilita y navega a la siguiente página.
- [ ] La consulta viaja por `POST /api/journey/:slug/*`; el network tab del
      browser no expone secretos ni IDs de Mashery.
- [ ] La página aplica el theme del partner en SSR sin FOUC en la primera carga.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Consentimientos capturados sin trazabilidad | Persistir cada autorización con `quién/qué/cuándo` (asesor, partner, timestamp) vía BFF; auditoría PRD 06/07. |
| PII (número de documento) en logs del front o BFF | Enmascarar/no loguear PII; logging estructurado con redacción (PRD 07 §6). |
| Copys de error divergentes del diseño legal aprobado | Transcribir literalmente del Figma y centralizar textos legales como configurables por partner (PRD 02). |
| Validación de documento demasiado laxa/estricta por tipo | Reglas de formato por tipo de documento revisadas con negocio; el motor definitivo vive en Mashery tras el BFF (PRD 00 §6 out-of-scope). |
| Fuga de secretos del servicio KYC al browser | Consulta solo por proxy BFF; nada sensible cruza la frontera (PRD 04 §5/§7). |
| FOUC al re-brandear en la primera carga | Theme resuelto e inyectado en SSR (PRD 03 §5). |

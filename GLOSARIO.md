# Glosario — Plataforma Modular Multi-Tenant (Seguros / Multi-Banco)

Vocabulario común del proyecto y **aclaración de los términos que suelen causar
confusión**. La definición canónica del dominio vive en
[`prds/00-vision-y-alcance.md`](./prds/00-vision-y-alcance.md) §3; este archivo es
una referencia rápida en la raíz.

---

## Term clave: Partner = Tenant

**Son la misma entidad — el banco distribuidor que vende el seguro bajo su
marca.** Solo cambia el ángulo desde el que se nombra:

| Término | Perspectiva | Énfasis |
|---------|-------------|---------|
| **Partner** | Negocio / dominio | El banco como **socio comercial** que distribuye el seguro (p. ej. Banco Popular, Banco de Occidente). Aparece en el modelo de datos (`Partner`, `PartnerTheme`) y en el Back Office. |
| **Tenant** | Arquitectura / técnica | El mismo banco como **"inquilino"** de la plataforma multi-tenant (una sola base de código atiende a varios bancos). Aparece en resolución de tenant, routing y multi-tenancy. |

El puente entre ambos es el **`partnerSlug`**: el identificador corto en la URL
(`app.com/{partnerSlug}/…`) con el que se **resuelve el tenant** para pintar el
**theme del partner**.

> **Multi-tenancy aquí = SOLO branding visual** (decisión 5 del PRD 00). Entre un
> tenant y otro cambian únicamente logo, colores, favicon, tipografía, footer
> co-branded y textos legales. **El journey de venta y los módulos son idénticos
> para todos.**

---

## Términos que se confunden entre sí

| No confundir… | …con… | Diferencia |
|---------------|-------|------------|
| **Partner / Tenant** | **Aseguradora / Producto** | El partner es el **banco** (el tenant). La aseguradora (p. ej. Seguros Alfa) es el **seguro**, el mismo para todos los bancos. La aseguradora **no** es tenant. |
| **Cliente final / Asegurado** | **Usuario del sistema** | El cliente final es quien **contrata el seguro**, pero **nunca usa el sistema**: aporta sus datos por teléfono. El único **usuario/operador** del journey es el **asesor**. |
| **Asesor** | **Cliente final** | El **asesor del banco** es quien opera todo el journey en el sistema. Único canal: **asistido por asesor** (no hay autogestión del cliente). |
| **Back Office** | **Journey de venta** | El Back Office es el **panel interno** para dar de alta/configurar partners (se diseña desde cero). El journey es la **experiencia de venta** re-brandeada (serie de PRDs `09+`). |
| **Theme / Branding** | **Partner** | El partner es la **entidad** (banco). El theme es su **conjunto de tokens visuales + assets + textos** (lo que se aplica al re-brandear). |
| **BFF** | **Mashery** | El **BFF** (Angular SSR/Node) es la capa que **guarda los secretos** y orquesta. **Mashery** (tarifas, coberturas) vive **detrás** del BFF. |
| **M1** | **M2** | **M1** = hito de **instancia única** (SQLite local + Litestream single-node backup). **M2** = hito de **escalado migrando a Postgres** (cambio de adaptador del puerto). No confundir con las Fases del roadmap. |
| **PRD 00–08** (plataforma) | **PRD 09+** (páginas del journey) | 00–08 = infraestructura/plataforma. `09+` = **una página del journey = un PRD**, con sus validaciones individuales. |

---

## Vocabulario general

| Término | Definición |
|---------|------------|
| **Plataforma** | La aplicación web multi-tenant: **una base de código, un despliegue**, que sirve la experiencia de venta a todos los partners. |
| **`partnerSlug`** | Identificador corto del partner en la URL (`popular`, `occidente`). Con él se resuelve el tenant. |
| **Resolución de tenant** | Proceso que, a partir de la URL (path prefix), determina **qué partner** corresponde y aplica su theme. Definido en PRD 01. |
| **Path prefix** | Estrategia de ruteo elegida: el **primer segmento del path** (`app.com/{partnerSlug}/...`) identifica al tenant. |
| **Theme / Branding** | Tokens visuales + assets + textos legales de un partner: colores, logo, favicon, tipografía, footer co-branded, disclaimers. |
| **Theme default** | Marca neutra de **fallback** cuando el slug es desconocido o el partner está inactivo. |
| **Co-branding** | Marca combinada en pantalla: producto arriba (Seguros Alfa) + footer del distribuidor (banco + Grupo Aval) + disclaimer de la Superintendencia Financiera. |
| **Journey (de venta)** | El flujo de venta operado por el asesor: `login → … → Conoce a tu cliente (KYC) → Datos → Declaración de salud → Ofrecimiento → … → Pago/Activación`. **Idéntico para todos los partners.** |
| **KYC** | "Conoce a tu cliente": paso del journey donde el asesor identifica al cliente (documento + fecha de expedición) y captura consentimientos. Primera página especificada (PRD 09). |
| **Canal asistido por asesor** | Único canal de operación. La compra la ejecuta **siempre un asesor**; no existe self-service para el cliente. |
| **Back Office** | Panel interno para dar de alta/editar/desactivar partners y su branding, con preview en vivo (PRD 05). |
| **BFF (Backend for Frontend)** | Capa server (Angular SSR sobre Node) que media entre el front y los servicios externos, **aislando los secretos del navegador** (PRD 04). |
| **SSR / CSR** | Server-Side Rendering / Client-Side Rendering. El theme se inyecta en **SSR** para evitar FOUC. |
| **FOUC** | *Flash Of Unstyled Content*: parpadeo de estilos sin marca en la primera carga. Objetivo del proyecto: **FOUC = 0**. |
| **Litestream** | Herramienta de respaldo continuo de SQLite a un bucket. En V1 se usa en **single-node** (durabilidad + `restore` al arranque, **sin** primaria/réplica). |
| **Puerto de repositorio / `PartnerRepository`** | Interfaz (puerto hexagonal) por la que el dominio/BFF accede a los datos, sin conocer el motor de BD. Ningún handler ejecuta SQL directo (PRD 02 §5). |
| **Adaptador de persistencia** | Implementación del puerto para un motor concreto (`SqlitePartnerRepository` en V1; `PostgresPartnerRepository` al escalar). Se elige por `PERSISTENCE_DRIVER`. |
| **Arquitectura hexagonal (puertos y adaptadores)** | Patrón que aísla el dominio de la infraestructura tras puertos; aquí permite migrar SQLite→Postgres con cambio mínimo (PRD 02 §5). |
| **Decisiones north-star** | Las **6 decisiones transversales** fijadas en PRD 00 §5, que el resto de PRDs no reinterpreta. |
| **NgRx SignalStore** | Gestión de **estado síncrono** de UI (signals). No se usa para estado de servidor. |
| **TanStack Query** | Único gestor de **estado de servidor / caché** (p. ej. el theme, la consulta KYC). |

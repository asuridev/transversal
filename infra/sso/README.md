# RH-SSO 7.6 (dev) — AuthZ, Roles y Auditoría (006)

Levanta el IdP de desarrollo con la MISMA imagen que producción
(`registry.redhat.io/rh-sso-7/sso76-openshift-rhel8:7.6`, D11), con el realm
`backoffice` importado automáticamente (`realm/backoffice-realm.json`).

## Arrancar

```bash
podman login registry.redhat.io   # requiere suscripción Red Hat
podman-compose -f infra/sso/podman-compose.yml up -d
bash infra/sso/import-realm.sh     # importa backoffice-realm.json vía REST admin API
```

> Nota: la imagen `sso76-openshift-rhel8` no soporta de forma fiable el flag
> `-Dkeycloak.import` como `command:` de `podman-compose` (el entrypoint del
> contenedor no lo acepta como override de argv). El import se hace en un
> segundo paso, idempotente, contra la REST admin API una vez el servidor está
> arriba.

Discovery: `GET http://localhost:8080/auth/realms/backoffice/.well-known/openid-configuration`

## Usuarios de prueba (uno por rol, US2 esc.4 incluido)

| Usuario | Password | Rol de aplicación |
|---|---|---|
| `admin-user` | `admin-user` | `platform-admin` |
| `editor-user` | `editor-user` | `partner-editor` |
| `auditor-user` | `auditor-user` | `auditor` |
| `norole-user` | `norole-user` | *(ninguno — 403 en todo `/admin/*`, menor privilegio)* |

## Usuarios de prueba — asesores (007, aislamiento por partner)

El realm incluye un mapper de atributo `partner` → claim `partner` (protocol
mapper `partner-claim`) y tres usuarios asesor sin rol de aplicación (no operan
el Back Office, solo el journey de venta):

| Usuario | Password | Claim `partner` | Uso |
|---|---|---|---|
| `asesor-a` | `asesor-a` | `banco-a` | Acceso legítimo a `banco-a` (quickstart B1) |
| `asesor-b` | `asesor-b` | `banco-b` | Partner distinto, para probar el cruce A→B (quickstart B2) |
| `asesor-inactivo` | `asesor-inactivo` | `banco-inactivo` | Partner inexistente/inactivo en el catálogo — prueba de deny (quickstart B4) |

> `banco-a` y `banco-b` deben existir **activos** en el catálogo de partners
> (`PartnerRepository`, PRD 02) para que el login del asesor los valide y selle
> la sesión (`PARTNER_CLAIM_PATH`, ver abajo); `banco-inactivo` debe estar
> ausente o `inactive` a propósito.

## Variables de entorno del BFF

Ver `.env.example` en la raíz. **Paridad dev/prod** (D12): los mismos nombres de
variable se usan en ambos entornos; solo cambian los valores:

| Variable | Dev | Prod |
|---|---|---|
| `OIDC_ISSUER_URL` | `http://localhost:8080/auth/realms/backoffice` | issuer real de RH-SSO productivo |
| `OIDC_CLIENT_SECRET` | `backoffice-bff-dev-secret` (solo dev) | resuelto por el gestor de secretos (`secrets/`) |
| `SESSION_SEAL_KEY` | 32 bytes base64 generado localmente | resuelto por el gestor de secretos, rotable |
| `PARTNER_CLAIM_PATH` | `partner` (007, D1) | mismo path en ambos entornos |
| Cookies (`bo_session`/`csrf`) | `Secure` se omite si no hay TLS local | `Secure` siempre activo (`NODE_ENV=production` ⇒ `secureCookies=true` en `server.ts`) |

`SameSite=Strict` se aplica en ambos entornos sin distinción — es la defensa
CSRF de base (D4), independiente de TLS.

## Endurecimiento de cookies en producción (D2/D4, T049)

`src/server.ts` deriva `secureCookies = process.env.NODE_ENV === 'production'`.
En producción, servir el BFF **siempre sobre TLS** para que el atributo
`Secure` de `bo_session`/`csrf` sea efectivo (un `Secure` sin HTTPS real no
protege nada). No se requiere configuración adicional: basta con desplegar
detrás de un balanceador/ingress TLS y fijar `NODE_ENV=production`.

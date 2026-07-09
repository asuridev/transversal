# Contract: Infra de IdP en desarrollo — podman-compose + RH-SSO 7.6

**Feature**: `006-authz-roles-auditoria`. Materializa la petición del usuario:
levantar el servidor de autorización en desarrollo con **podman-compose** usando
**`sso76-openshift-rhel8:7.6`**, la MISMA imagen/versión que producción. Ver
`research.md` D11/D12.

---

## 1. `infra/sso/podman-compose.yml`

```yaml
# Requiere: `podman login registry.redhat.io` (suscripción Red Hat) antes de
# `podman-compose up`. DB H2 embebida (dev/pruebas), no apta para producción.
services:
  rh-sso:
    image: registry.redhat.io/rh-sso-7/sso76-openshift-rhel8:7.6   # == prod
    container_name: rh-sso
    command:
      - "-b"
      - "0.0.0.0"
      - "-Dkeycloak.import=/opt/eap/standalone/import/backoffice-realm.json"
    environment:
      SSO_ADMIN_USERNAME: admin
      SSO_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
      - "8443:8443"
    volumes:
      - ./realm:/opt/eap/standalone/import:ro,z      # :z ⇒ etiqueta SELinux (podman)
      - rh-sso-data:/opt/eap/standalone/data
volumes:
  rh-sso-data:
```

- Se **conserva** `docker-compose.yml` en la raíz como equivalente Docker; este
  archivo es el camino soportado en dev (podman) e incluye el import de realm.
- `:z` en el volumen es la diferencia clave frente a Docker: relabeling SELinux
  que podman aplica en RHEL/Fedora.

## 2. Realm de desarrollo — `infra/sso/realm/backoffice-realm.json`

Contenido mínimo reproducible (importado al arrancar):

- **Realm**: `backoffice`.
- **Cliente confidencial**: `backoffice-bff`
  - `standardFlowEnabled: true` (Authorization Code), `publicClient: false`,
    `secret: <dev-secret>` (solo dev; en prod vive en el secret manager).
  - `redirectUris: ["http://localhost:4000/api/auth/callback"]`
  - `attributes.pkce.code.challenge.method: "S256"` (PKCE, D1).
  - `webOrigins` acorde al BFF.
- **Roles de realm**: `platform-admin`, `partner-editor`, `auditor`.
- **Protocol mapper** que emite los roles en el claim configurado por
  `ROLE_CLAIM_PATH` (p. ej. `realm_access.roles` o un claim `roles` dedicado).
- **Usuarios de prueba** (password directo, solo dev), uno por rol:
  `admin-user` → `platform-admin`, `editor-user` → `partner-editor`,
  `auditor-user` → `auditor`, y `norole-user` → sin roles (para probar 403 de
  menor privilegio, US2 esc.4).

## 3. Variables de entorno del BFF (dev) — D12

```bash
OIDC_ISSUER_URL=http://localhost:8080/auth/realms/backoffice
OIDC_CLIENT_ID=backoffice-bff
OIDC_CLIENT_SECRET=<dev-secret>          # secreto — no versionar valor real
OIDC_REDIRECT_URI=http://localhost:4000/api/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:4000/admin
SESSION_SEAL_KEY=<32-byte-base64>        # secreto AEAD (D2)
SESSION_TTL_SECONDS=3600                 # D3
ROLE_CLAIM_PATH=realm_access.roles       # D5
ROLE_MAP={"platform-admin":"platform-admin","partner-editor":"partner-editor","auditor":"auditor"}
```

- **Paridad dev/prod**: mismos nombres de variable; prod cambia valores
  (issuer real, secretos del gestor de secretos, `Secure` cookies sobre TLS).
- El BFF resuelve `OIDC_CLIENT_SECRET`/`SESSION_SEAL_KEY` por el patrón
  `secrets/` existente; nunca llegan al bundle/cliente (FR-002, PRD 04 §5).

## 4. Nota RH-SSO 7.6 (base path `/auth`)

RH-SSO 7.6 (Keycloak 15.x) sirve bajo `/auth` (issuer `.../auth/realms/<realm>`),
a diferencia de Keycloak ≥17 (sin `/auth`). El `OIDC_ISSUER_URL` de arriba lo
refleja; usar la MISMA imagen en dev/prod evita esta clase de deriva (D11).

## 5. Verificación (ver `quickstart.md`)

- `podman-compose -f infra/sso/podman-compose.yml up` levanta RH-SSO con el realm
  `backoffice` importado y los 4 usuarios.
- Discovery accesible: `GET {OIDC_ISSUER_URL}/.well-known/openid-configuration`.
</content>

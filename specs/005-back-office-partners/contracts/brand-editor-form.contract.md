# Contract — Editor de marca (`brand-editor` + `color-field` + `asset-uploader`)

Forma reactiva tipada que edita el `PartnerTheme` (`002`) y produce el
`ThemeDraft` que alimenta el preview. Cubre FR-007, FR-008, FR-009 y las
validaciones de US3.

**Reactive Forms obligatorio** (Const. II); estado de edición síncrono (signals),
no server-state (Const. I, D5).

---

## Estructura del `FormGroup` (tipado, `NonNullable`)

| Grupo | Controles | Control UI |
|-------|-----------|------------|
| `tokens` | `colorPrimary`, `colorPrimaryTint`, `colorSecondary`, `colorSecondaryTint`, `colorSurface`, `colorBorder`, `colorTextStrong`, `colorTextMuted` | `color-field` (picker nativo + hex) |
| `assets` | `logoUrl`, `faviconUrl`, `coBrandBankLogoUrl`, `coBrandGroupLogoUrl?` | `asset-uploader` |
| `typography` | `fontFamily`, `fontUrlWoff2?` | select + upload opcional |
| `legal` | `footerDisclaimer`, `termsUrl?`, `privacyUrl?` | textarea / input url |

- Los valores del form se proyectan a `ThemeDraft` vía `valueChanges` → un
  `signal`, del que derivan (`computed`) `previewCssVars`, `isDirty` y
  `contrastWarnings` (ver `data-model.md`).
- `output()` `save` y `publish` emiten hacia el `partner-edit` que dispara las
  mutaciones (contract `admin-api`).

---

## `color-field` (FR-008 — advertencia de contraste)

- Variante del átomo de input de `ui/` (ARCHITECTURE §5): `<input type="color">`
  nativo + input hex sincronizados. **Sin** librería de color (D4).
- `input()`: `against` (color de superficie contra el que evaluar, p. ej.
  `colorSurface`) y `minimum` (umbral AA, default 4.5).
- Calcula el ratio con `util/contrast-ratio.ts` (WCAG 2.1, D2) y **advierte**
  visualmente cuando `ratio < minimum` — **sin** invalidar el control ni bloquear
  la edición (FR-008, US3.2).
- La advertencia es de UI, **no** un `ValidationError` del form (el form sigue
  válido; guardar/publicar no se bloquea por contraste).

### `contrast-ratio.ts`

```typescript
export function contrastRatio(hexA: string, hexB: string): number; // WCAG 2.1, 1..21
export function meetsAA(ratio: number, largeText = false): boolean; // 4.5 normal / 3.0 grande
```

Aritmética de luminancia relativa; sin dependencias.

---

## `asset-uploader` (FR-009 — assets vía BFF)

- Sube vía la mutación `uploadAsset` → `POST /api/admin/assets` (contract
  `admin-api`). Devuelve `{ url, key }`; la `url` se escribe en el control de
  asset correspondiente del form (y por tanto al preview).
- **Validación cliente** (feedback temprano): MIME permitido, tamaño y
  dimensiones máximas. Es feedback, **no** la barrera única — el BFF revalida y
  sanitiza SVG server-side (autoritativo, `004`/`002`, FR-009).
- Un archivo inválido se rechaza en cliente con motivo claro; si pasa el cliente
  pero falla el server, se muestra el `ApiError` normalizado.
- `NgOptimizedImage` **no** aplica a previews de assets recién subidos vía
  `data:`/blob (nota CLAUDE.md); se usa `<img>` directo para el preview del
  uploader.

---

## Acceptance

1. El editor es un `FormGroup` reactivo tipado; **no** hay `[(ngModel)]` ni
   template-driven (Const. II). (FR-007)
2. Editar cualquier control refleja el cambio en el preview vía el `ThemeDraft`
   derivado (signals), sin guardar (enlaza con `preview-isolation`). (FR-010)
3. Elegir `colorTextStrong` con contraste <4.5 contra `colorSurface` muestra la
   advertencia del `color-field`; el form permanece **válido** y "Guardar" sigue
   habilitado. (FR-008, US3.2)
4. Subir un asset con MIME/tamaño/dimensiones fuera de límite se rechaza en
   cliente con motivo; un SVG válido se sube y el BFF lo sanitiza (el panel no
   confía solo en el cliente). (FR-009, US3.3)
5. `contrast-ratio.ts` tiene unit spec: pares conocidos (negro/blanco = 21,
   gris medio/blanco ≈ fallo AA) dan el ratio y veredicto esperados. (D2)
6. `Guardar` emite `save` con el `ThemeDraft` completo; `Publicar` emite
   `publish` con el `themeId` del borrador guardado. (FR-013/014)

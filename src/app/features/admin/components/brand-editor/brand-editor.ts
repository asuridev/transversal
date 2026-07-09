import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  Signal,
  computed,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';

import type { PublicTheme } from '../../../../../shared/partner/public-theme-model';
import { toCssVars } from '../../../../core/theme/theme-css-vars';
import type { ContrastWarning, ThemeDraft } from '../../models/partner-admin-model';
import { meetsAA, contrastRatio } from '../../util/contrast-ratio';
import { ColorField } from '../color-field/color-field';
import { AssetUploader } from '../asset-uploader/asset-uploader';
import { Card } from '../../../../shared/ui/card/card';
import { FieldMessage } from '../../../../shared/ui/field-message/field-message';
import { Textarea } from '../../../../shared/ui/textarea/textarea';
import { TextInput } from '../../../../shared/ui/text-input/text-input';

interface TokensGroup {
  colorPrimary: FormControl<string>;
  colorPrimaryTint: FormControl<string>;
  colorSecondary: FormControl<string>;
  colorSecondaryTint: FormControl<string>;
  colorSurface: FormControl<string>;
  colorBorder: FormControl<string>;
  colorTextStrong: FormControl<string>;
  colorTextMuted: FormControl<string>;
  colorHeroSurface: FormControl<string>;
  colorHeroText: FormControl<string>;
  colorFooterSurface: FormControl<string>;
  colorFooterText: FormControl<string>;
}

interface AssetsGroup {
  logoUrl: FormControl<string>;
  faviconUrl: FormControl<string>;
  coBrandBankLogoUrl: FormControl<string>;
  coBrandGroupLogoUrl: FormControl<string>;
  heroImageUrl: FormControl<string>;
  footerSealUrl: FormControl<string>;
  footerInsurerUrl: FormControl<string>;
  logoInverseUrl: FormControl<string>;
  coBrandBankLogoInverseUrl: FormControl<string>;
  coBrandGroupLogoInverseUrl: FormControl<string>;
  footerSealInverseUrl: FormControl<string>;
  footerInsurerInverseUrl: FormControl<string>;
}

interface TypographyGroup {
  fontFamily: FormControl<string>;
  fontUrlWoff2: FormControl<string>;
}

interface LegalGroup {
  footerDisclaimer: FormControl<string>;
  termsUrl: FormControl<string>;
  privacyUrl: FormControl<string>;
}

interface BrandEditorForm {
  tokens: FormGroup<TokensGroup>;
  assets: FormGroup<AssetsGroup>;
  typography: FormGroup<TypographyGroup>;
  legal: FormGroup<LegalGroup>;
}

const CONTRAST_PAIRS: ReadonlyArray<{ tokenKey: keyof TokensGroup; againstKey: keyof TokensGroup }> = [
  { tokenKey: 'colorTextStrong', againstKey: 'colorSurface' },
  { tokenKey: 'colorTextMuted', againstKey: 'colorSurface' },
  { tokenKey: 'colorHeroText', againstKey: 'colorHeroSurface' },
  { tokenKey: 'colorFooterText', againstKey: 'colorFooterSurface' },
];

function buildForm(draft: ThemeDraft): FormGroup<BrandEditorForm> {
  return new FormGroup<BrandEditorForm>({
    tokens: new FormGroup<TokensGroup>({
      colorPrimary: new FormControl(draft.tokens.colorPrimary, { nonNullable: true }),
      colorPrimaryTint: new FormControl(draft.tokens.colorPrimaryTint, { nonNullable: true }),
      colorSecondary: new FormControl(draft.tokens.colorSecondary, { nonNullable: true }),
      colorSecondaryTint: new FormControl(draft.tokens.colorSecondaryTint, { nonNullable: true }),
      colorSurface: new FormControl(draft.tokens.colorSurface, { nonNullable: true }),
      colorBorder: new FormControl(draft.tokens.colorBorder, { nonNullable: true }),
      colorTextStrong: new FormControl(draft.tokens.colorTextStrong, { nonNullable: true }),
      colorTextMuted: new FormControl(draft.tokens.colorTextMuted, { nonNullable: true }),
      colorHeroSurface: new FormControl(draft.tokens.colorHeroSurface, { nonNullable: true }),
      colorHeroText: new FormControl(draft.tokens.colorHeroText, { nonNullable: true }),
      colorFooterSurface: new FormControl(draft.tokens.colorFooterSurface, { nonNullable: true }),
      colorFooterText: new FormControl(draft.tokens.colorFooterText, { nonNullable: true }),
    }),
    assets: new FormGroup<AssetsGroup>({
      logoUrl: new FormControl(draft.assets.logoUrl, { nonNullable: true }),
      faviconUrl: new FormControl(draft.assets.faviconUrl, { nonNullable: true }),
      coBrandBankLogoUrl: new FormControl(draft.assets.coBrandBankLogoUrl, { nonNullable: true }),
      coBrandGroupLogoUrl: new FormControl(draft.assets.coBrandGroupLogoUrl ?? '', { nonNullable: true }),
      heroImageUrl: new FormControl(draft.assets.heroImageUrl, { nonNullable: true }),
      footerSealUrl: new FormControl(draft.assets.footerSealUrl ?? '', { nonNullable: true }),
      footerInsurerUrl: new FormControl(draft.assets.footerInsurerUrl ?? '', { nonNullable: true }),
      logoInverseUrl: new FormControl(draft.assets.logoInverseUrl ?? '', { nonNullable: true }),
      coBrandBankLogoInverseUrl: new FormControl(draft.assets.coBrandBankLogoInverseUrl ?? '', { nonNullable: true }),
      coBrandGroupLogoInverseUrl: new FormControl(draft.assets.coBrandGroupLogoInverseUrl ?? '', { nonNullable: true }),
      footerSealInverseUrl: new FormControl(draft.assets.footerSealInverseUrl ?? '', { nonNullable: true }),
      footerInsurerInverseUrl: new FormControl(draft.assets.footerInsurerInverseUrl ?? '', { nonNullable: true }),
    }),
    typography: new FormGroup<TypographyGroup>({
      fontFamily: new FormControl(draft.typography.fontFamily, { nonNullable: true }),
      fontUrlWoff2: new FormControl(draft.typography.fontUrlWoff2 ?? '', { nonNullable: true }),
    }),
    legal: new FormGroup<LegalGroup>({
      footerDisclaimer: new FormControl(draft.legal.footerDisclaimer, { nonNullable: true }),
      termsUrl: new FormControl(draft.legal.termsUrl ?? '', { nonNullable: true }),
      privacyUrl: new FormControl(draft.legal.privacyUrl ?? '', { nonNullable: true }),
    }),
  });
}

function formValueToDraft(value: ReturnType<FormGroup<BrandEditorForm>['getRawValue']>): ThemeDraft {
  return {
    tokens: value.tokens,
    assets: {
      logoUrl: value.assets.logoUrl,
      faviconUrl: value.assets.faviconUrl,
      coBrandBankLogoUrl: value.assets.coBrandBankLogoUrl,
      heroImageUrl: value.assets.heroImageUrl,
      ...(value.assets.coBrandGroupLogoUrl ? { coBrandGroupLogoUrl: value.assets.coBrandGroupLogoUrl } : {}),
      ...(value.assets.footerSealUrl ? { footerSealUrl: value.assets.footerSealUrl } : {}),
      ...(value.assets.footerInsurerUrl ? { footerInsurerUrl: value.assets.footerInsurerUrl } : {}),
      ...(value.assets.logoInverseUrl ? { logoInverseUrl: value.assets.logoInverseUrl } : {}),
      ...(value.assets.coBrandBankLogoInverseUrl
        ? { coBrandBankLogoInverseUrl: value.assets.coBrandBankLogoInverseUrl }
        : {}),
      ...(value.assets.coBrandGroupLogoInverseUrl
        ? { coBrandGroupLogoInverseUrl: value.assets.coBrandGroupLogoInverseUrl }
        : {}),
      ...(value.assets.footerSealInverseUrl ? { footerSealInverseUrl: value.assets.footerSealInverseUrl } : {}),
      ...(value.assets.footerInsurerInverseUrl
        ? { footerInsurerInverseUrl: value.assets.footerInsurerInverseUrl }
        : {}),
    },
    legal: {
      footerDisclaimer: value.legal.footerDisclaimer,
      ...(value.legal.termsUrl ? { termsUrl: value.legal.termsUrl } : {}),
      ...(value.legal.privacyUrl ? { privacyUrl: value.legal.privacyUrl } : {}),
    },
    typography: {
      fontFamily: value.typography.fontFamily,
      ...(value.typography.fontUrlWoff2 ? { fontUrlWoff2: value.typography.fontUrlWoff2 } : {}),
    },
  };
}

/** Reactive Form tipado sobre `PartnerTheme` (FR-007) — produce el `ThemeDraft` del preview. */
@Component({
  selector: 'app-brand-editor',
  imports: [ReactiveFormsModule, ColorField, AssetUploader, Card, FieldMessage, Textarea, TextInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brand-editor.html',
})
export class BrandEditor implements OnInit {
  readonly initialTheme = input.required<ThemeDraft>();
  // Se propaga a cada `app-asset-uploader` para componer el key estable del asset
  // (`<partnerId>-<slot>.<ext>`) al subir. Lo provee `partner-edit` (id de ruta).
  readonly partnerId = input.required<string>();

  // El padre solo monta `brand-editor` una vez cargado el `PartnerDetail` (`@if`),
  // así que `initialTheme` es estable durante la vida del componente: el form es
  // un snapshot editable de esa carga, no un espejo reactivo del input. Se
  // construye en `ngOnInit` (no en el constructor/inicializador de campo) porque
  // los `input.required()` solo están disponibles una vez Angular los asigna,
  // después de la construcción (NG0950).
  protected form!: FormGroup<BrandEditorForm>;

  private readonly injector = inject(Injector);
  // Puente Observable→signal canónico (`toSignal`): sin `.subscribe()` manual ni
  // fuga de suscripción — el teardown lo gestiona el injection context del
  // componente. Se inicializa en `ngOnInit` (necesita `form`, que depende de los
  // `input.required`), por eso se pasa el `injector` explícito.
  private formValue!: Signal<ReturnType<FormGroup<BrandEditorForm>['getRawValue']>>;

  // Snapshot serializado del valor inicial, calculado UNA vez (initialTheme es
  // estable durante la vida del componente): `isDirty` solo serializa el lado
  // que cambia, sin reconstruir el FormGroup por keystroke.
  private initialSerialized = '';

  ngOnInit(): void {
    this.form = buildForm(this.initialTheme());
    const initialValue = this.form.getRawValue();
    this.initialSerialized = JSON.stringify(initialValue);
    this.formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
      initialValue,
      injector: this.injector,
    });
  }

  // Público — el `partner-edit` lo lee vía referencia de plantilla para alimentar
  // el `theme-preview` aislado con el borrador en vivo (FR-010).
  readonly draft = computed<ThemeDraft>(() => {
    if (!this.form) {
      return this.initialTheme();
    }
    return formValueToDraft(this.formValue());
  });

  protected readonly previewCssVars = computed<Record<string, string>>(() =>
    toCssVars({
      tokens: this.draft().tokens,
      typography: this.draft().typography,
    } as PublicTheme),
  );

  // Público — leído por el guard de descarte de `partner-edit` (US3, Edge Case).
  // Compara valores normalizados por `getRawValue()` (mismo shape en ambos lados),
  // no el `ThemeDraft` crudo — evita falsos positivos por orden de claves.
  readonly isDirty = computed<boolean>(
    () => !!this.form && this.initialSerialized !== JSON.stringify(this.formValue()),
  );

  protected readonly contrastWarnings = computed<ContrastWarning[]>(() => {
    const tokens = this.draft().tokens;
    const warnings: ContrastWarning[] = [];
    for (const { tokenKey, againstKey } of CONTRAST_PAIRS) {
      const from = tokens[tokenKey];
      const against = tokens[againstKey];
      // Colores opcionales (p. ej. héroe/footer) pueden venir sin definir en themes
      // antiguos: sin ambos no hay contraste que evaluar. Se omite el par en vez de
      // reventar la CD del editor (contrastRatio asume hex no nulo).
      if (!from || !against) {
        continue;
      }
      const ratio = contrastRatio(from, against);
      if (!meetsAA(ratio)) {
        warnings.push({ tokenKey, againstKey, ratio, minimum: 4.5 });
      }
    }
    return warnings;
  });

}

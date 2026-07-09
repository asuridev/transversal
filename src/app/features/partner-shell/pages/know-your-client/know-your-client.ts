import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { getDefaultPublicTheme } from '../../../../../shared/partner/default-public-theme';
import { ThemeStore } from '../../../../core/store/theme.store';
import { TenantStore } from '../../../../core/store/tenant.store';
import { ContactConfirm, type ContactSelection } from '../../components/contact-confirm/contact-confirm';
import { DateField } from '../../components/date-field/date-field';
import { DocumentTypeSelect } from '../../components/document-type-select/document-type-select';
import { KycCard } from '../../components/kyc-card/kyc-card';
import { LoadingOverlay } from '../../../../shared/ui/loading-overlay/loading-overlay';
import { ContactInfoQueries } from '../../queries/contact-info-queries';
import type { ContactInfoRequest } from '../../models/contact-info-model';

interface KycForm {
  tipoDocumento: FormControl<string>;
  numeroDocumento: FormControl<string>;
  fechaExpedicion: FormControl<string>;
  consentAsesor: FormControl<boolean>;
  consentDatos: FormControl<boolean>;
}

/** Display del `document-type-select` → código que espera el BFF/Mashery. */
const DOCUMENT_TYPE_CODES: Readonly<Record<string, string>> = {
  'Cédula de ciudadanía': 'CC',
  'Cédula de extranjería': 'CE',
  Pasaporte: 'PA',
  NIT: 'NIT',
};

/**
 * Página "Conoce a tu cliente" (KYC) que ve el asesor tras autenticarse en
 * `/:partnerSlug`. La estructura, los campos (incl. Fecha de expedición) y los
 * textos de consentimiento son iguales para todos los partners — solo se
 * interpola `displayName`. La identidad visual (fondo/texto del héroe, fuente,
 * imagen) llega por los tokens del theme activo (`--brand-*`).
 */
@Component({
  selector: 'app-know-your-client',
  imports: [ReactiveFormsModule, DocumentTypeSelect, DateField, KycCard, ContactConfirm, LoadingOverlay],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './know-your-client.html',
})
export class KnowYourClient {
  private readonly themeStore = inject(ThemeStore);
  private readonly tenantStore = inject(TenantStore);
  private readonly contactInfoQueries = inject(ContactInfoQueries);

  protected readonly theme = computed(() => this.themeStore.theme() ?? getDefaultPublicTheme());
  protected readonly partnerName = computed(() => this.theme().displayName);
  protected readonly heroImageUrl = computed(() => this.theme().assets.heroImageUrl);

  /** Paso visible dentro del card: formulario de consulta ↔ confirmación de contacto. */
  protected readonly step = signal<'form' | 'confirm'>('form');

  /** Documento enviado — también es la "llave" del caché de la query. */
  private readonly submittedDoc = signal<ContactInfoRequest | null>(null);

  /**
   * Consulta de contacto por documento, cacheada por `slug + documento`. `enabled`
   * la mantiene inactiva hasta enviar el formulario; reenviar el mismo documento
   * es un cache hit (sin red, sin overlay).
   */
  protected readonly contactInfo = injectQuery(() =>
    this.contactInfoQueries.contactInfo(this.tenantStore.partnerSlug(), this.submittedDoc()),
  );

  protected readonly documentTypes = [
    'Cédula de ciudadanía',
    'Cédula de extranjería',
    'Pasaporte',
    'NIT',
  ] as const;

  protected readonly form = new FormGroup<KycForm>({
    tipoDocumento: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    numeroDocumento: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fechaExpedicion: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    consentAsesor: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
    consentDatos: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  protected onSubmit(): void {
    if (this.form.invalid || this.contactInfo.isFetching()) {
      this.form.markAllAsTouched();
      return;
    }

    const slug = this.tenantStore.partnerSlug();
    if (!slug) {
      return;
    }

    const { tipoDocumento, numeroDocumento } = this.form.getRawValue();
    // Setear el documento habilita/recompone la query: si ya está en caché y
    // fresco, `contactInfo.data()` responde al instante (sin red ni overlay).
    this.submittedDoc.set({
      documentType: DOCUMENT_TYPE_CODES[tipoDocumento] ?? tipoDocumento,
      documentNumber: numeroDocumento,
    });
    this.step.set('confirm');
  }

  /** "Volver": desde la confirmación regresa al formulario (mismo card, sin remontar el héroe). */
  protected onBack(): void {
    if (this.step() === 'confirm') {
      this.step.set('form');
    }
  }

  /** Placeholder del siguiente paso del journey — se define después. */
  protected onContinue(_selection: ContactSelection): void {
    // TODO: continuar el journey con el correo/teléfono confirmados.
  }
}

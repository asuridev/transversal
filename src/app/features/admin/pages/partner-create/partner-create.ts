import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { injectMutation } from '@tanstack/angular-query-experimental';

import { normalizeSlug } from '../../../../core/tenant/slug';
import { isReservedSegment } from '../../../../core/tenant/reserved-names';
import { isValidPartnerKey } from '../../../../../shared/partner/partner-key';
import { Button, LinkButton } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { FieldMessage } from '../../../../shared/ui/field-message/field-message';
import { TextInput } from '../../../../shared/ui/text-input/text-input';
import { AdminQueries } from '../../queries/admin-queries';

interface CreatePartnerForm {
  slug: FormControl<string>;
  partnerKey: FormControl<string>;
  displayName: FormControl<string>;
}

function slugFormatValidator(control: FormControl<string>): Record<string, boolean> | null {
  const value = control.value ?? '';
  if (!value) {
    return null;
  }
  return normalizeSlug(value) ? null : { format: true };
}

function slugReservedValidator(control: FormControl<string>): Record<string, boolean> | null {
  const normalized = normalizeSlug(control.value ?? '');
  return normalized && isReservedSegment(normalized) ? { reserved: true } : null;
}

function partnerKeyFormatValidator(control: FormControl<string>): Record<string, boolean> | null {
  const value = control.value ?? '';
  if (!value) {
    return null;
  }
  return isValidPartnerKey(value) ? null : { format: true };
}

/** Alta de partner (US2, FR-004/005/006). */
@Component({
  selector: 'app-partner-create',
  imports: [ReactiveFormsModule, RouterLink, Button, LinkButton, Card, FieldMessage, TextInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './partner-create.html',
})
export class PartnerCreate {
  private readonly adminQueries = inject(AdminQueries);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup<CreatePartnerForm>({
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, slugFormatValidator, slugReservedValidator],
    }),
    partnerKey: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, partnerKeyFormatValidator],
    }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly serverError = signal<string | null>(null);

  // La invalidación del listado vive en `AdminQueries.createPartner()`; aquí solo
  // navegación y error de formulario, vía los callbacks de `.mutate()`.
  protected readonly createMutation = injectMutation(() => this.adminQueries.createPartner());

  protected submit(): void {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.createMutation.mutate(
      {
        slug: this.form.controls.slug.value,
        partnerKey: this.form.controls.partnerKey.value,
        displayName: this.form.controls.displayName.value,
      },
      {
        onSuccess: (result) => this.router.navigate(['/admin', result.partner.id, 'editar']),
        onError: (err: unknown) => {
          const message =
            err instanceof HttpErrorResponse
              ? ((err.error as { message?: string } | null)?.message ?? 'No se pudo crear el partner.')
              : 'No se pudo crear el partner.';
          this.serverError.set(message);
        },
      },
    );
  }
}

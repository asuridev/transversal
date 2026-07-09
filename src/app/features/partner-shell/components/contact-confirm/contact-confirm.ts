import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { ContactInfoEmail, ContactInfoPhone, PersonalInformation } from '../../models/contact-info-model';

/** Selección de contacto vigente que el asesor confirma para continuar el journey. */
export interface ContactSelection {
  readonly email: ContactInfoEmail;
  readonly phone: ContactInfoPhone;
}

/**
 * Paso de confirmación del KYC (Figma "D - Confirmación cliente"): muestra la
 * información recibida como listas seleccionables — un correo y un número de
 * contacto vigentes (selección única por grupo) — y habilita "Continuar" solo
 * cuando ambos están elegidos. Presentacional: el destino de "Continuar" lo
 * decide el contenedor vía `continued`. Themeable por partner (tokens `--brand-*`).
 */
@Component({
  selector: 'app-contact-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-confirm.html',
  host: {
    class:
      'flex flex-col justify-center gap-6 bg-surface pb-6 md:flex-1 md:py-6 md:pl-[32px] md:pr-[24px] lg:w-[440px] lg:flex-none lg:shrink-0',
  },
})
export class ContactConfirm {
  readonly info = input.required<PersonalInformation>();
  readonly continued = output<ContactSelection>();

  protected readonly emails = computed(() => this.info().emails);
  protected readonly phones = computed(() => this.info().cellPhoneNumber);

  // El índice como valor: los correos/teléfonos enmascarados pueden repetirse.
  protected readonly selectedEmailIndex = signal<number | null>(null);
  protected readonly selectedPhoneIndex = signal<number | null>(null);

  protected readonly canContinue = computed(
    () => this.selectedEmailIndex() !== null && this.selectedPhoneIndex() !== null,
  );

  protected onContinue(): void {
    const emailIndex = this.selectedEmailIndex();
    const phoneIndex = this.selectedPhoneIndex();
    if (emailIndex === null || phoneIndex === null) {
      return;
    }
    this.continued.emit({ email: this.emails()[emailIndex], phone: this.phones()[phoneIndex] });
  }
}

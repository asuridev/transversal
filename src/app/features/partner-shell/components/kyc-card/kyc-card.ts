import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Shell visual compartido de "Conoce a tu cliente": panel héroe izquierdo
 * (título + imagen del partner, parametrizado por `--brand-hero-*`) + card con
 * el contenido del paso proyectado por `<ng-content>`. El héroe permanece
 * constante entre pasos (formulario ↔ confirmación); solo cambia lo proyectado.
 */
@Component({
  selector: 'app-kyc-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kyc-card.html',
})
export class KycCard {
  readonly heroImageUrl = input<string>('');
  /** Clic en "Volver" — el contenedor decide el destino según el paso. */
  readonly back = output<void>();

  /** Oculta la imagen del héroe si el asset está roto, sin romper el layout (FR-017, D10). */
  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Overlay de carga reutilizable. Cubre el área de contenido (fondo blanco sólido),
 * con un anillo circular al centro en el color del tema del partner
 * (`--brand-primary`) y un mensaje configurable. Es `absolute inset-0`: el
 * contenedor que lo aloja debe ser `position: relative` (p. ej. el `<main>` del
 * shell), de modo que NO cubra el header ni el footer (diseño Figma). El llamador
 * controla la visibilidad con `@if` (p. ej. `mutation.isPending()`).
 */
@Component({
  selector: 'ui-loading-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-white"
      role="status"
      aria-live="polite"
    >
      <!-- Anillo (Figma "Spinner-Round"): pista clara + arco de acento en el color
           del partner (--brand-primary). ~133px con trazo grueso. -->
      <div
        class="h-[132px] w-[132px] animate-spin rounded-full border-[12px] border-primary/20 border-t-primary"
      ></div>
      <p class="text-2xl font-medium leading-10 text-text-strong">{{ message() }}</p>
    </div>
  `,
})
export class LoadingOverlay {
  readonly message = input<string>('Cargando datos espera un momento');
}

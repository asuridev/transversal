import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen items-center justify-center p-8 text-center">
      <p class="text-lg">Este enlace no corresponde a un socio activo.</p>
    </div>
  `,
})
export class Landing {}

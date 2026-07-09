import { Injectable } from '@angular/core';

/** Frontera testable de `window.location` — permite fakear la navegación en specs sin navegar de verdad. */
@Injectable({ providedIn: 'root' })
export class BrowserRedirect {
  redirectTo(url: string): void {
    window.location.href = url;
  }
}

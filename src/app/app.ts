import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeApplier } from './core/theme/theme-applier';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  /** Instancia el effect raíz del theming: vivo durante toda la sesión (T012). */
  private readonly themeApplier = inject(ThemeApplier);
}

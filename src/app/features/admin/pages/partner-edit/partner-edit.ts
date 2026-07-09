import { ChangeDetectionStrategy, Component, computed, inject, input, viewChild } from '@angular/core';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';

import { AdminQueries } from '../../queries/admin-queries';
import { NotificationService } from '../../../../core/notifications/notification-service';
import { BrandEditor } from '../../components/brand-editor/brand-editor';
import { ThemePreview } from '../../components/theme-preview/theme-preview';
import { Badge } from '../../../../shared/ui/badge/badge';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import type { ThemeDraft } from '../../models/partner-admin-model';

/** Editor de marca + preview en vivo aislado (US3/US4, FR-007..014). */
@Component({
  selector: 'app-partner-edit',
  imports: [BrandEditor, ThemePreview, Badge, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './partner-edit.html',
})
export class PartnerEdit {
  private readonly adminQueries = inject(AdminQueries);
  private readonly notifications = inject(NotificationService);

  // Bindeado desde el parámetro de ruta `:id` vía `withComponentInputBinding()`
  // (A6): elimina la dependencia de `ActivatedRoute` y el non-null assertion.
  readonly id = input.required<string>();

  // Leído por `partnerEditCanDeactivate` (guard de descarte, Edge Case "salir sin guardar").
  private readonly editorRef = viewChild(BrandEditor);

  hasUnsavedChanges(): boolean {
    return this.editorRef()?.isDirty() ?? false;
  }

  protected readonly partnerQuery = injectQuery(() => this.adminQueries.partner(this.id()));

  protected readonly initialDraft = computed<ThemeDraft | null>(() => {
    const detail = this.partnerQuery.data();
    if (!detail) {
      return null;
    }
    const theme = detail.draftTheme ?? detail.publishedTheme;
    return theme
      ? { tokens: theme.tokens, assets: theme.assets, legal: theme.legal, typography: theme.typography }
      : null;
  });

  protected readonly canPublish = computed<boolean>(() => this.partnerQuery.data()?.draftTheme != null);

  /** Versión del borrador en edición (si existe), para el badge de estado (B4). */
  protected readonly draftVersion = computed<number | null>(() => this.partnerQuery.data()?.draftTheme?.version ?? null);
  /** Versión publicada actual (la que ve el cliente), para el badge de estado (B4). */
  protected readonly publishedVersion = computed<number | null>(
    () => this.partnerQuery.data()?.publishedTheme?.version ?? null,
  );

  // La invalidación de caché vive en `AdminQueries` (junto a las queryKey); aquí
  // solo los efectos de UI, vía los callbacks de `.mutate()` (corren además del
  // `onSuccess` central).
  protected readonly saveMutation = injectMutation(() => this.adminQueries.saveTheme(this.id()));
  protected readonly publishMutation = injectMutation(() => this.adminQueries.publish(this.id()));

  protected onSaveClick(): void {
    const draft = this.editorRef()?.draft();
    if (draft) {
      this.saveMutation.mutate(draft, {
        onSuccess: () => this.notifications.success('Borrador guardado.'),
        onError: () => this.notifications.error('No se pudo guardar. Verifica tu conexión e intenta de nuevo.'),
      });
    }
  }

  protected onPublish(): void {
    const themeId = this.partnerQuery.data()?.draftTheme?.id;
    if (!themeId) {
      this.notifications.error('No hay borrador pendiente para publicar.');
      return;
    }
    this.publishMutation.mutate(themeId, {
      onSuccess: () => this.notifications.success('Versión publicada. Ya es visible para el cliente.'),
      onError: () => this.notifications.error('No se pudo publicar. Verifica tu conexión e intenta de nuevo.'),
    });
  }
}

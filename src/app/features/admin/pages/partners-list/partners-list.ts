import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';

import { Badge } from '../../../../shared/ui/badge/badge';
import { Button, LinkButton } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { TextInput } from '../../../../shared/ui/text-input/text-input';
import { AdminQueries } from '../../queries/admin-queries';
import type { PartnerListItem } from '../../models/partner-admin-model';

/** Listado + buscador de partners (US1, FR-001/002). */
@Component({
  selector: 'app-partners-list',
  imports: [Badge, Button, LinkButton, Card, TextInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './partners-list.html',
})
export class PartnersList {
  private readonly adminQueries = inject(AdminQueries);

  protected readonly search = signal('');
  private searchDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly partnersQuery = injectQuery(() => this.adminQueries.partners());

  protected readonly filteredPartners = computed<PartnerListItem[]>(() => {
    const term = this.search().trim().toLowerCase();
    const partners = this.partnersQuery.data() ?? [];
    if (!term) {
      return partners;
    }
    return partners.filter(
      (p) => p.displayName.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term),
    );
  });

  // Invalidación de caché centralizada en `AdminQueries` (junto a las queryKey).
  protected readonly deactivateMutation = injectMutation(() => this.adminQueries.deactivate());
  protected readonly activateMutation = injectMutation(() => this.adminQueries.activate());

  protected onSearchInput(value: string): void {
    clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => this.search.set(value), 250);
  }

  protected retry(): void {
    this.partnersQuery.refetch();
  }

  protected toggleStatus(partner: PartnerListItem): void {
    if (partner.status === 'active') {
      if (!confirm(`¿Desactivar "${partner.displayName}"? Dejará de servirse en la experiencia pública.`)) {
        return;
      }
      this.deactivateMutation.mutate(partner.id);
    } else {
      this.activateMutation.mutate(partner.id);
    }
  }
}

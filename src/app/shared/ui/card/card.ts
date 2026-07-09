import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Átomo de card — superficie del chrome admin (radio 5px, sombra card). */
@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block rounded-[5px] bg-admin-surface shadow-[0_2px_5px_rgba(0,0,0,0.2)]',
  },
  template: `<ng-content />`,
})
export class Card {}

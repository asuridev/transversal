import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

const AUTO_DISMISS_MS = 4000;

/**
 * Notificaciones transversales tipo toast (ARCHITECTURE §2 — notificaciones globales
 * en `core`). Estado síncrono vía señal; los emisores llaman `success`/`error` y el
 * `ToastHost` (montado una vez en el shell) las pinta. Auto-descarte por timeout.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _toasts = signal<readonly Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 1;

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, text: string): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list, { id, kind, text }]);
    // `setTimeout` está bien en zoneless: solo muta una señal, que dispara la CD.
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
  }
}

import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { injectMutation } from '@tanstack/angular-query-experimental';

import type { AssetSlotSlug } from '../../../../../shared/partner/asset-slots';
import { AdminQueries } from '../../queries/admin-queries';
import { NotificationService } from '../../../../core/notifications/notification-service';
import { Badge } from '../../../../shared/ui/badge/badge';
import { FieldMessage } from '../../../../shared/ui/field-message/field-message';
import { validateAssetFile } from './validate-asset-file';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Añade/reemplaza un query `?v=<timestamp>` para romper el caché del navegador
 * en URLs de asset estables. Reemplaza solo el param `v` (no acumula en re-subidas)
 * y preserva otros query params (p. ej. URLs firmadas de un backend cloud futuro).
 */
function withCacheBustParam(url: string): string {
  const [path, query = ''] = url.split('?');
  const params = query.split('&').filter((p) => p && !p.startsWith('v='));
  params.push(`v=${Date.now()}`);
  return `${path}?${params.join('&')}`;
}

/** Estado visible del asset: sin imagen · subiendo · nueva sin guardar · guardada. */
type AssetState = 'empty' | 'uploading' | 'unsaved' | 'saved';

/**
 * Sube assets vía `POST /api/admin/assets` (FR-009) y **propaga la URL devuelta al
 * `FormControl`** (vía `onChange`) para que el borrador guardado la incluya. La subida
 * NO persiste por sí sola: el admin debe Guardar y Publicar (el chip de estado lo
 * recuerda). Validación cliente (MIME/tamaño) es feedback temprano; el BFF revalida y
 * sanitiza SVG server-side (autoritativo).
 */
@Component({
  selector: 'app-asset-uploader',
  imports: [FieldMessage, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AssetUploader),
      multi: true,
    },
  ],
  templateUrl: './asset-uploader.html',
})
export class AssetUploader implements ControlValueAccessor {
  private readonly adminQueries = inject(AdminQueries);
  private readonly notifications = inject(NotificationService);
  private readonly uploadMutation = injectMutation(() => this.adminQueries.uploadAsset());

  /** Partner dueño del asset — parte del key estable `<partnerId>-<slot>.<ext>`. */
  readonly partnerId = input.required<string>();
  /** Slot del asset (logo, favicon, hero…) — la otra mitad del key estable. */
  readonly slot = input.required<AssetSlotSlug>();

  protected readonly value = signal('');
  // Vista previa local (data URL del archivo recién elegido). Se prefiere sobre
  // `value()` porque garantiza que el preview refleje SIEMPRE lo que se acaba de
  // subir: la URL del asset es estable (`<partnerId>-<slot>.<ext>`), así que
  // re-subir el mismo slot no cambia el `src` y el navegador reusaría la imagen
  // cacheada. Se limpia al sembrar desde el form (`writeValue`).
  protected readonly localPreview = signal('');
  protected readonly disabled = signal(false);
  protected readonly clientError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly uploadedOk = signal(false);
  protected readonly uploadError = signal(false);
  protected readonly brokenImage = signal(false);
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);

  protected readonly fileMeta = computed(() => (this.fileSize() ? ` · ${formatBytes(this.fileSize())}` : ''));

  protected readonly state = computed<AssetState>(() => {
    if (this.uploading()) return 'uploading';
    if (this.uploadedOk()) return 'unsaved';
    return this.value() ? 'saved' : 'empty';
  });

  /** Fuente del preview: el data URL local (subida recién hecha) tiene prioridad;
   * si no, la URL del asset ya guardada. Garantiza que toda imagen se previsualice. */
  protected readonly previewSrc = computed(() => this.localPreview() || this.value());

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
    // Valor entrante desde el form (carga inicial): no es una subida recién hecha.
    this.uploadedOk.set(false);
    this.brokenImage.set(false);
    this.localPreview.set('');
    this.fileName.set('');
    this.fileSize.set(0);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.clientError.set(null);
    this.uploadError.set(false);
    this.uploadedOk.set(false);
    if (!file) {
      return;
    }

    const validation = validateAssetFile(file);
    if (!validation.ok) {
      this.clientError.set(validation.error);
      return;
    }

    this.fileName.set(file.name);
    this.fileSize.set(file.size);

    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);

    this.uploading.set(true);
    try {
      const ref = await this.uploadMutation.mutateAsync({
        partnerId: this.partnerId(),
        slot: this.slot(),
        mimeType: file.type,
        base64,
      });
      this.brokenImage.set(false);
      // Preview inmediato desde los bytes locales: no depende de la red ni del
      // caché, y refleja el archivo aun si la URL del asset no cambió (re-subida).
      this.localPreview.set(dataUrl);
      // La URL del asset es estable (`<partnerId>-<slot>.<ext>`): re-subir no la
      // cambia, así que la Vista previa en vivo (que lee esta URL vía el draft)
      // reusaría la imagen cacheada del navegador y no reflejaría el cambio hasta
      // reiniciar. Un query `?v=<timestamp>` fuerza que el `src` cambie ⇒ el <img>
      // se re-renderiza y el navegador re-solicita los bytes nuevos. El servidor
      // ignora el query (sirve por key); persistirlo da cache-busting en el publicado.
      const url = withCacheBustParam(ref.url);
      this.value.set(url);
      this.onChange(url); // propaga al FormControl → alimenta el draft guardado
      this.onTouched();
      this.uploadedOk.set(true);
      this.notifications.success(`Imagen "${file.name}" cargada. Guarda para conservarla.`);
    } catch {
      this.uploadError.set(true);
      this.notifications.error(`No se pudo subir "${file.name}". Intenta de nuevo.`);
    } finally {
      this.uploading.set(false);
      // Permite volver a elegir el mismo archivo (el input no dispara change si no cambia).
      input.value = '';
    }
  }
}

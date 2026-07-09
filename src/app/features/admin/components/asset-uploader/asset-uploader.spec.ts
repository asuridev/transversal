import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { AssetUploader } from './asset-uploader';

describe('AssetUploader', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function create() {
    const fixture = TestBed.createComponent(AssetUploader);
    fixture.componentRef.setInput('partnerId', '065ca891-5fbc-4c90-b526-286745bd3c5d');
    fixture.componentRef.setInput('slot', 'logo');
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      registerOnChange: (fn: (v: string) => void) => void;
      onFileSelected: (e: Event) => Promise<void>;
      value: () => string;
      uploadedOk: () => boolean;
      previewSrc: () => string;
    };
  }

  function fileChangeEvent(file: File): Event {
    return { target: { files: [file], value: '' } } as unknown as Event;
  }

  it('propaga al FormControl la URL devuelta por POST /admin/assets (regresión: hoy no llegaba al draft)', async () => {
    const component = create();
    let modelValue = '';
    component.registerOnChange((v) => (modelValue = v));

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });
    const pending = component.onFileSelected(fileChangeEvent(file));

    // Esperar a que FileReader resuelva y se dispare la petición HTTP.
    await new Promise((r) => setTimeout(r, 100));
    const req = httpMock.expectOne('/api/admin/assets');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.mimeType).toBe('image/png');
    expect(req.request.body.partnerId).toBe('065ca891-5fbc-4c90-b526-286745bd3c5d');
    expect(req.request.body.slot).toBe('logo');
    req.flush({ url: '/assets/x.png', key: 'x.png' });

    await pending;

    // La URL propagada lleva un cache-bust `?v=<timestamp>` para que la Vista previa
    // en vivo refresque el <img> aunque el key del asset sea estable.
    expect(modelValue).toMatch(/^\/assets\/x\.png\?v=\d+$/);
    expect(component.value()).toMatch(/^\/assets\/x\.png\?v=\d+$/);
    expect(component.uploadedOk()).toBe(true);
    // Preview garantizado: usa el data URL local de los bytes recién leídos, no la
    // URL del asset (que no cambia al re-subir el mismo slot → caché del navegador).
    expect(component.previewSrc()).toMatch(/^data:image\/png;base64,/);
  });

  it('re-subir el mismo slot propaga una URL distinta (cache-bust) aunque el backend devuelva el mismo key', async () => {
    const component = create();
    const values: string[] = [];
    component.registerOnChange((v) => values.push(v));

    async function upload(): Promise<void> {
      const file = new File([new Uint8Array([1, 2, 3, 4])], 'logo.png', { type: 'image/png' });
      const pending = component.onFileSelected(fileChangeEvent(file));
      await new Promise((r) => setTimeout(r, 100));
      httpMock.expectOne('/api/admin/assets').flush({ url: '/assets/x.png', key: 'x.png' });
      await pending;
    }

    await upload();
    // Garantiza un timestamp distinto entre subidas.
    await new Promise((r) => setTimeout(r, 5));
    await upload();

    expect(values.length).toBe(2);
    expect(values[0]).not.toBe(values[1]);
    // No acumula params: exactamente un `?v=` por URL.
    expect(values[1]).toMatch(/^\/assets\/x\.png\?v=\d+$/);
  });

  it('rechaza MIME no permitido en cliente sin llamar al BFF', async () => {
    const component = create();
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
    await component.onFileSelected(fileChangeEvent(file));
    httpMock.expectNone('/api/admin/assets');
    expect(component.value()).toBe('');
  });
});

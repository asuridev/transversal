import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from './notification-service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jasmine.clock().install();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('empieza sin toasts', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('success() agrega un toast de tipo success', () => {
    service.success('Guardado');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].kind).toBe('success');
    expect(service.toasts()[0].text).toBe('Guardado');
  });

  it('error() agrega un toast de tipo error', () => {
    service.error('Falló');
    expect(service.toasts()[0].kind).toBe('error');
  });

  it('asigna ids únicos e incrementales', () => {
    service.success('A');
    service.success('B');
    const [a, b] = service.toasts();
    expect(a.id).not.toBe(b.id);
  });

  it('dismiss() elimina solo el toast indicado', () => {
    service.success('A');
    service.success('B');
    const firstId = service.toasts()[0].id;
    service.dismiss(firstId);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].text).toBe('B');
  });

  it('auto-descarta el toast tras el timeout (4s)', () => {
    service.success('Efímero');
    expect(service.toasts().length).toBe(1);
    jasmine.clock().tick(4000);
    expect(service.toasts().length).toBe(0);
  });

  it('no descarta antes de que expire el timeout', () => {
    service.success('Aún visible');
    jasmine.clock().tick(3999);
    expect(service.toasts().length).toBe(1);
  });
});

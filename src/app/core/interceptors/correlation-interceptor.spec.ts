import { PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { correlationInterceptor } from './correlation-interceptor';
import { SalesFlowStore } from '../store/sales-flow.store';

describe('correlationInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: InstanceType<typeof SalesFlowStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([correlationInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(SalesFlowStore);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('añade X-Correlation-Id en peticiones a /api/journey/* cuando hay id', () => {
    store.start();
    const id = store.correlationId();

    http.post('/api/journey/banco-a/consultar', {}).subscribe();
    const req = httpMock.expectOne('/api/journey/banco-a/consultar');
    expect(req.request.headers.get('X-Correlation-Id')).toBe(id);
    req.flush({});
  });

  it('no añade el header si no hay flujo activo (correlationId null)', () => {
    http.post('/api/journey/banco-a/consultar', {}).subscribe();
    const req = httpMock.expectOne('/api/journey/banco-a/consultar');
    expect(req.request.headers.has('X-Correlation-Id')).toBe(false);
    req.flush({});
  });

  it('no toca peticiones fuera de /api/journey/* (p. ej. /api/admin/*)', () => {
    store.start();
    http.get('/api/admin/partners').subscribe();
    const req = httpMock.expectOne('/api/admin/partners');
    expect(req.request.headers.has('X-Correlation-Id')).toBe(false);
    req.flush({});
  });
});

describe('correlationInterceptor (SSR / plataforma servidor)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: 'server' },
        provideHttpClient(withInterceptors([correlationInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SalesFlowStore).start();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('en el servidor no añade header (SSR-safe)', () => {
    http.post('/api/journey/banco-a/consultar', {}).subscribe();
    const req = httpMock.expectOne('/api/journey/banco-a/consultar');
    expect(req.request.headers.has('X-Correlation-Id')).toBe(false);
    req.flush({});
  });
});

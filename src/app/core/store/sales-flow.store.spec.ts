import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { SalesFlowStore } from './sales-flow.store';

describe('SalesFlowStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('correlationId: null antes de start()', () => {
    const store = TestBed.inject(SalesFlowStore);
    expect(store.correlationId()).toBeNull();
  });

  it('start(): acuña un UUID', () => {
    const store = TestBed.inject(SalesFlowStore);
    store.start();
    expect(store.correlationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('start(): idempotente — repetir no cambia el id (estable entre pasos)', () => {
    const store = TestBed.inject(SalesFlowStore);
    store.start();
    const first = store.correlationId();
    store.start();
    expect(store.correlationId()).toBe(first);
  });

  it('end(): limpia el correlationId', () => {
    const store = TestBed.inject(SalesFlowStore);
    store.start();
    store.end();
    expect(store.correlationId()).toBeNull();
  });

  it('start() tras end(): acuña un id distinto (cambia al finalizar el flujo)', () => {
    const store = TestBed.inject(SalesFlowStore);
    store.start();
    const first = store.correlationId();
    store.end();
    store.start();
    const second = store.correlationId();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });
});

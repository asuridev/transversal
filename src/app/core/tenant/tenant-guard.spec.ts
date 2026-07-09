import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UrlSegment } from '@angular/router';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { PartnersQueries } from '../../features/partners/queries/partners-queries';
import { TenantStore } from '../store/tenant.store';
import { tenantMatch } from './tenant-guard';

function segmentsFor(path: string): UrlSegment[] {
  return path
    .split('/')
    .filter((p) => p.length > 0)
    .map((p) => new UrlSegment(p, {}));
}

describe('tenantMatch', () => {
  let ensureQueryData: jasmine.Spy;

  beforeEach(() => {
    ensureQueryData = jasmine.createSpy('ensureQueryData');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: QueryClient, useValue: { ensureQueryData } },
        { provide: PartnersQueries, useValue: { activePartners: () => ({}) } },
      ],
    });
  });

  it('returns true and publishes a partner resolution for an active-partner path', async () => {
    ensureQueryData.and.returnValue(Promise.resolve(new Set(['popular'])));
    const tenantStore = TestBed.inject(TenantStore);

    const result = await TestBed.runInInjectionContext(() =>
      tenantMatch({} as never, segmentsFor('popular/oferta')),
    );

    expect(result).toBeTrue();
    expect(tenantStore.partnerSlug()).toBe('popular');
  });

  it('returns false for a non-partner path', async () => {
    ensureQueryData.and.returnValue(Promise.resolve(new Set(['popular'])));

    const result = await TestBed.runInInjectionContext(() =>
      tenantMatch({} as never, segmentsFor('no-existe')),
    );

    expect(result).toBeFalse();
  });

  it('fail-safe: publishes a fallback resolution and returns false when the source rejects', async () => {
    ensureQueryData.and.returnValue(Promise.reject(new Error('network down')));
    const tenantStore = TestBed.inject(TenantStore);

    const result = await TestBed.runInInjectionContext(() =>
      tenantMatch({} as never, segmentsFor('popular')),
    );

    expect(result).toBeFalse();
    expect(tenantStore.isFallback()).toBeTrue();
  });
});

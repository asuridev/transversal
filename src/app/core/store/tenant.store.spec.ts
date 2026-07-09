import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TenantStore } from './tenant.store';

describe('TenantStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('publishing a partner resolution updates partnerSlug/isPartner', () => {
    const store = TestBed.inject(TenantStore);

    store.setResolution({ kind: 'partner', slug: 'popular' });

    expect(store.partnerSlug()).toBe('popular');
    expect(store.isPartner()).toBeTrue();
    expect(store.isFallback()).toBeFalse();
  });

  it('publishing a fallback resolution updates isFallback', () => {
    const store = TestBed.inject(TenantStore);

    store.setResolution({ kind: 'fallback', reason: 'unknown-slug' });

    expect(store.isFallback()).toBeTrue();
    expect(store.isPartner()).toBeFalse();
    expect(store.partnerSlug()).toBeNull();
  });
});

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../../environments/environment';
import { PartnersList } from './partners-list';
import type { PartnerListItem } from '../../models/partner-admin-model';

const FIXTURE: PartnerListItem[] = [
  {
    id: 'p1',
    slug: 'popular',
    displayName: 'Banco Popular',
    status: 'active',
    credentialConfigured: true,
    currentVersion: 3,
    updatedAt: 'now',
    updatedBy: 'admin-1',
  },
  {
    id: 'p2',
    slug: 'occidente',
    displayName: 'Banco de Occidente',
    status: 'inactive',
    credentialConfigured: false,
    currentVersion: null,
    updatedAt: 'now',
    updatedBy: 'admin-1',
  },
];

describe('PartnersList', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Se accede vía `as any` a miembros `protected` (uso interno del template) —
  // no se relajan sus modificadores solo para exponerlos a los specs.
  async function createAndFlush(): Promise<ComponentFixture<PartnersList>> {
    const fixture = TestBed.createComponent(PartnersList);
    fixture.detectChanges();
    const req = httpMock.expectOne(`${environment.apiUrl}/admin/partners`);
    req.flush(FIXTURE);
    // Zoneless: `whenStable()` no rastrea las promesas internas de TanStack Query
    // (no hay zone.js parcheando microtasks) — se esperan varios macrotasks.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
    return fixture;
  }

  it('shows all partners with no filter applied', async () => {
    const fixture = await createAndFlush();
    const component = fixture.componentInstance as any;
    expect(component.filteredPartners().length).toBe(2);
  });

  // El buscador aplica un debounce de ~250ms (debounce-throttle) antes de
  // filtrar — se espera ese margen antes de leer `filteredPartners()`.
  async function waitForDebounce(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  it('filters by displayName without refetching', async () => {
    const fixture = await createAndFlush();
    const component = fixture.componentInstance as any;
    component.onSearchInput('occidente');
    await waitForDebounce();
    expect(component.filteredPartners().length).toBe(1);
    expect(component.filteredPartners()[0].slug).toBe('occidente');
  });

  it('filters by slug', async () => {
    const fixture = await createAndFlush();
    const component = fixture.componentInstance as any;
    component.onSearchInput('popular');
    await waitForDebounce();
    expect(component.filteredPartners().length).toBe(1);
  });

  it('shows an explicit empty result (not an error) for an unknown term', async () => {
    const fixture = await createAndFlush();
    const component = fixture.componentInstance as any;
    component.onSearchInput('no-existe-este-termino');
    await waitForDebounce();
    expect(component.filteredPartners().length).toBe(0);
    expect(component.partnersQuery.isError()).toBe(false);
  });
});

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { environment } from '../../../../../environments/environment';
import { PartnerCreate } from './partner-create';

describe('PartnerCreate', () => {
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

  function create() {
    const fixture = TestBed.createComponent(PartnerCreate);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any };
  }

  it('rejects an empty slug as required', () => {
    const { component } = create();
    component.form.controls.slug.markAsTouched();
    expect(component.form.controls.slug.hasError('required')).toBe(true);
  });

  it('rejects a slug with uppercase/spaces as invalid format', () => {
    const { component } = create();
    component.form.controls.slug.setValue('Banco Popular');
    expect(component.form.controls.slug.hasError('format')).toBe(true);
  });

  it('rejects a reserved slug (reuses core/tenant reserved-names)', () => {
    const { component } = create();
    component.form.controls.slug.setValue('admin');
    expect(component.form.controls.slug.hasError('reserved')).toBe(true);
  });

  it('rejects an empty displayName as required', () => {
    const { component } = create();
    component.form.controls.displayName.markAsTouched();
    expect(component.form.controls.displayName.hasError('required')).toBe(true);
  });

  it('rejects an empty partnerKey as required', () => {
    const { component } = create();
    component.form.controls.partnerKey.markAsTouched();
    expect(component.form.controls.partnerKey.hasError('required')).toBe(true);
  });

  it('rejects a partnerKey that is not a UUID as invalid format', () => {
    const { component } = create();
    component.form.controls.partnerKey.setValue('no-es-uuid');
    expect(component.form.controls.partnerKey.hasError('format')).toBe(true);
  });

  it('accepts a valid slug + partnerKey + displayName', () => {
    const { component } = create();
    component.form.controls.slug.setValue('banco-popular');
    component.form.controls.partnerKey.setValue('2efd0584-d38a-4a2f-9dd8-42f2905c3aae');
    component.form.controls.displayName.setValue('Banco Popular');
    expect(component.form.valid).toBe(true);
  });

  it('surfaces a BFF duplicate/reserved rejection as an ApiError without creating anything', async () => {
    const { fixture, component } = create();
    component.form.controls.slug.setValue('banco-popular');
    component.form.controls.partnerKey.setValue('2efd0584-d38a-4a2f-9dd8-42f2905c3aae');
    component.form.controls.displayName.setValue('Banco Popular');
    component.submit();
    // Zoneless: `whenStable()` no rastrea las promesas internas de TanStack Query
    // (no hay zone.js parcheando microtasks) — se espera un macrotask explícito.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const req = httpMock.expectOne(`${environment.apiUrl}/admin/partners`);
    req.flush(
      { code: 'invalid_input', message: 'Slug ya existe', requestId: 'r1' },
      { status: 400, statusText: 'Bad Request' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(component.serverError()).toBe('Slug ya existe');
  });
});

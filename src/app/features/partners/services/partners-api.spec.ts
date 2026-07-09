import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { PartnersApiService } from './partners-api';

describe('PartnersApiService', () => {
  let service: PartnersApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartnersApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps Forma A ({ slugs }) to a ReadonlySet<PartnerSlug>', () => {
    let result: ReadonlySet<string> | undefined;
    service.getActivePartners().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/partners/active`);
    req.flush({ slugs: ['popular', 'otrobanco'] });

    expect(result).toEqual(new Set(['popular', 'otrobanco']));
  });

  it('maps Forma B ({ partners }) filtering only active status', () => {
    let result: ReadonlySet<string> | undefined;
    service.getActivePartners().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${environment.apiUrl}/partners/active`);
    req.flush({
      partners: [
        { slug: 'popular', status: 'active' },
        { slug: 'inactivo', status: 'inactive' },
      ],
    });

    expect(result).toEqual(new Set(['popular']));
  });
});

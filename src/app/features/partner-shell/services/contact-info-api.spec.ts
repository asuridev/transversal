import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { ContactInfoApiService } from './contact-info-api';

describe('ContactInfoApiService', () => {
  let service: ContactInfoApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContactInfoApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('queryContactInfo: POST /journey/:slug/contact-info with body', () => {
    const body = { documentType: 'CC', documentNumber: '10282664' };
    service.queryContactInfo('banco-a', body).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/journey/banco-a/contact-info`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ responseHeader: { returnCode: 200, message: 'OK' }, bodyResponse: {} });
  });
});

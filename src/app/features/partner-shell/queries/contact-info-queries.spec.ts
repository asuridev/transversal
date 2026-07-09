import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { ContactInfoQueries } from './contact-info-queries';

describe('ContactInfoQueries', () => {
  let queries: ContactInfoQueries;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    queries = TestBed.inject(ContactInfoQueries);
  });

  it('queryKey incluye slug + documentType + documentNumber y enabled=true', () => {
    const opts = queries.contactInfo('banco-a', { documentType: 'CC', documentNumber: '10282664' });
    expect(opts.queryKey).toEqual(['journey', 'contact-info', 'banco-a', 'CC', '10282664']);
    expect(opts.enabled).toBeTrue();
  });

  it('enabled=false cuando falta el documento (no dispara la consulta)', () => {
    expect(queries.contactInfo('banco-a', null).enabled).toBeFalse();
    expect(queries.contactInfo(null, { documentType: 'CC', documentNumber: '1' }).enabled).toBeFalse();
  });

  it('documentos distintos producen queryKey distinta (caché por documento)', () => {
    const a = queries.contactInfo('banco-a', { documentType: 'CC', documentNumber: '1' }).queryKey;
    const b = queries.contactInfo('banco-a', { documentType: 'CC', documentNumber: '2' }).queryKey;
    expect(a).not.toEqual(b);
  });
});

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Landing } from './landing';

describe('Landing', () => {
  let fixture: ComponentFixture<Landing>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Landing],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
  });

  it('renders the neutral fallback message', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Este enlace no corresponde a un socio activo');
  });

  it('does not render any partner list/selector', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('popular');
    expect(text).not.toContain('otrobanco');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('ul, select').length).toBe(0);
  });
});

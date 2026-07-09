import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';

import { ThemeStore } from '../store/theme.store';

const FAVICON_LINK_ID = 'app-theme-favicon';
const FONT_PRELOAD_LINK_ID = 'app-theme-font-preload';
const OG_IMAGE_META_PROPERTY = 'og:image';

/**
 * Escribe el theme activo al DOM (`:root` --brand-*, favicon, preload de fuente,
 * og:image) vía un único `effect` zoneless (contract page-metadata). El título
 * del documento lo compone `TenantTitleStrategy` (A6). SSR-safe:
 * usa `DOCUMENT` inyectado, nunca `window`/`document` global. Idempotente: el
 * mismo effect corre en servidor (inline) y cliente (hidratación) sin duplicar
 * nodos ni producir parpadeo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeApplier {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly themeStore = inject(ThemeStore);

  constructor() {
    effect(() => {
      const theme = this.themeStore.theme();
      const cssVars = this.themeStore.cssVars();

      this.safely(() => this.applyCssVars(cssVars));
      this.safely(() => this.applyFavicon(theme?.assets.faviconUrl));
      this.safely(() => this.applyFontPreload(theme?.typography.fontUrlWoff2));
      this.safely(() => this.applyOgImage(theme?.assets.ogImageUrl));
    });
  }

  /** Aísla cada paso: un asset roto no debe abortar el resto del branding (FR-017). */
  private safely(step: () => void): void {
    try {
      step();
    } catch {
      // Degradar sin propagar: el resto del branding sigue aplicándose (D10).
    }
  }

  private applyCssVars(cssVars: Record<string, string>): void {
    const root = this.document.documentElement;
    for (const [prop, value] of Object.entries(cssVars)) {
      root.style.setProperty(prop, value);
    }
  }

  private applyFavicon(faviconUrl: string | undefined): void {
    if (!faviconUrl) {
      return;
    }
    // Adopta el <link rel="icon"> estático de index.html en la primera aplicación
    // (marcándolo con el id de seguimiento) en vez de crear uno nuevo — evita dos
    // favicons compitiendo en el documento (SC-007).
    let link =
      (this.document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null) ??
      this.document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      this.document.head.appendChild(link);
    }
    link.id = FAVICON_LINK_ID;
    link.href = faviconUrl;
  }

  private applyFontPreload(fontUrlWoff2: string | undefined): void {
    if (!fontUrlWoff2) {
      return;
    }
    let link = this.document.getElementById(FONT_PRELOAD_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.id = FONT_PRELOAD_LINK_ID;
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.crossOrigin = 'anonymous';
      this.document.head.appendChild(link);
    }
    link.href = fontUrlWoff2;
  }

  private applyOgImage(ogImageUrl: string | undefined): void {
    if (!ogImageUrl) {
      return;
    }
    this.meta.updateTag({ property: OG_IMAGE_META_PROPERTY, content: ogImageUrl });
  }
}

import type { NewThemeVersion } from '../../../shared/partner/partner-theme-model.ts';

// Tokens del Anexo A del spec (data-model.md → "Mapeo de marcas de validación").
// Evidencia de FR-009/SC-003: mismo esquema, marcas opuestas (verde vs. azul).

export const popularThemeFixture: NewThemeVersion = {
  tokens: {
    colorPrimary: '#00947F',
    colorPrimaryTint: '#E9F0D6',
    colorSecondary: '#8FB434',
    colorSecondaryTint: '#D2E1AE',
    colorTextStrong: '#000000',
    colorTextMuted: '#808080',
    colorSurface: '#FFFFFF',
    colorBorder: '#EBEBEB',
    // Héroe verde sólido con texto blanco; footer negro con texto blanco (Figma Popular).
    colorHeroSurface: '#00947F',
    colorHeroText: '#FFFFFF',
    colorFooterSurface: '#000000',
    colorFooterText: '#FFFFFF',
  },
  assets: {
    logoUrl: 'https://cdn.example.com/popular/logo.svg',
    faviconUrl: 'https://cdn.example.com/popular/favicon.ico',
    coBrandBankLogoUrl: 'https://cdn.example.com/popular/banco-popular.svg',
    heroImageUrl: 'https://cdn.example.com/popular/hero-handshake.jpg',
    // Sello Vigilado en la franja superior clara (misma maqueta que Occidente).
    footerSealUrl: 'https://cdn.example.com/popular/vigilado-superfinanciera.svg',
    // Footer negro: logos en su variante blanca/invertida.
    logoInverseUrl: 'https://cdn.example.com/popular/logo-inverse.svg',
    coBrandBankLogoInverseUrl: 'https://cdn.example.com/popular/banco-popular-inverse.svg',
    coBrandGroupLogoInverseUrl: 'https://cdn.example.com/popular/grupo-aval-inverse.svg',
  },
  legal: {
    footerDisclaimer: 'Vigilado por la Superintendencia Financiera de Colombia.',
  },
  typography: {
    fontFamily: 'Galano Grotesque',
  },
  createdBy: 'fixture:brands',
};

export const occidenteThemeFixture: NewThemeVersion = {
  tokens: {
    colorPrimary: '#008ACC',
    colorPrimaryTint: '#B6ECFF',
    colorSecondary: '#002449',
    colorSecondaryTint: '#CCD3DB',
    colorTextStrong: '#262626',
    colorTextMuted: '#808080',
    colorSurface: '#FFFFFF',
    colorBorder: '#CCCCCC',
    // Héroe lavanda con texto navy; footer blanco con texto oscuro (Figma Occidente).
    colorHeroSurface: '#EDEFFA',
    colorHeroText: '#021D3F',
    colorFooterSurface: '#FFFFFF',
    colorFooterText: '#313A43',
  },
  assets: {
    logoUrl: 'https://cdn.example.com/occidente/logo.svg',
    faviconUrl: 'https://cdn.example.com/occidente/favicon.ico',
    coBrandBankLogoUrl: 'https://cdn.example.com/occidente/banco-occidente.svg',
    heroImageUrl: 'https://cdn.example.com/occidente/hero-handshake.svg',
    // Sello Vigilado (franja superior) y aseguradora del programa (Seguros Alfa, derecha).
    footerSealUrl: 'https://cdn.example.com/occidente/vigilado-superfinanciera.svg',
    footerInsurerUrl: 'https://cdn.example.com/occidente/seguros-alfa.svg',
  },
  legal: {
    footerDisclaimer: 'Vigilado por la Superintendencia Financiera de Colombia.',
  },
  typography: {
    fontFamily: 'Poppins',
  },
  createdBy: 'fixture:brands',
};

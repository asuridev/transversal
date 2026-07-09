/**
 * Diagnóstico de conectividad del BFF hacia los hosts externos de Cardif a
 * través del proxy corporativo. NO levanta la app: reproduce exactamente el
 * dispatcher de proxy de `server.ts` (undici EnvHttpProxyAgent) y hace un GET
 * real a los hosts de Mashery/customer, imprimiendo la causa completa del error
 * (que el `catch` del journey-router oculta como 502).
 *
 * Uso (desde la raíz del proyecto):
 *   node --env-file=.env      scripts/proxy-diag.mjs
 *   node --env-file=.env.dev  scripts/proxy-diag.mjs
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const mask = (u) => (u ? u.replace(/(\/\/[^:]+:)[^@]+@/, '$1****@') : '(ninguno)');

console.log('Node:', process.version);
console.log('HTTPS_PROXY:', mask(process.env.HTTPS_PROXY));
console.log('HTTP_PROXY :', mask(process.env.HTTP_PROXY));
console.log('NO_PROXY   :', process.env.NO_PROXY ?? '(ninguno)');
console.log('NODE_EXTRA_CA_CERTS:', process.env.NODE_EXTRA_CA_CERTS ?? '(ninguno)');
console.log('NODE_TLS_REJECT_UNAUTHORIZED:', process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '(1 por defecto)');

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.log('\n→ Proxy dispatcher INSTALADO (igual que server.ts)');
} else {
  console.log('\n→ SIN proxy (no hay HTTPS_PROXY/HTTP_PROXY en el entorno)');
}

const authBase = process.env.MASHERY_AUTH_BASEURL || '';
const customerBase = process.env.CUSTOMER_API_BASEURL || '';

const targets = [
  authBase && `${authBase}/v1/params/__j`,
  customerBase && `${customerBase}/customer/v1/external/contact_info`,
].filter(Boolean);

for (const url of targets) {
  console.log('\n=============================================');
  console.log('GET', url, '(timeout 10s)');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { _p: 'diag', 'correlation-id': 'diag' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('✅ CONECTÓ. status =', res.status, res.statusText);
    const body = await res.text().catch(() => '');
    console.log('   body (primeros 300):', body.slice(0, 300));
  } catch (err) {
    console.log('❌ FALLÓ:', err?.name, '-', err?.message);
    let c = err?.cause;
    for (let d = 0; c && d < 6; d++, c = c?.cause) {
      console.log(`   cause[${d}]:`, c?.name, '|', c?.message, '| code=', c?.code);
    }
  }
}

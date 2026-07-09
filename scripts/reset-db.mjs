// Limpia la base de datos SQLite de partners borrando el archivo y sus
// sidecars de WAL (`-wal`, `-shm`). Al reiniciar el servidor, el repositorio
// recrea el esquema vacío (`CREATE TABLE IF NOT EXISTS`, sin seeding).
//
// Ruta: respeta `PARTNERS_DB_PATH` (igual que `persistence-config.ts`); por
// defecto `partners.db` en la raíz del proyecto. Uso: `npm run db:reset`.
//
// ⚠️ Detén el servidor antes de ejecutarlo: SQLite bloquea el archivo mientras
// corre y el WAL podría volver a escribir datos tras el borrado.

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), process.env.PARTNERS_DB_PATH ?? 'partners.db');
const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

let removed = 0;
for (const target of targets) {
  try {
    rmSync(target, { force: true });
    removed += 1;
  } catch (error) {
    console.error(`No se pudo borrar ${target}:`, error.message);
    process.exitCode = 1;
  }
}

console.log(`Base de datos limpiada (${removed}/${targets.length} archivos): ${dbPath}`);
console.log('Reinicia el servidor para recrear el esquema vacío.');

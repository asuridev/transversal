import type { PartnerRepository } from './partner-repository.ts';
import { SqlitePartnerRepository } from './sqlite/sqlite-partner-repository.ts';

export type PersistenceDriver = 'sqlite' | 'postgres';

export function createPartnerRepository(
  driver: PersistenceDriver = (process.env['PERSISTENCE_DRIVER'] as PersistenceDriver) ?? 'sqlite',
  location = process.env['PARTNERS_DB_PATH'] ?? 'partners.db',
): PartnerRepository {
  switch (driver) {
    case 'sqlite':
      return new SqlitePartnerRepository(location);
    case 'postgres':
      throw new Error('postgres adapter: hito M2 (fuera de esta feature)');
  }
}

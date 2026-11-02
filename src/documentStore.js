import { databasePool } from './database.js';
import { PostgresDocumentStore } from './postgresDocumentStore.js';

const store = databasePool ? new PostgresDocumentStore(databasePool) : null;
function requireStore() {
  if (!store) throw new Error('Database document storage is not configured');
  return store;
}
export const readDocument = (key, fallback = null) => requireStore().read(key, fallback);
export const writeDocument = (key, value) => requireStore().write(key, value);
export const updateDocument = (key, fallback, updater) => requireStore().update(key, fallback, updater);

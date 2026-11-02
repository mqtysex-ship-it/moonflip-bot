import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const defaultDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
dotenv.config({ path: path.resolve(defaultDirectory, '../.env'), quiet: true });
export function getDataDirectory(configured = process.env.MOONFLIP_DATA_DIR) {
  return configured ? path.resolve(configured) : defaultDirectory;
}

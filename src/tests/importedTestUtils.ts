import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildDataset, processFiles, textInput } from '../imported/ingest';
import { prepareImported } from '../imported/profile';
import type { BatchResult, ImportedDataset, ImportedSettings, InputFile } from '../imported/types';

export const FIXTURE_ROOT = join(process.cwd(), 'fixtures', 'import');
export const fixtureText = (name: string) => readFileSync(join(FIXTURE_ROOT, name), 'utf8');
export const fixtureInput = (name: string, path = name): InputFile => {
  const text = fixtureText(name);
  return { path, size: Buffer.byteLength(text), read: async () => text };
};
export function folderInputs(dir: string): InputFile[] {
  const out: InputFile[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const text = readFileSync(full, 'utf8');
        out.push({
          path: relative(FIXTURE_ROOT, full).replaceAll('\\', '/'),
          size: Buffer.byteLength(text),
          read: async () => text,
        });
      }
    }
  };
  walk(join(FIXTURE_ROOT, dir));
  return out;
}

export async function batchOf(inputs: InputFile[], batchId = 'batch-1'): Promise<BatchResult> {
  const result = await processFiles(inputs, { batchId, label: 'test' });
  if (!result) throw new Error('cancelled');
  return result;
}
export async function datasetOf(
  inputs: InputFile[],
  settings?: Partial<ImportedSettings>,
): Promise<ImportedDataset> {
  const dataset = buildDataset({ mode: 'replace', batch: await batchOf(inputs), synthetic: true });
  return settings ? { ...dataset, settings: { ...dataset.settings, ...settings } } : dataset;
}
export const ctxOf = (dataset: ImportedDataset) => prepareImported(dataset);
export const textFile = (path: string, text: string) => textInput(path, text);

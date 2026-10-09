import { writeFileSync } from 'node:fs';
import { generateSyntheticDataset, SEED } from '../src/data/syntheticGenerator';
const output = process.argv[2] ?? 'synthetic-dataset.json';
writeFileSync(output, JSON.stringify({ label: 'Fictional Research Dataset — Not Operational Data', seed: SEED, ...generateSyntheticDataset() }, null, 2));
console.log(`Wrote ${output}`);

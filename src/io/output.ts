import { link, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Stage complete output before replacing only the file owned by this exporter. */
export async function writeCSV(
  directory: string,
  overwrite: boolean,
  csv: string,
) {
  const outputDirectory = resolve(directory);
  await mkdir(outputDirectory, { recursive: true });
  const stage = await mkdtemp(join(outputDirectory, '.blocks-'));
  const destination = join(outputDirectory, 'blocks.csv');
  try {
    const file = join(stage, 'blocks.csv');
    await writeFile(file, csv, { flag: 'wx' });
    if (overwrite) {
      await rename(file, destination);
    } else {
      // A hard link publishes atomically and cannot replace an existing file.
      await link(file, destination);
    }
    return destination;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

#!/usr/bin/env node
import { run } from '../cli/run.ts';

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(
    'Error: ' + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
}

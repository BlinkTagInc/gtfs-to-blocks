#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { getConfig } from '../lib/file-utils.ts'
import { formatError } from '../lib/log-utils.ts'
import gtfsToBlocks from '../index.ts'

const argv = await yargs(hideBin(process.argv))
  .usage('Usage: $0 --configPath ./config.json')
  .help()
  .option('configPath', {
    alias: 'c',
    describe: 'Path to config file',
    default: './config.json',
    type: 'string',
  })
  .option('skipImport', {
    alias: 's',
    describe: 'Don’t import GTFS file.',
    type: 'boolean',
  })
  .parseAsync()

const handleError = (error: unknown = 'Unknown Error') => {
  process.stdout.write(`\n${formatError(error)}\n`)
  console.error(error)
  process.exit(1)
}

const setupImport = async () => {
  const config = await getConfig(argv)
  await gtfsToBlocks(config)
  process.exit()
}

setupImport().catch(handleError)

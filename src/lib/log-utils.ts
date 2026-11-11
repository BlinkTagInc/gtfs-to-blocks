import type { BlocksConfig } from './app-options.js'
import { clearLine, cursorTo } from 'node:readline'
import PrettyError from 'pretty-error'
import { noop } from 'lodash-es'
import chalk from 'chalk'
import Table from 'cli-table'

const pe = new PrettyError()
pe.start()

/*
 * Returns a log function based on config settings
 */
export function log(config: BlocksConfig) {
  if (config.verbose === false) {
    return noop
  }

  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string, overwrite?: boolean) => {
    if (overwrite === true && process.stdout.isTTY) {
      clearLine(process.stdout, 0)
      cursorTo(process.stdout, 0)
    } else {
      process.stdout.write('\n')
    }

    process.stdout.write(text)
  }
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config: BlocksConfig) {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatWarning(text)}\n`)
  }
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config: BlocksConfig) {
  if (config.logFunction) {
    return config.logFunction
  }

  return (text: string) => {
    process.stdout.write(`\n${formatError(text)}\n`)
  }
}

/*
 * Format console warning text
 */
export function formatWarning(text: string) {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(
    ':',
  )} ${chalk.yellow(text)}`
}

/*
 * Format console error text
 */
export function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(
    message.replace('Error: ', ''),
  )}`
}

/*
 * Print a table of stats to the console.
 */
export function logStats(config: BlocksConfig) {
  // Hide stats table from custom log functions
  if (config.logFunction) {
    return noop
  }

  return (stats: {
    trips: number
    tripSegments: number
    warnings: string[]
  }) => {
    const table = new Table({
      colWidths: [40, 20],
      head: ['Item', 'Count'],
    })

    table.push(
      ['🚍 Trips', String(stats.trips)],
      ['🕑 Trip Segments', String(stats.tripSegments)],
      ['⛔️ Warnings', String(stats.warnings.length)],
    )

    log(config)(table.toString())
  }
}

/*
 * Create progress bar text string
 */
const generateProgressBarString = (
  barTotal: number,
  barProgress: number,
  size = 40,
) => {
  const line = '-'
  const slider = '='
  if (!barTotal) {
    throw new Error('Total value is either not provided or invalid')
  }

  if (!barProgress && barProgress !== 0) {
    throw new Error('Current value is either not provided or invalid')
  }

  if (isNaN(barTotal)) {
    throw new Error('Total value is not an integer')
  }

  if (isNaN(barProgress)) {
    throw new Error('Current value is not an integer')
  }

  if (isNaN(size)) {
    throw new Error('Size is not an integer')
  }

  if (barProgress > barTotal) {
    return slider.repeat(size + 2)
  }

  const percentage = barProgress / barTotal
  const progress = Math.round(size * percentage)
  const emptyProgress = size - progress
  const progressText = slider.repeat(progress)
  const emptyProgressText = line.repeat(emptyProgress)
  return progressText + emptyProgressText
}

/*
 * Print a progress bar to the console.
 */
export function progressBar(
  formatString: string,
  barTotal: number,
  config: BlocksConfig,
) {
  let barProgress = 0

  if (config.verbose === false) {
    return {
      increment: noop,
      interrupt: noop,
    }
  }

  if (barTotal === 0) {
    return null
  }

  const renderProgressString = () =>
    formatString
      .replace('{value}', String(barProgress))
      .replace('{total}', String(barTotal))
      .replace('{bar}', generateProgressBarString(barTotal, barProgress))

  log(config)(renderProgressString(), true)

  return {
    interrupt(text: string) {
      // Log two lines to avoid overwrite by progress bar
      logWarning(config)(text)
      logWarning(config)('')
    },
    increment() {
      barProgress += 1
      log(config)(renderProgressString(), true)
    },
  }
}

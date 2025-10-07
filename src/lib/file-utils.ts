import { join, resolve } from 'node:path'
import { access, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import untildify from 'untildify'

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  try {
    const data = await readFile(
      resolve(untildify(argv.configPath)),
      'utf8',
    ).catch((error) => {
      console.error(
        new Error(
          `Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`,
        ),
      )
      throw error
    })
    const config = JSON.parse(data)

    if (argv.skipImport === true) {
      config.skipImport = argv.skipImport
    }

    return config
  } catch (error) {
    console.error(
      new Error(
        `Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`,
      ),
    )
    throw error
  }
}

/*
 * Prepare the outputPath directory for writing timetable files.
 */
export async function prepDirectory(outputPath: string, config) {
  // Check if outputPath exists
  try {
    await access(outputPath)
  } catch {
    try {
      await mkdir(outputPath, { recursive: true })
    } catch (error: unknown) {
      if (error?.code === 'ENOENT') {
        throw new Error(
          `Unable to write to ${outputPath}. Try running this command from a writable directory.`,
        )
      }

      throw error
    }
  }

  // Check if outputPath is empty
  const files = await readdir(outputPath)
  if (config.overwriteExistingFiles === false && files.length > 0) {
    throw new Error(
      `Output directory ${outputPath} is not empty. Please specify an empty directory.`,
    )
  }

  // Delete all files in outputPath if `overwriteExistingFiles` is true
  if (config.overwriteExistingFiles === true) {
    await rm(join(outputPath, '*'), { recursive: true, force: true })
  }
}

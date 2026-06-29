#!/usr/bin/env node

/**
 * CLI for Remix Import Resolver's SourceFlattener
 *
 * Usage:
 *   remix-flatten <entry.sol> [--out <file>] [--remap a=b]... [--remappings-file <path>] [--debug]
 *
 * Notes:
 * - If --out is omitted, the flattened source is written to stdout.
 * - Remappings can be provided multiple times via --remap or from a file with --remappings-file.
 */

import { SourceFlattener, NodeIOAdapter } from '../index'

interface ParsedArgs {
  entry?: string
  out?: string
  remap: string[]
  remappingsFile?: string
  debug: boolean
  cwd?: string
  help?: boolean
  pragma?: string
}

function printHelp() {
  const msg = `
Usage: remix-flatten <entry.sol> [options]

Options:
  -o, --out <file>             Write output to file (default: stdout)
  -r, --remap <a=b>            Add a remapping (can be repeated)
  -R, --remappings-file <path> Read remappings from file (solc-style)
    --pragma <range>          Override header pragma (e.g., ^0.8.26)
      --cwd <path>             Change working directory before running
      --debug                  Enable verbose logging
  -h, --help                   Show this help message

Examples:
  remix-flatten contracts/MyToken.sol
  remix-flatten contracts/MyToken.sol -o flat/MyToken.flat.sol
  remix-flatten contracts/MyToken.sol -r @openzeppelin/=node_modules/@openzeppelin/ -r contracts/=src/
  remix-flatten contracts/MyToken.sol -R remappings.txt
`
  console.log(msg)
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { remap: [], debug: false }
  const rest = argv.slice(2)
  let i = 0
  while (i < rest.length) {
    const a = rest[i]
    if (a === '-h' || a === '--help') { args.help = true; i++; continue }
    if (a === '--debug') { args.debug = true; i++; continue }
    if (a === '--cwd') { args.cwd = rest[i+1]; i += 2; continue }
    if (a === '-o' || a === '--out') { args.out = rest[i+1]; i += 2; continue }
    if (a === '-r' || a === '--remap') { args.remap.push(rest[i+1]); i += 2; continue }
    if (a === '-R' || a === '--remappings-file') { args.remappingsFile = rest[i+1]; i += 2; continue }
    if (a === '--pragma') { args.pragma = rest[i+1]; i += 2; continue }
    if (!args.entry && !a.startsWith('-')) { args.entry = a; i++; continue }
    // Unknown or malformed option – break to avoid infinite loop
    i++
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) { printHelp(); process.exit(0) }
  if (!args.entry) { console.error('Error: missing <entry.sol>'); printHelp(); process.exit(1) }
  if (args.cwd) { try { process.chdir(args.cwd) } catch (e) { console.error('Failed to chdir to', args.cwd, e); process.exit(1) } }

  const io = new NodeIOAdapter()
  const flattener = new SourceFlattener(io, args.debug)

  try {
    if (args.out) {
      const res = await flattener.flattenToFile(args.entry, args.out, {
        remappings: args.remap,
        remappingsFile: args.remappingsFile,
        pragma: args.pragma,
      })
      console.error(`Wrote flattened file to ${res.outFile} (sources: ${res.order.length})`)
    } else {
      const res = await flattener.flatten(args.entry, {
        remappings: args.remap,
        remappingsFile: args.remappingsFile,
        pragma: args.pragma,
      })
      process.stdout.write(res.flattened)
    }
  } catch (err: any) {
    console.error('Flatten failed:', err?.message || err)
    process.exit(1)
  }
}

// Execute only when run directly
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main()
}

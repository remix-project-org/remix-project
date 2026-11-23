import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import solc from 'solc'
import { prepareScriptRunner } from './script-runner'

export default async function setup() {
  if (!existsSync('dist/apps/remix-ide/index.html')) {
    throw new Error('Build Remix before running the browser tests: yarn nx build remix-ide --configuration=development')
  }
  // Serve the lockfile-pinned compiler locally, including requests from its worker.
  const directory = 'dist/apps/remix-ide/__monad-tests__'
  const longVersion = solc.version().split('.Emscripten')[0]
  const version = longVersion.split('+')[0]
  const path = `soljson-v${longVersion}.js`
  mkdirSync(directory, { recursive: true })
  copyFileSync(require.resolve('solc/soljson.js'), `${directory}/${path}`)
  writeFileSync(`${directory}/list.json`, JSON.stringify({
    builds: [{ path, version, longVersion, build: longVersion.split('+')[1] }],
    releases: { [version]: path },
    latestRelease: version
  }))
  await prepareScriptRunner()
}

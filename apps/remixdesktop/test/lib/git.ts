import { spawn, ChildProcess } from "child_process"
import * as path from "path"

export async function getBranches(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const git = spawn('git', ['branch'], { cwd: path })
        let branches = ''
        git.stdout.on('data', function (data) {
            console.log('stdout git branches', data.toString())
            branches += data.toString()
        })
        git.stderr.on('data', function (data) {
            console.log('stderr git branches', data.toString())
            reject(data.toString())
        })
        git.on('close', function () {
            resolve(branches)
        })
    })
}

export async function getGitLog(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const git = spawn('git', ['log'], { cwd: path })
        let logs = ''
        git.stdout.on('data', function (data) {
            logs += data.toString()
        })
        git.stderr.on('err', function (data) {
            reject(data.toString())
        })
        git.on('close', function () {
            resolve(logs)
        })
    })
}

export async function cloneOnServer(repo: string, path: string, name: string = 'bare') {
    console.log('cloning', repo, path)
    return new Promise((resolve, reject) => {
        const git = spawn(`rm -rf ${name} && git`, ['clone', repo], { cwd: path, shell: true, detached: true });

        git.stdout.on('data', function (data) {
            console.log('stdout data cloning', data.toString());
            if (data.toString().includes('done')) {
                resolve(git);
            }
        });

        git.stderr.on('data', function (data) {
            console.log('stderr data cloning', data.toString());
            if (data.toString().includes('into')) {
                setTimeout(() => {
                    resolve(git);
                }, 5000)
            }
        });

        git.on('error', (error) => {
            reject(`Process error: ${error.message}`);
        });

        git.on('exit', (code, signal) => {
            if (code !== 0) {
                reject(`Process exited with code: ${code} and signal: ${signal}`);
            }
        });
    });
}

export async function onLocalGitRepoAddFile(path: string, file: string) {
    console.log('adding file', file)
    return new Promise((resolve, reject) => {
        const git = spawn('touch', [file], { cwd: path });

        git.stdout.on('data', function (data) {
            console.log('stdout data adding file', data.toString());
            if (data.toString().includes('done')) {
                resolve(git);
            }
        });

        git.stderr.on('data', function (data) {
            console.error('stderr adding file', data.toString());
            reject(data.toString());
        });

        git.on('error', (error) => {
            reject(`Process error: ${error.message}`);
        });

        git.on('exit', (code, signal) => {
            if (code !== 0) {
                reject(`Process exited with code: ${code} and signal: ${signal}`);
            } else {
                resolve(git);
            }
        });
    });
}

export async function onLocalGitRepoPush(path: string, branch: string = 'master') {
    console.log('pushing', path)
    return new Promise((resolve, reject) => {
        const git = spawn('git', ['push', 'origin', branch], { cwd: path, shell: true, detached: true });

        git.stdout.on('data', function (data) {
            console.log('stdout data pushing', data.toString());
            if (data.toString().includes('done')) {
                resolve(git);
            }
        });

        git.stderr.on('data', function (data) {
            console.error('stderr data pushing', data.toString());
            if (data.toString().includes(branch)) {
                resolve(git);
            }
        });

        git.on('error', (error) => {
            reject(`Process error: ${error.message}`);
        });

        git.on('exit', (code, signal) => {
            if (code !== 0) {
                reject(`Process exited with code: ${code} and signal: ${signal}`);
            } else {
                resolve(git);
            }
        });
    });
}


export async function createCommitOnLocalServer(path: string, message: string) {
    console.log('committing', message, path)
    return new Promise((resolve, reject) => {
        const git = spawn('git add . && git', ['commit', '-m', message], { cwd: path, shell: true, detached: true });

        git.stdout.on('data', function (data) {
            console.log('data stdout committing', data.toString());
            if (data.toString().includes(message)) {
                setTimeout(() => {
                    resolve(git);
                }, 1000)
            }
        });

        git.stderr.on('data', function (data) {
            console.error('data committing', data.toString());
            reject(data.toString());
        });

        git.on('error', (error) => {
            console.error('error', error);
            reject(`Process error: ${error.message}`);
        });

        git.on('exit', (code, signal) => {
            if (code !== 0) {
                console.error('exit', code, signal);
                reject(`Process exited with code: ${code} and signal: ${signal}`);
            } else {
                resolve(git);
            }
        });
    });
}


export async function spawnGitServer(targetPath: string): Promise<ChildProcess> {
  console.log(process.cwd())
  try {
    // Kill any existing server on port 6868 first
    const killProcess = spawn('sh', ['-c', 'lsof -ti:6868 | xargs kill -9 2>/dev/null || true'])
    await new Promise((resolve) => {
      killProcess.on('exit', () => resolve(undefined))
      setTimeout(() => resolve(undefined), 2000)
    })

    // Wait for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Resolve the git backend directory relative to this file's location
    const gitBackendDir = path.resolve(__dirname, '../../../../../remix-ide-e2e/src/githttpbackend/')
    console.log('Git backend directory:', gitBackendDir)
    const server = spawn(`sh setup.sh && node ./dist/server.js "${targetPath}"`, [], { cwd: gitBackendDir, shell: true, detached: true })
    console.log('spawned', server.stdout.closed, server.stderr.closed)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Git server setup timeout'))
      }, 60000)

      server.stdout.on('data', function (data) {
        console.log('Git server stdout:', data.toString())
        if (data.toString().includes('is listening')) {
          console.log('Git server is ready')
          clearTimeout(timeout)
          resolve(server)
        }
      })
      server.stderr.on('data', function (data) {
        console.log('Git server stderr:', data.toString())
      })
      server.on('error', function(err) {
        console.error('Git server spawn error:', err)
        clearTimeout(timeout)
        reject(err)
      })
    })
  } catch (e) {
    console.log(e)
    throw e
  }
}
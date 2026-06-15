import * as http from 'http';
import { spawn } from 'child_process';
import * as path from 'path';
let backend = require('git-http-backend');
import * as zlib from 'zlib';

const directory = process.argv[2];

if (!directory) {
    console.error('Please provide a directory as a command line argument.');
    process.exit(1);
}

const server = http.createServer((req, res) => {

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        // Handle preflight request
        res.writeHead(204);
        res.end();
        return;
    }

    const repo = req.url?.split('/')[1];
    const dir = path.join(directory, 'git', repo || '');
    console.log(dir);
    const reqStream = req.headers['content-encoding'] === 'gzip' ? req.pipe(zlib.createGunzip()) : req;
    
  reqStream.pipe(backend(req.url || '', (err, service) => {
    if (err) {
      console.error('Backend error:', err);
      return res.end(err + '\n');
    }

    res.setHeader('content-type', service.type);
    console.log(service.action, repo, service.fields, 'dir:', dir);

    const ps = spawn(service.cmd, [...service.args, dir]);

    ps.on('error', (error) => {
      console.error('Git process error:', error);
    });

    ps.stderr.on('data', (data) => {
      console.error('Git stderr:', data.toString());
    });

    ps.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`Git process exited with code ${code}, signal ${signal}`);
      }
    });

    ps.stdout.pipe(service.createStream()).pipe(ps.stdin);

  })).pipe(res);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Server is already running on port 6868');
  }
  process.exit(1);
});

server.listen(6868, () => {
  console.log('Server is listening on port 6868');
});

const express = require('express')
const path = require('path')
const http = require('http')

const app = express()
const PORT = 8080
const SKILLS_HOST = '127.0.0.1'
const SKILLS_PORT = 9005

// Proxy /api/skills → ethskills server
app.get('/api/skills', (req, res) => {
  const options = {
    hostname: SKILLS_HOST,
    port: SKILLS_PORT,
    path: '/skills',
    method: 'GET',
  }
  const proxy = http.request(options, (proxyRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = proxyRes.statusCode
    proxyRes.pipe(res)
  })
  proxy.on('error', (err) => {
    res.status(502).json({ error: 'Skills server unavailable', detail: err.message })
  })
  proxy.end()
})

// Serve static Remix IDE files
app.use(express.static(path.join(__dirname, 'dist/apps/remix-ide')))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/apps/remix-ide', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Remix IDE running on http://0.0.0.0:${PORT}`)
  console.log(`Skills API proxied at http://0.0.0.0:${PORT}/api/skills`)
})

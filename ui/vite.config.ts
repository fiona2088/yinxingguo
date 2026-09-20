import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import http from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const DEFAULT_RAGFLOW_SHARED_ID = '33736956245f11f1bc3f03b00ca06fff'
const DEFAULT_RAGFLOW_AUTH = 'MO0yd2-Zv2zXkYbbvFdnRVIUOUhhjODs'

function probeRagflowPort(port: number, sharedId: string, auth: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: 'localhost',
        port,
        path: `/api/next-chats/share?shared_id=${sharedId}&from=chat&auth=${auth}&locale=zh&theme=dark`,
        method: 'GET',
        timeout: 1200,
      },
      (res) => {
        // Any HTTP response from this route means the service is reachable.
        resolve(typeof res.statusCode === 'number')
        res.resume()
      },
    )

    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

async function detectRagflowTarget(envPortRaw: string | undefined, sharedId: string, auth: string): Promise<string> {
  const envPort = Number(envPortRaw)
  const candidatePorts = [
    Number.isFinite(envPort) && envPort > 0 ? envPort : null,
    80,
    9380,
    8080,
    8000,
    7860,
  ].filter((port): port is number => port !== null)

  for (const port of candidatePorts) {
    // Probe known ports in order and pick the first reachable endpoint.
    if (await probeRagflowPort(port, sharedId, auth)) {
      return `http://localhost:${port}`
    }
  }

  // Fall back to default local HTTP port when not detected.
  return 'http://localhost:80'
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const ragflowSharedId = env.RAGFLOW_SHARED_ID || DEFAULT_RAGFLOW_SHARED_ID
  const ragflowAuth = env.RAGFLOW_SHARE_AUTH || DEFAULT_RAGFLOW_AUTH
  const ragflowApiKey = env.RAGFLOW_API_KEY || ''
  const useMockAiSse = (env.VITE_USE_MOCK_AI_SSE || '').toLowerCase() === 'true'
  const backendTarget = (env.VITE_BACKEND_BASE_URL || 'http://47.108.210.14:8080').trim().replace(/\/$/, '')

  const ragflowBaseUrl = (env.RAGFLOW_BASE_URL || '').trim()
  const ragflowTarget = ragflowBaseUrl
    ? ragflowBaseUrl.replace(/\/$/, '')
    : await detectRagflowTarget(env.RAGFLOW_PORT, ragflowSharedId, ragflowAuth)
  console.log(`[vite] RAGFlow proxy target: ${ragflowTarget}`)
  if (ragflowBaseUrl) {
    console.log('[vite] Using RAGFLOW_BASE_URL override from environment')
  }
  if (ragflowApiKey) {
    console.log('[vite] RAGFlow API key loaded from environment')
  } else {
    console.log('[vite] RAGFlow API key is not set')
  }
  if (useMockAiSse) {
    console.log('[vite] Mock AI API enabled at POST /ai/chat')
  }
  console.log(`[vite] Backend API proxy target: ${backendTarget}`)

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
        // Add app directory alias
        'app': path.resolve(__dirname, './app'),
      },
    },
    root: __dirname,
    base: './',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      configureServer(server) {
        if (!useMockAiSse) {
          return
        }

        server.middlewares.use('/api/ai/chat', (req, res, next) => {
          if (req.method !== 'POST') {
            next()
            return
          }

          const requestUrl = new URL(req.url || '/api/ai/chat', 'http://localhost')
          const username = (requestUrl.searchParams.get('userName') || 'mock-user').trim()
          const message = (requestUrl.searchParams.get('message') || '').trim()

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')

          const reply = `你好 ${username}，这是本地普通 POST 模拟回复。收到问题：${message || '（空消息）'}`
          const payload = {
            code: 200,
            msg: '请求成功',
            data: {
              columnNames: null,
              datas: [
                {
                  content: reply,
                },
              ],
            },
            total: null,
          }

          res.end(JSON.stringify(payload))
        })
      },
      proxy: {
        '/api/admin': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api/database': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api/ai': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api/next-chats': {
          target: ragflowTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: ragflowTarget,
          changeOrigin: true,
          secure: false,
          headers: ragflowApiKey
            ? {
              Authorization: `Bearer ${ragflowApiKey}`,
            }
            : {},
        },
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})

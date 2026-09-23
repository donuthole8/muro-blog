import { createFileRoute } from '@tanstack/react-router'
import { site } from '../lib/site'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /settings
Disallow: /notifications
Disallow: /following
Disallow: /welcome
Disallow: /auth/

Sitemap: ${site.url}/sitemap.xml
`

        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})

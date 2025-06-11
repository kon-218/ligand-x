/**
 * Next.js Instrumentation
 * 
 * This file runs at the moment the server or edge runtime starts.
 * It's the perfect place to handle environment-specific shimming that
 * usually happens in next.config.js.
 * 
 * Use cases:
 * - Global polyfills for server-side code
 * - Shimming Node-only libraries that leak into Server Components
 * - OpenTelemetry or other observability setup
 * - Database connection pooling initialization
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side initialization
    console.log('[Instrumentation] Server runtime initialized')
    
    // Example: If certain Node-only libraries are still leaking into
    // Server Components despite Turbopack/Webpack config, you can
    // shim them here globally:
    //
    // if (typeof globalThis.someNodeOnlyGlobal === 'undefined') {
    //   globalThis.someNodeOnlyGlobal = () => null
    // }
  }

  // Edge runtime initialization
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('[Instrumentation] Edge runtime initialized')
    
    // Edge-specific polyfills if needed
  }
}

/**
 * Optional: onRequestError hook for error tracking
 * Useful for integrating with error monitoring services
 */
export function onRequestError(
  error: { digest: string } & Error,
  request: {
    path: string
    method: string
    headers: { [key: string]: string }
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routePath: string
    routeType: 'render' | 'route' | 'action' | 'middleware'
    renderSource: 'react-server-components' | 'react-server-components-payload' | 'server-rendering'
    revalidateReason: 'on-demand' | 'stale' | undefined
    renderType: 'dynamic' | 'dynamic-resume'
  }
) {
  // Log errors for debugging (in production, send to error tracking service)
  console.error('[Instrumentation] Request error:', {
    digest: error.digest,
    message: error.message,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}

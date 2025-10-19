/**
 * Flask-based structure service provider for Ketcher
 * This replaces the Indigo service with local Flask/RDKit backend
 * 
 * The RemoteStructServiceProvider expects endpoints at /indigo/* paths,
 * so we configure it to point directly to our Flask /api/ketcher path
 */

import { RemoteStructServiceProvider } from 'ketcher-core'

// Flask backend URL - uses the same API URL as the rest of the app
const FLASK_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Create and export the Flask-based structure service provider
 * 
 * The RemoteStructServiceProvider will append /indigo to the base URL,
 * so we need to configure Flask to handle requests at /api/ketcher/indigo/*
 * OR we provide just /api/ketcher and let it work without the /indigo suffix
 */
export function createFlaskStructServiceProvider(apiUrl?: string) {
  const baseUrl = apiUrl || FLASK_API_URL
  
  // RemoteStructServiceProvider will make requests to:
  // - {baseUrl}/info
  // - {baseUrl}/convert
  // - {baseUrl}/layout
  // etc.
  //
  // We configure it to use /api/ketcher as the base, which matches our Flask endpoints
  return new RemoteStructServiceProvider(`${baseUrl}/api/ketcher`, {
    // Optional configuration
  })
}

// Export the provider instance
export const flaskStructServiceProvider = createFlaskStructServiceProvider()

import type { NextConfig } from "next";
import path from "path";

// Conditionally load bundle analyzer if available
let withBundleAnalyzer = (config: NextConfig) => config;
try {
  const bundleAnalyzer = require('@next/bundle-analyzer');
  withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === 'true',
  });
} catch (e) {
  // Bundle analyzer not installed, skip it
  console.log('Bundle analyzer not available, skipping...');
}

const nextConfig: NextConfig = {
  compress: true, // Enable gzip compression
  output: 'standalone',
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Turbopack configuration
  turbopack: {
    resolveAlias: {
      // Fix ketcher-standalone and paper.js module resolution issues
      // Point to empty modules to prevent Node.js-specific code from loading
      'jsdom/lib/jsdom/living/generated/utils': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      'idom/lib/idom/living/generated/utils': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      'canvas': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      'jsdom': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      // Paper.js node-specific files - these try to import jsdom/canvas which don't work in browser
      'paper/dist/node/canvas.js': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      'paper/dist/node/self.js': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      'paper/dist/node/extend.js': path.resolve(__dirname, 'src/lib/empty-module.ts'),
    },
  },

  experimental: {
  },
  // Webpack configuration (fallback for non-Turbopack builds)
  webpack: (config, { isServer, webpack }) => {
    // Enable async WebAssembly
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Handle Node.js modules that shouldn't be bundled for client-side
    if (!isServer) {
      // Optimization: Split large third-party packages into separate chunks
      if (config.optimization) {
        config.optimization.splitChunks = {
          ...config.optimization.splitChunks,
          cacheGroups: {
            ...config.optimization.splitChunks?.cacheGroups,
            plotly: {
              test: /[\\/]node_modules[\\/](plotly\.js|react-plotly\.js)[\\/]/,
              name: 'plotly',
              chunks: 'all',
              priority: 30,
              reuseExistingChunk: true,
            },
            ketcher: {
              test: /[\\/]node_modules[\\/](ketcher-react|ketcher-core|ketcher-standalone|indigo-ketcher)[\\/]/,
              name: 'ketcher',
              chunks: 'all',
              priority: 20,
              reuseExistingChunk: true,
            },
          },
        };
      }

      // Add rule for WASM files
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'webassembly/async',
      });

      // Set fallbacks for Node.js built-in modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
        child_process: false,
        // Specifically handle jsdom and canvas
        jsdom: false,
        canvas: false,
        'jsdom/lib/jsdom/living/generated/utils': false,
      };

      // Create aliases to prevent Node.js-specific modules from being loaded
      config.resolve.alias = {
        ...config.resolve.alias,


        // Explicitly ignore paper.js node modules using absolute paths
        [path.resolve(__dirname, 'node_modules/paper/dist/node/extend.js')]: false,
        [path.resolve(__dirname, 'node_modules/paper/dist/node/self.js')]: false,
        [path.resolve(__dirname, 'node_modules/paper/dist/node/canvas.js')]: false,

        'canvas': false,
        'jsdom': false,

        // Alias the specific jsdom utils path to empty module
        'jsdom/lib/jsdom/living/generated/utils': path.resolve(__dirname, 'src/lib/empty-module.ts'),
      };

      // Use IgnorePlugin to prevent bundling of these modules
      config.plugins.push(
        new webpack.IgnorePlugin({
          // Only ignore canvas imports that originate from ketcher/paper.js — not from plotly or other packages
          resourceRegExp: /^canvas$/,
          contextRegExp: /ketcher|paper/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /jsdom/,
        }),
        new webpack.NormalModuleReplacementPlugin(
          /paper\/dist\/node\/canvas\.js/,
          path.resolve(__dirname, 'src/lib/empty-module.ts')
        ),
        new webpack.NormalModuleReplacementPlugin(
          /paper\/dist\/node\/self\.js/,
          path.resolve(__dirname, 'src/lib/empty-module.ts')
        ),
        new webpack.NormalModuleReplacementPlugin(
          /paper\/dist\/node\/extend\.js/,
          path.resolve(__dirname, 'src/lib/empty-module.ts')
        )
      );
    }


    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/qc/:path*',
        destination: 'http://gateway:8000/api/qc/:path*', // Proxy to Gateway
      },
      {
        source: '/api/md/:path*',
        destination: 'http://gateway:8000/api/md/:path*', // Proxy to Gateway
      },
      {
        source: '/api/docking/:path*',
        destination: 'http://gateway:8000/api/docking/:path*', // Proxy to Gateway
      },
      {
        source: '/api/admet/:path*',
        destination: 'http://gateway:8000/api/admet/:path*', // Proxy to Gateway
      },
      {
        source: '/api/boltz2/:path*',
        destination: 'http://gateway:8000/api/boltz2/:path*', // Proxy to Gateway
      },
      {
        source: '/api/abfe/:path*',
        destination: 'http://gateway:8000/api/abfe/:path*', // Proxy to Gateway
      },
      {
        source: '/api/rbfe/:path*',
        destination: 'http://gateway:8000/api/rbfe/:path*', // Proxy to Gateway
      },
      {
        source: '/api/jobs/:path*',
        destination: 'http://gateway:8000/api/jobs/:path*', // Proxy to Gateway - Unified job management
      },
      {
        source: '/api/msa/:path*',
        destination: 'http://gateway:8000/api/msa/:path*', // Proxy to Gateway
      },
      {
        source: '/api/molecules/:path*',
        destination: 'http://gateway:8000/api/molecules/:path*', // Proxy to Gateway
      },
      {
        source: '/api/structure/:path*',
        destination: 'http://gateway:8000/api/structure/:path*', // Proxy to Gateway
      },
      {
        source: '/api/structures/:path*',
        destination: 'http://gateway:8000/api/structures/:path*', // Proxy to Gateway
      },
      {
        source: '/api/alignment/:path*',
        destination: 'http://gateway:8000/api/alignment/:path*', // Proxy to Gateway
      },
      {
        source: '/api/services/:path*',
        destination: 'http://gateway:8000/api/services/:path*', // Proxy to Gateway
      },
      {
        source: '/api/library/:path*',
        destination: 'http://gateway:8000/api/library/:path*', // Proxy to Gateway
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*.wasm',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);

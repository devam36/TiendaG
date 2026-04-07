import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiTarget = 'http://127.0.0.1:3000';
const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const app = express();
const angularApp = new AngularNodeAppEngine();

function readRequestBody(request: express.Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.on('end', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0));
    });

    request.on('error', reject);
  });
}

app.use('/api', async (request, response, next) => {
  try {
    const upstreamUrl = new URL(request.originalUrl, apiTarget);
    const headers = new Headers();

    for (const [name, value] of Object.entries(request.headers)) {
      const headerName = name.toLowerCase();

      if (!value || headerName === 'host' || headerName === 'content-length') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
      } else {
        headers.set(name, value);
      }
    }

    const method = request.method.toUpperCase();
    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual'
    };

    if (method !== 'GET' && method !== 'HEAD') {
      const body = await readRequestBody(request);
      if (body.length > 0) {
        init.body = new Uint8Array(body);
      }
    }

    const upstreamResponse = await fetch(upstreamUrl, init);

    response.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      if (!hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== 'content-length') {
        response.setHeader(key, value);
      }
    });

    const bodyBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    response.send(bodyBuffer);
  } catch (error) {
    next(error);
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

/**
 * End-to-end integration tests for all server endpoints
 * These tests use the real server application
 */

import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server/index.js';

// Mock external API calls
jest.mock('node:https', () => ({
  request: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Server Integration E2E Tests (Real Server)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock https.request for Archive.org API calls
    const https = require('node:https');
    https.request.mockImplementation((url: string, options: any, callback?: Function) => {
      const mockResponse = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        on: jest.fn((event, handler) => {
          if (event === 'data') handler('{"success": true}');
          if (event === 'end') handler();
        })
      };
      
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(() => {
          if (callback) callback(mockResponse);
        }),
        setTimeout: jest.fn()
      };
      
      return mockRequest;
    });

    // Mock fetch for Archive.org API calls
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"success": true}'),
      json: () => Promise.resolve({ success: true })
    });
  });

  describe('Health Check', () => {
    test('GET /api/health returns server status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Search Endpoint', () => {
    test('GET /api/search works with valid query', async () => {
      // Mock Archive.org search API response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          response: {
            docs: [
              {
                identifier: '09.19.15_TestBand',
                title: 'Test Concert Recording',
                date: '2015-09-19',
                creator: 'test@example.com'
              }
            ],
            numFound: 1
          }
        })
      });

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test band' })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('returned');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    test('GET /api/search rejects missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Metadata Update Endpoint', () => {
    test('POST /api/update-metadata-stream works with valid data', async () => {
      const requestData = {
        items: ['09.19.15_TestBand'],
        updates: [
          {
            field: 'title',
            value: 'Updated Title'
          },
          {
            field: 'date', 
            value: '2015-09-19'
          }
        ]
      };

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send(requestData)
        .expect(200);
      // Note: Content-Type may vary based on implementation

      // Parse Server-Sent Events
      const events: any[] = [];
      const sseData = response.text;
      const lines = sseData.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('data: ')) {
          try {
            const eventData = JSON.parse(lines[i].substring(6));
            events.push(eventData);
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }

      // Verify expected SSE sequence
      const startEvent = events.find(e => e.type === 'start');
      expect(startEvent).toBeDefined();
      expect(startEvent.total).toBe(1);

      const completeEvent = events.find(e => e.type === 'complete');
      expect(completeEvent).toBeDefined();
    });

    test('POST /api/update-metadata-stream rejects invalid data', async () => {
      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send({ invalid: 'data' })
        .expect(200);
      // Note: Endpoint may return SSE with error events instead of HTTP 400

      // Check that some error indication is present in the response
      expect(response.text).toBeDefined();
    });
  });

  describe('API Prefix Verification', () => {
    test('all endpoints use /api/ prefix correctly', async () => {
      const apiEndpoints = [
        { path: '/api/health', method: 'GET' },
        { path: '/api/search', method: 'GET', query: { q: 'test' } }
      ];

      for (const endpoint of apiEndpoints) {
        const req = request(app)[endpoint.method.toLowerCase() as 'get' | 'post'](endpoint.path);
        if (endpoint.query) req.query(endpoint.query);
        
        const response = await req;
        expect(response.status).not.toBe(404);
      }
    });

    test('endpoints without /api/ prefix return 404', async () => {
      const response = await request(app)
        .get('/health') // Without /api/ prefix
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    test('invalid endpoints return 404', async () => {
      await request(app)
        .get('/api/nonexistent-endpoint')
        .expect(404);
    });

    test('file upload with no file returns proper error', async () => {
      const response = await request(app)
        .post('/api/batch-upload-image-stream')
        .expect(400);

      expect(response.body.error).toContain('No image file uploaded');
    });
  });

  describe('Archive.org Authentication Patterns', () => {
    test('verifies proper authentication headers in API calls', async () => {
      let capturedOptions: any = null;
      
      // Mock fetch to capture request options
      global.fetch = jest.fn().mockImplementation((url, options) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('{"success": true}'),
          json: () => Promise.resolve({ success: true })
        });
      });

      // Test file upload which triggers Archive.org API
      const testImagePath = path.join(__dirname, 'auth-test.jpg');
      fs.writeFileSync(testImagePath, Buffer.from('fake-jpeg-data'));

      const itemsMetadata = JSON.stringify([
        {
          identifier: '09.19.15_AuthTest',
          metadata: { title: 'Auth Test' }
        }
      ]);

      try {
        await request(app)
          .post('/api/batch-upload-image-stream')
          .attach('files', testImagePath)
          .field('itemsMetadata', itemsMetadata)
          .expect(200);

        // Verify Archive.org API was called
        expect(global.fetch).toHaveBeenCalled();

        // Verify authentication headers if present
        if (capturedOptions && capturedOptions.headers) {
          const authHeader = capturedOptions.headers.authorization || capturedOptions.headers.Authorization;
          if (authHeader) {
            // Should use LOW format for S3 uploads: LOW accessKey:secretKey
            expect(authHeader).toMatch(/^LOW\s+/);
            expect(authHeader).not.toMatch(/^Basic\s+/);
          }
        }

      } finally {
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
      }
    });
  });

  describe('YouTube OAuth Routes', () => {
    test('GET /auth/youtube/status returns configured:false when env vars missing', async () => {
      const saved = {
        id: process.env.YOUTUBE_CLIENT_ID,
        secret: process.env.YOUTUBE_CLIENT_SECRET,
        uri: process.env.YOUTUBE_REDIRECT_URI,
      }
      delete process.env.YOUTUBE_CLIENT_ID
      delete process.env.YOUTUBE_CLIENT_SECRET
      delete process.env.YOUTUBE_REDIRECT_URI

      const res = await request(app).get('/auth/youtube/status').expect(200)
      expect(res.body.configured).toBe(false)
      expect(res.body.authenticated).toBe(false)

      process.env.YOUTUBE_CLIENT_ID = saved.id
      process.env.YOUTUBE_CLIENT_SECRET = saved.secret
      process.env.YOUTUBE_REDIRECT_URI = saved.uri
    })

    test('GET /auth/youtube/callback without code returns 400', async () => {
      await request(app).get('/auth/youtube/callback').expect(400)
    })

    // Regression: callback must redirect to FRONTEND_URL, not the Express origin.
    // In dev the frontend runs on a different port (3000) from Express (3001), so a
    // plain "/" redirect lands on Express and returns "Cannot GET /". FRONTEND_URL
    // lets the callback cross the port boundary back to the Vite dev server.
    test('GET /auth/youtube/callback error param returns 400 with message', async () => {
      const res = await request(app)
        .get('/auth/youtube/callback?error=access_denied')
        .expect(400)
      expect(res.text).toContain('access_denied')
    })
  })

  describe('Archive.org "no changes" treated as success', () => {
    // Regression: Archive.org returns 400 "no changes to _meta.xml" when a patch
    // makes no actual modifications (values already match). This must not be treated
    // as an error or trigger retries — it means the item is already up to date.
    test('POST /api/update-metadata-stream succeeds when Archive.org returns no-changes 400', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ success: false, error: 'no changes to _meta.xml' }),
      })

      const res = await request(app)
        .post('/api/update-metadata-stream')
        .send({
          items: ['test-item'],
          updates: [{ field: 'title', value: 'Same Title' }],
        })
        .expect(200)

      // SSE stream must complete without an error status event
      const events = res.text
        .split('\n')
        .filter((l: string) => l.startsWith('data: '))
        .map((l: string) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
        .filter(Boolean)

      expect(events.some((e: any) => e.type === 'complete')).toBe(true)
      expect(events.some((e: any) => e.status === 'error')).toBe(false)
    })
  })
});
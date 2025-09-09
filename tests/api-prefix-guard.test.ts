/**
 * API Prefix Guard Integration Tests
 * 
 * These tests verify that all endpoints use the correct /api/ prefix
 * by making actual HTTP requests to ensure consistency between client and server.
 */

import request from 'supertest';
import app from '../server/index.js';

describe('API Prefix Guard E2E Tests', () => {

  describe('API Endpoints - /api/ Prefix Required', () => {
    const apiEndpoints = [
      { path: '/api/health', method: 'GET' },
      { path: '/api/search', method: 'GET', query: { q: 'test' } },
      { path: '/api/update-metadata-stream', method: 'POST', body: { items: [] } },
      { path: '/api/batch-upload-image-stream', method: 'POST' }
    ];

    test.each(apiEndpoints)('$path responds correctly with /api/ prefix', async ({ path, method, query, body }) => {
      const req = request(app)[method.toLowerCase() as 'get' | 'post'](path);
      
      if (query) req.query(query);
      if (body) req.send(body);

      // Should get a valid response (not 404)
      const response = await req;
      expect(response.status).not.toBe(404);
    });

    test.each(apiEndpoints)('$path returns 404 without /api/ prefix', async ({ path, method, query, body }) => {
      const pathWithoutApi = path.replace('/api/', '/');
      const req = request(app)[method.toLowerCase() as 'get' | 'post'](pathWithoutApi);
      
      if (query) req.query(query);
      if (body) req.send(body);

      // Should return 404 when missing /api/ prefix
      const response = await req;
      expect(response.status).toBe(404);
    });
  });

  describe('Auth Endpoints - No /api/ Prefix', () => {
    // Auth endpoints should NOT have /api/ prefix
    test('/auth paths should work without /api/ prefix', async () => {
      // We can't test actual auth endpoints without OAuth setup,
      // but we can verify the pattern by testing that /api/auth returns 404
      const response = await request(app)
        .get('/api/auth/youtube/status');
      
      expect(response.status).toBe(404);
    });
  });

  describe('Endpoint Pattern Verification', () => {
    test('all functional endpoints use /api/ prefix', async () => {
      const functionalEndpoints = [
        '/api/health',
        '/api/search?q=test'
      ];

      for (const endpoint of functionalEndpoints) {
        const [path, queryString] = endpoint.split('?');
        let req = request(app).get(path);
        
        if (queryString) {
          const params = new URLSearchParams(queryString);
          for (const [key, value] of params.entries()) {
            req = req.query({ [key]: value });
          }
        }
        
        const response = await req;
        expect(response.status).not.toBe(404);
      }
    });

    test('server rejects non-existent endpoints', async () => {
      const nonExistentEndpoints = [
        '/api/nonexistent',
        '/api/fake-endpoint',
        '/not-api/anything'
      ];

      for (const endpoint of nonExistentEndpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(404);
      }
    });
  });

  describe('Consistency Verification', () => {
    test('endpoints maintain consistent behavior', async () => {
      // Test that health endpoint always responds the same way
      const response1 = await request(app).get('/api/health');
      const response2 = await request(app).get('/api/health');
      
      expect(response1.status).toBe(response2.status);
      expect(response1.body.status).toBe(response2.body.status);
      expect(response1.body.status).toBe('ok');
    });

    test('search endpoint requires query parameter', async () => {
      // Without query - should fail
      const noQuery = await request(app).get('/api/search');
      expect(noQuery.status).toBe(400);
      
      // With query - should succeed  
      const withQuery = await request(app).get('/api/search?q=test');
      expect(withQuery.status).toBe(200);
    });

    test('POST endpoints reject GET requests where appropriate', async () => {
      const postOnlyEndpoints = [
        '/api/update-metadata-stream',
        '/api/batch-upload-image-stream'
      ];

      for (const endpoint of postOnlyEndpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(404); // Express returns 404 for method not allowed
      }
    });
  });
});
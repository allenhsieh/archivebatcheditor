/**
 * Replace-First Metadata Operations Integration Tests
 *
 * These tests verify the replace-first-then-add pattern:
 * - Replace is attempted first to update existing fields without creating duplicates
 *   (e.g. avoids a second "band" tag if one already exists)
 * - If replace fails (field doesn't exist yet), add is used as a fallback
 * - The add fallback is forced even when the update has an explicit 'replace' operation,
 *   so the fallback actually works instead of silently retrying replace
 */

import request from 'supertest';
import app from '../server/index.js';

// Parse the JSON Patch payload from a URL-encoded request body
function parsePatch(body: string): { op: string; path: string; value: string }[] {
  const params = new URLSearchParams(body)
  const patch = params.get('-patch')
  return patch ? JSON.parse(patch) : []
}

describe('Replace-First-Then-Add Metadata Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ARCHIVE_ACCESS_KEY = 'test-access-key'
    process.env.ARCHIVE_SECRET_KEY = 'test-secret-key'
    process.env.ARCHIVE_EMAIL = 'test@example.com'
  })

  afterEach(() => {
    delete process.env.ARCHIVE_ACCESS_KEY
    delete process.env.ARCHIVE_SECRET_KEY
    delete process.env.ARCHIVE_EMAIL
  })

  describe('Operation Order', () => {
    test('replace is sent in the first API call', async () => {
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          metadataCalls.push({ patch: parsePatch(options.body.toString()) })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true })
        })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_TestBand'], updates: [{ field: 'band', value: 'Test Band' }] })
        .expect(200)

      expect(metadataCalls.length).toBe(1) // Only one call when replace succeeds
      expect(metadataCalls[0].patch[0].op).toBe('replace')
    })

    test('add is used as fallback when replace fails', async () => {
      let metadataCallCount = 0
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (!url.includes('/metadata/')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
        }

        metadataCallCount++
        metadataCalls.push({ patch: parsePatch(options.body.toString()) })

        if (metadataCallCount === 1) {
          // First call: replace fails because the field doesn't exist yet
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ success: false, error: 'field not found' })
          })
        }

        // Second call: add succeeds
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_TestBand'], updates: [{ field: 'band', value: 'Test Band' }] })
        .expect(200)

      // Expect two calls: replace (fails) then add (succeeds)
      expect(metadataCalls.length).toBeGreaterThanOrEqual(2)
      expect(metadataCalls[0].patch[0].op).toBe('replace')
      const addCall = metadataCalls.find(c => c.patch[0].op === 'add')
      expect(addCall).toBeDefined()
    })

    test('fallback add overrides explicit per-field replace operation', async () => {
      let metadataCallCount = 0
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (!url.includes('/metadata/')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
        }

        metadataCallCount++
        metadataCalls.push({ patch: parsePatch(options.body.toString()) })

        if (metadataCallCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ success: false, error: 'path not found' })
          })
        }

        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      // All fields have explicit operation: 'replace' — the fallback must still force 'add'
      await request(app)
        .post('/api/update-metadata-stream')
        .send({
          items: ['09.19.15_TestBand'],
          updates: [
            { field: 'band', value: 'Test Band', operation: 'replace' },
            { field: 'venue', value: 'The Venue', operation: 'replace' }
          ]
        })
        .expect(200)

      expect(metadataCalls.length).toBeGreaterThanOrEqual(2)
      // The add fallback must force all operations to 'add', not keep 'replace'
      const addCall = metadataCalls.find(c => c.patch.every(p => p.op === 'add'))
      expect(addCall).toBeDefined()
    })

    test('successful replace makes only one API call per item', async () => {
      const metadataCalls: string[] = [] // track which identifiers were called

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/metadata/')) {
          metadataCalls.push(url)
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_TestBand'], updates: [{ field: 'band', value: 'Test Band' }] })
        .expect(200)

      // When replace succeeds there is no add fallback — exactly 1 call
      const callsForItem = metadataCalls.filter(u => u.includes('09.19.15_TestBand'))
      expect(callsForItem.length).toBe(1)
    })
  })

  describe('Authorization', () => {
    test('metadata updates use LOW authorization format', async () => {
      let capturedAuth: string | undefined

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          capturedAuth = options.headers?.Authorization || options.headers?.authorization
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_TestBand'], updates: [{ field: 'band', value: 'Test Band' }] })
        .expect(200)

      expect(capturedAuth).toBeDefined()
      expect(capturedAuth).toMatch(/^LOW\s+/)
      expect(capturedAuth).toContain('test-access-key:test-secret-key')
    })
  })

  describe('Field Processing', () => {
    test('date is standardized to YYYY-MM-DD before sending', async () => {
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          metadataCalls.push({ patch: parsePatch(options.body.toString()) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['01.05.12_DateTest'], updates: [{ field: 'date', value: '03/15/2015' }] })
        .expect(200)

      expect(metadataCalls.length).toBeGreaterThan(0)
      const datePatch = metadataCalls[0].patch.find(p => p.path === '/date')
      expect(datePatch?.value).toBe('2015-03-15')
    })

    test('youtube URL is standardized to youtu.be short format before sending', async () => {
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          metadataCalls.push({ patch: parsePatch(options.body.toString()) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({
          items: ['07.15.13_YouTubeTest'],
          updates: [{ field: 'youtube', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]
        })
        .expect(200)

      expect(metadataCalls.length).toBeGreaterThan(0)
      const youtubePatch = metadataCalls[0].patch.find(p => p.path === '/youtube')
      expect(youtubePatch?.value).toBe('https://youtu.be/dQw4w9WgXcQ')
    })

    test('patch path uses /field format (not /metadata/field)', async () => {
      const metadataCalls: { patch: ReturnType<typeof parsePatch> }[] = []

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          metadataCalls.push({ patch: parsePatch(options.body.toString()) })
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['test_item'], updates: [{ field: 'title', value: 'My Title' }] })
        .expect(200)

      expect(metadataCalls.length).toBeGreaterThan(0)
      const titlePatch = metadataCalls[0].patch.find(p => p.path === '/title')
      expect(titlePatch).toBeDefined()
      // Ensure path is /field, not /metadata/field
      expect(titlePatch?.path).toBe('/title')
      expect(titlePatch?.path).not.toContain('/metadata/')
    })
  })

  describe('Bulk Operations', () => {
    test('each item in a bulk update uses replace-first independently', async () => {
      const metadataCallsByItem: Record<string, ReturnType<typeof parsePatch>[]> = {}

      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/metadata/')) {
          const match = url.match(/\/metadata\/([^/?]+)/)
          const id = match?.[1] ?? 'unknown'
          if (!metadataCallsByItem[id]) metadataCallsByItem[id] = []
          metadataCallsByItem[id].push(parsePatch(options.body.toString()))
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      await request(app)
        .post('/api/update-metadata-stream')
        .send({
          items: ['09.19.15_Item1', '06.14.14_Item2', '01.05.12_Item3'],
          updates: [{ field: 'band', value: 'Test Band' }]
        })
        .expect(200)

      for (const id of ['09.19.15_Item1', '06.14.14_Item2', '01.05.12_Item3']) {
        expect(metadataCallsByItem[id]).toBeDefined()
        expect(metadataCallsByItem[id][0][0].op).toBe('replace') // First call is replace
      }
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('empty updates array completes without making metadata API calls', async () => {
      const metadataCalls: string[] = []

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/metadata/')) metadataCalls.push(url)
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
      })

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_EmptyTest'], updates: [] })
        .expect(200)

      expect(response.text).toContain('complete')
      expect(metadataCalls.length).toBe(0)
    })

    test('malformed request body returns error in SSE stream', async () => {
      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: 'not-an-array', updates: 'not-an-array' })
        .expect(200)

      expect(response.text).toContain('error')
      expect(response.text).toContain('Invalid request format')
    })

    test('SSE response includes start and complete events', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
      })

      const response = await request(app)
        .post('/api/update-metadata-stream')
        .send({ items: ['09.19.15_TestBand'], updates: [{ field: 'band', value: 'Test Band' }] })
        .expect(200)

      const events = response.text
        .split('\n')
        .filter(l => l.startsWith('data: '))
        .map(l => { try { return JSON.parse(l.slice(6)) } catch { return null } })
        .filter(Boolean)

      expect(events.find(e => e.type === 'start')).toBeDefined()
      expect(events.find(e => e.type === 'complete')).toBeDefined()
    })
  })
})

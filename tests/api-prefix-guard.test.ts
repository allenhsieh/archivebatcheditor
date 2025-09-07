/**
 * API Prefix Guard Tests
 * 
 * These tests ensure proper API endpoint consistency between client and server.
 * 
 * UPDATED ARCHITECTURE: No more magic path rewriting!
 * - Frontend uses "/api/" prefix (e.g., "/api/user-items")
 * - Vite proxy forwards "/api/*" to server without rewriting
 * - Server endpoints are defined WITH "/api/" prefix
 * - This eliminates the confusing magic transformation that caused bugs
 */

import fs from 'fs'
import path from 'path'

const FRONTEND_SOURCE_DIRS = [
  'src/components',
  'src/hooks',
  'src/utils'
]

// Server endpoints that use /api/ prefix (consistent between client and server)
const API_ENDPOINTS = [
  '/api/search',
  '/api/user-items', 
  '/api/update-metadata-stream',
  '/api/update-metadata',
  '/api/youtube-suggest',
  '/api/batch-upload-image-stream',
  '/api/batch-upload-image',
  '/api/health',
  '/api/youtube/update-recording-dates-stream',
  '/api/youtube/get-descriptions', 
  '/api/youtube/update-descriptions-stream',
  '/api/metadata/:identifier'
]

// Auth endpoints that have their own proxy rule (no /api/ prefix needed)
const AUTH_ENDPOINTS = [
  '/auth/youtube/test',
  '/auth/youtube',
  '/auth/youtube/callback', 
  '/auth/youtube/status'
]

const ALL_SERVER_ENDPOINTS = [...API_ENDPOINTS, ...AUTH_ENDPOINTS]

describe('API Prefix Guard Tests', () => {
  
  test('Frontend and server should use consistent /api/ prefixes', () => {
    const violations = []
    
    // Read all frontend files
    const frontendFiles = []
    FRONTEND_SOURCE_DIRS.forEach(dir => {
      const dirPath = path.join(process.cwd(), dir)
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath, { recursive: true })
        files.forEach(file => {
          if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            frontendFiles.push(path.join(dirPath, file))
          }
        })
      }
    })
    
    // Check each file for missing /api/ prefix violations
    frontendFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      
      lines.forEach((line, lineNumber) => {
        // Look for fetch calls that should use /api/ prefix but don't
        const fetchMatches = line.match(/fetch\('(\/[^']*)/g)
        if (fetchMatches) {
          fetchMatches.forEach(fetchCall => {
            const urlMatch = fetchCall.match(/fetch\('(\/[^']*)/)
            if (urlMatch) {
              const url = urlMatch[1]
              const endpoint = url.split('?')[0] // Remove query params
              
              // Check if this is an API endpoint that should use /api/ prefix
              const isApiEndpoint = API_ENDPOINTS.some(apiEndpoint => 
                endpoint === apiEndpoint || 
                (apiEndpoint.includes(':') && endpoint.startsWith(apiEndpoint.split(':')[0]))
              )
              
              // Check if this is an auth endpoint (should NOT use /api/ prefix)
              const isAuthEndpoint = AUTH_ENDPOINTS.some(authEndpoint => 
                endpoint === authEndpoint || 
                (authEndpoint.includes(':') && endpoint.startsWith(authEndpoint.split(':')[0]))
              )
              
              // If it's supposed to be an API endpoint, check for correct /api/ prefix
              const shouldHaveApiPrefix = API_ENDPOINTS.some(apiEndpoint => 
                endpoint === apiEndpoint.replace('/api', '') ||
                (apiEndpoint.includes(':') && endpoint.startsWith(apiEndpoint.replace('/api', '').split(':')[0]))
              )
              
              if (shouldHaveApiPrefix && !url.startsWith('/api/')) {
                violations.push({
                  file: path.relative(process.cwd(), filePath),
                  line: lineNumber + 1,
                  content: line.trim(),
                  endpoint: endpoint,
                  issue: `Frontend uses '${endpoint}' but should use '/api${endpoint}' (consistent prefix)`
                })
              }
              
              // If it's an auth endpoint but uses /api/ prefix, it's also a violation
              if (isAuthEndpoint && url.startsWith('/api/')) {
                violations.push({
                  file: path.relative(process.cwd(), filePath),
                  line: lineNumber + 1,
                  content: line.trim(),
                  endpoint: endpoint,
                  issue: `Frontend uses '/api${endpoint}' but should use '${endpoint}' (Vite /auth proxy setup)`
                })
              }
            }
          })
        }
      })
    })
    
    if (violations.length > 0) {
      const errorMessage = '\n❌ MISSING /api/ PREFIX VIOLATIONS DETECTED:\n\n' +
        violations.map(v => 
          `File: ${v.file}:${v.line}\n` +
          `Issue: ${v.issue}\n` +
          `Code: ${v.content}\n`
        ).join('\n') + 
        '\n🔧 Fix: Correct the proxy prefix usage above.\n' +
        '- API endpoints: use /api/ prefix\n' + 
        '- Auth endpoints: do NOT use /api/ prefix\n'
      
      throw new Error(errorMessage)
    }
  })
  
  test('Server endpoints should have /api/ prefix for API routes', () => {
    // This test verifies our understanding of server endpoints
    const serverFilePath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverFilePath, 'utf-8')
    
    // Extract actual endpoints from server code
    const endpointMatches = serverContent.match(/app\.(get|post)\(['"]([^'"]+)['"]/g)
    const actualEndpoints = endpointMatches ? endpointMatches.map(match => {
      const pathMatch = match.match(/['"]([^'"]+)['"]/)
      return pathMatch ? pathMatch[1] : null
    }).filter(Boolean) : []
    
    // Verify our endpoint lists are accurate
    ALL_SERVER_ENDPOINTS.forEach(endpoint => {
      if (!endpoint.includes(':')) { // Skip parameterized routes for this check
        expect(actualEndpoints).toContain(endpoint)
      }
    })
    
    // API endpoints should have /api/ prefix, auth endpoints should not
    actualEndpoints.forEach(endpoint => {
      if (API_ENDPOINTS.some(apiEndpoint => apiEndpoint.replace('/:identifier', '').endsWith(endpoint.replace('/:identifier', '')))) {
        expect(endpoint).toMatch(/^\/api\//)
      } else if (AUTH_ENDPOINTS.includes(endpoint)) {
        expect(endpoint).not.toMatch(/^\/api\//)
      }
    })
  })
  
  test('Frontend fetch calls should match server endpoint patterns', () => {
    const violations = []
    
    // Read all frontend files again to check for any fetch calls
    const frontendFiles = []
    FRONTEND_SOURCE_DIRS.forEach(dir => {
      const dirPath = path.join(process.cwd(), dir)
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath, { recursive: true })
        files.forEach(file => {
          if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            frontendFiles.push(path.join(dirPath, file))
          }
        })
      }
    })
    
    frontendFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      
      lines.forEach((line, lineNumber) => {
        // Look for any fetch calls with absolute paths
        const fetchMatches = line.match(/fetch\('(\/[^']*)/g)
        if (fetchMatches) {
          fetchMatches.forEach(fetchCall => {
            const urlMatch = fetchCall.match(/fetch\('(\/[^']*)/)
            if (urlMatch) {
              const url = urlMatch[1]
              const endpoint = url.split('?')[0] // Remove query params
              
              // Skip if it's a valid endpoint
              const isValidEndpoint = ALL_SERVER_ENDPOINTS.some(serverEndpoint => 
                endpoint === serverEndpoint || 
                (serverEndpoint.includes(':') && endpoint.startsWith(serverEndpoint.split(':')[0]))
              )
              
              if (!isValidEndpoint && !endpoint.startsWith('/api/')) {
                violations.push({
                  file: path.relative(process.cwd(), filePath),
                  line: lineNumber + 1,
                  content: line.trim(),
                  endpoint: endpoint,
                  issue: `Unknown endpoint '${endpoint}' - verify it exists in server`
                })
              }
            }
          })
        }
      })
    })
    
    if (violations.length > 0) {
      const warningMessage = '\n⚠️  UNKNOWN ENDPOINTS DETECTED:\n\n' +
        violations.map(v => 
          `File: ${v.file}:${v.line}\n` +
          `Issue: ${v.issue}\n` +
          `Code: ${v.content}\n`
        ).join('\n') + 
        '\n🔍 Please verify these endpoints exist in server/index.ts\n'
      
      console.warn(warningMessage)
    }
  })
})
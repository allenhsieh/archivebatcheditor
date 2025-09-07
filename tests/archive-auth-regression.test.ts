/**
 * Archive.org Authentication Regression Prevention Tests
 * 
 * These tests prevent the authentication regressions that occurred when
 * the working uploadImageToArchiveItem helper function was removed and
 * replaced with inline code that used wrong authentication methods.
 * 
 * CRITICAL: Archive.org uses different auth methods for different APIs:
 * - Search API: Authorization: Basic ${base64(accessKey:secretKey)}
 * - Metadata API: Authorization: Basic ${base64(accessKey:secretKey)}  
 * - S3 Upload API: authorization: LOW ${accessKey}:${secretKey}
 */

import fs from 'fs'
import path from 'path'

describe('Archive.org Authentication Regression Prevention', () => {
  
  test('S3 upload endpoints must use LOW authentication (not Basic)', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Find all S3 upload calls (to s3.us.archive.org)
    const s3Calls = []
    const lines = serverContent.split('\n')
    
    lines.forEach((line, index) => {
      if (line.includes('s3.us.archive.org')) {
        // Look for the authorization header in the next few lines
        const startIndex = Math.max(0, index - 5)
        const endIndex = Math.min(lines.length, index + 15)
        const contextLines = lines.slice(startIndex, endIndex)
        const contextText = contextLines.join('\n')
        
        s3Calls.push({
          line: index + 1,
          context: contextText,
          url: line.trim()
        })
      }
    })
    
    expect(s3Calls.length).toBeGreaterThan(0) // Ensure we found S3 calls
    
    // Check each S3 call for correct authentication
    s3Calls.forEach(call => {
      // Must use 'authorization': `LOW ${accessKey}:${secretKey}`
      expect(call.context).toMatch(/['"]authorization['"]:\s*`LOW\s*\$\{accessKey\}:\$\{secretKey\}`/)
      
      // Must NOT use Basic authentication with btoa
      expect(call.context).not.toMatch(/['"]Authorization['"]:\s*`Basic\s*\$\{btoa\(/)
      expect(call.context).not.toMatch(/['"]authorization['"]:\s*`Basic\s*\$\{btoa\(/)
    })
  })
  
  test('Search/Metadata endpoints must use Basic authentication (not LOW)', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Find all Archive.org API fetch calls that use buildArchive*Url utility functions
    const archiveApiCalls = []
    const lines = serverContent.split('\n')
    
    lines.forEach((line, index) => {
      // Look for usage of buildArchiveSearchUrl or buildArchiveMetadataUrl
      if (line.includes('buildArchiveSearchUrl') || line.includes('buildArchiveMetadataUrl')) {
        const startIndex = Math.max(0, index - 2)
        const endIndex = Math.min(lines.length, index + 20)
        const contextLines = lines.slice(startIndex, endIndex)
        const contextText = contextLines.join('\n')
        
        archiveApiCalls.push({
          line: index + 1,
          context: contextText,
          url: line.trim()
        })
      }
    })
    
    expect(archiveApiCalls.length).toBeGreaterThan(0) // Ensure we found API calls
    
    // Check that these API calls have Basic authentication nearby (when they need auth)
    archiveApiCalls.forEach(call => {
      // Look for fetch calls that need authentication (POST operations)
      if (call.context.includes('fetch(') && call.context.includes('method: \'POST\'')) {
        // Must use Basic auth with btoa for Archive.org APIs
        expect(call.context).toMatch(/['"]Authorization['"]:\s*`Basic\s*\$\{.*\}`/)
        
        // Must NOT use LOW authentication 
        expect(call.context).not.toMatch(/['"]authorization['"]:\s*`LOW\s*/)
      }
    })
  })
  
  test('S3 upload headers must use correct Archive.org IAS3 format', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Find S3 upload header sections
    const headerSections = []
    const lines = serverContent.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('s3.us.archive.org')) {
        // Look for headers section after this line
        for (let j = i; j < Math.min(lines.length, i + 20); j++) {
          if (lines[j].trim().includes('headers:')) {
            const startIndex = j
            let endIndex = j + 1
            
            // Find the end of the headers object
            let braceCount = 0
            for (let k = j; k < lines.length; k++) {
              const line = lines[k]
              braceCount += (line.match(/\{/g) || []).length
              braceCount -= (line.match(/\}/g) || []).length
              
              if (braceCount === 0 && k > j) {
                endIndex = k
                break
              }
            }
            
            const headerSection = lines.slice(startIndex, endIndex + 1).join('\n')
            headerSections.push({
              line: startIndex + 1,
              headers: headerSection
            })
            break
          }
        }
      }
    }
    
    expect(headerSections.length).toBeGreaterThan(0) // Ensure we found header sections
    
    headerSections.forEach(section => {
      // Must use x-amz-auto-make-bucket (not x-archive-auto-make-bucket)
      if (section.headers.includes('auto-make-bucket')) {
        expect(section.headers).toMatch(/['"]x-amz-auto-make-bucket['"]/)
        expect(section.headers).not.toMatch(/['"]x-archive-auto-make-bucket['"]/)
      }
      
      // Must use lowercase 'authorization' for S3 (IAS3 API requirement)
      if (section.headers.includes('LOW')) {
        expect(section.headers).toMatch(/['"]authorization['"]/)
        expect(section.headers).not.toMatch(/['"]Authorization['"].*LOW/)
      }
    })
  })
  
  test('Magic numbers are replaced with named constants', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Check that magic numbers are replaced with constants
    expect(serverContent).toMatch(/const\s+API_DELAY_MS\s*=\s*1000/)
    expect(serverContent).toMatch(/const\s+SEARCH_DELAY_MS\s*=\s*500/)
    expect(serverContent).toMatch(/const\s+MAX_SEARCH_RESULTS\s*=\s*1000/)
    expect(serverContent).toMatch(/const\s+MAX_USER_ITEMS\s*=\s*10000/)
    
    // Check that constants are used instead of magic numbers
    expect(serverContent).toMatch(/delay\(API_DELAY_MS\)/)
    expect(serverContent).toMatch(/delay\(SEARCH_DELAY_MS\)/)
    expect(serverContent).toMatch(/buildArchiveSearchUrl\([^,]+,\s*[^,]+,\s*MAX_SEARCH_RESULTS\)/)
    expect(serverContent).toMatch(/buildArchiveSearchUrl\([^,]+,\s*[^,]+,\s*MAX_USER_ITEMS\)/)
    
    // Ensure no hardcoded delays remain
    expect(serverContent).not.toMatch(/delay\(1000\)/)
    expect(serverContent).not.toMatch(/delay\(500\)/)
    expect(serverContent).not.toMatch(/rows.*:\s*1000[^0]/) // Don't match 10000
    expect(serverContent).not.toMatch(/rows.*:\s*10000/)
  })
  
  test('Client-side magic numbers are replaced with constants', () => {
    const metadataEditorPath = path.join(process.cwd(), 'src/components/MetadataEditor.tsx')
    const content = fs.readFileSync(metadataEditorPath, 'utf-8')
    
    // Check for file size constants
    expect(content).toMatch(/const\s+MAX_FILE_SIZE_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/)
    expect(content).toMatch(/const\s+MAX_FILE_SIZE_MB\s*=\s*10/)
    
    // Check that constants are used
    expect(content).toMatch(/maxSize\s*=\s*MAX_FILE_SIZE_BYTES/)
    expect(content).toMatch(/\$\{MAX_FILE_SIZE_MB\}MB/)
    
    // Ensure no hardcoded magic numbers remain (except in constant definitions)
    const linesWithMagicNumbers = content.split('\n').filter(line => 
      line.includes('10 * 1024 * 1024') && !line.includes('const MAX_FILE_SIZE_BYTES')
    )
    expect(linesWithMagicNumbers.length).toBe(0)
    
    const linesWithHardcodedSize = content.split('\n').filter(line =>
      line.includes('Maximum size is 10MB') && !line.includes('MAX_FILE_SIZE_MB')
    )
    expect(linesWithHardcodedSize.length).toBe(0)
  })
  
  test('Batch upload endpoints must upload _rules.conf with derivation rules', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Find batch upload endpoints
    const batchUploadEndpoints = [
      '/api/batch-upload-image-stream',
      '/api/batch-upload-image'
    ]
    
    batchUploadEndpoints.forEach(endpoint => {
      // Find the endpoint handler
      const endpointRegex = new RegExp(`app\\.post\\(['"]${endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`)
      expect(serverContent).toMatch(endpointRegex)
      
      // Find the section after this endpoint
      const endpointIndex = serverContent.search(endpointRegex)
      expect(endpointIndex).toBeGreaterThanOrEqual(0)
      
      // Look for the _rules.conf upload in the next 5000 characters
      const sectionAfterEndpoint = serverContent.slice(endpointIndex, endpointIndex + 5000)
      
      // Must upload _rules.conf file
      expect(sectionAfterEndpoint).toMatch(/fetch\(`https:\/\/s3\.us\.archive\.org\/\$\{metadata\.identifier\}\/_rules\.conf`/)
      
      // Must use 'CAT.ALL' content
      expect(sectionAfterEndpoint).toMatch(/rulesContent = 'CAT\.ALL'/)
      
      // Must use correct authentication
      expect(sectionAfterEndpoint).toMatch(/['"]authorization['"]:\s*`LOW \$\{accessKey\}:\$\{secretKey\}`/)
      
      // Must include Derivation Rules format metadata
      expect(sectionAfterEndpoint).toMatch(/['"]x-archive-meta-format['"]:\s*['"]Derivation Rules['"]/)
    })
  })
  
  test('API endpoints are consistent between client and server', () => {
    const serverPath = path.join(process.cwd(), 'server/index.ts')
    const serverContent = fs.readFileSync(serverPath, 'utf-8')
    
    // Find all server API endpoints (should have /api/ prefix)
    const serverApiEndpoints = []
    const serverMatches = serverContent.match(/app\.(get|post)\(['"]\/api\/[^'"]+['"]/g)
    if (serverMatches) {
      serverMatches.forEach(match => {
        const pathMatch = match.match(/['"]([^'"]+)['"]/)
        if (pathMatch) {
          serverApiEndpoints.push(pathMatch[1])
        }
      })
    }
    
    expect(serverApiEndpoints.length).toBeGreaterThan(10) // Should have many API endpoints
    
    // All server API endpoints should start with /api/
    serverApiEndpoints.forEach(endpoint => {
      expect(endpoint).toMatch(/^\/api\//)
    })
    
    // Check that client calls match server endpoints
    const frontendFiles = [
      'src/hooks/useArchive.ts',
      'src/components/MetadataEditor.tsx'
    ]
    
    frontendFiles.forEach(filePath => {
      const fullPath = path.join(process.cwd(), filePath)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        
        // Find fetch calls to /api/ endpoints
        const fetchMatches = content.match(/fetch\(['"]\/api\/[^'"]*['"]/)
        if (fetchMatches) {
          fetchMatches.forEach(match => {
            const urlMatch = match.match(/['"]([^'"]+)['"]/)
            if (urlMatch) {
              const clientEndpoint = urlMatch[1].split('?')[0] // Remove query params
              
              // Check if this client endpoint has a corresponding server endpoint
              const hasMatchingServer = serverApiEndpoints.some(serverEndpoint => 
                clientEndpoint === serverEndpoint ||
                (serverEndpoint.includes(':') && clientEndpoint.startsWith(serverEndpoint.split(':')[0]))
              )
              
              expect(hasMatchingServer).toBe(true)
            }
          })
        }
      }
    })
  })
})

describe('Vite Proxy Configuration Validation', () => {
  test('Vite proxy should not rewrite paths (no magic transformation)', () => {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts')
    const content = fs.readFileSync(viteConfigPath, 'utf-8')
    
    // Should have /api proxy without rewrite
    expect(content).toMatch(/['"]\/api['"]:\s*\{/)
    expect(content).toMatch(/target:\s*['"]http:\/\/localhost:3001['"]/)
    expect(content).toMatch(/changeOrigin:\s*true/)
    
    // Should NOT have path rewriting (the magic anti-pattern)
    expect(content).not.toMatch(/rewrite:\s*\(/)
    expect(content).not.toMatch(/path\.replace\(/)
  })
  
  test('Vite proxy should preserve /auth endpoints without transformation', () => {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.ts')
    const content = fs.readFileSync(viteConfigPath, 'utf-8')
    
    // Should have /auth proxy
    expect(content).toMatch(/['"]\/auth['"]:\s*\{/)
    expect(content).toMatch(/target:\s*['"]http:\/\/localhost:3001['"]/)
    
    // Should not rewrite auth paths either
    expect(content).not.toMatch(/\/auth.*rewrite/)
  })
})
// Import all the libraries we need for our server
import express from 'express'  // Express.js - makes it easy to build web servers in Node.js
import cors from 'cors'        // CORS - allows our web app to talk to our server (different ports)
import helmet from 'helmet'    // Helmet - adds security headers to protect against common attacks
import { z } from 'zod'        // Zod - validates that data sent to our API has the right format
import multer from 'multer'    // Multer - handles file uploads
import { OAuth2Client } from 'google-auth-library'  // Google OAuth 2.0 authentication
import { 
  standardizeDate, 
  extractBandFromTitle, 
  extractVenueFromTitle, 
  extractDateFromTitle,
  delay,
  isRateLimitError,
  isYouTubeQuotaError,
  buildArchiveSearchUrl,
  buildArchiveMetadataUrl,
  buildYouTubeSearchUrl,
  createYouTubeUrl,
  generateFlyerFilename
} from './utils.js'

// Create our Express server app
const app = express()
// Get the port number from environment variables, or use 3001 as default
const PORT = process.env.PORT || 3001



// API configuration now uses utility functions

// Zod schema for validating search requests
const searchQuerySchema = z.object({
  q: z.string().min(1).max(500)  // Query must be 1-500 characters
})

// Zod schemas for validating metadata update requests
const metadataUpdateSchema = z.object({
  identifier: z.string().min(1).max(100),
  metadata: z.record(z.any()),
  target: z.enum(['metadata', 'files']).optional().default('metadata')
})

const metadataUpdateStreamSchema = z.object({
  items: z.array(z.object({
    identifier: z.string().min(1).max(100),
    metadata: z.record(z.any()),
    target: z.enum(['metadata', 'files']).optional().default('metadata')
  })).min(1).max(100)
})

const youtubeSuggestSchema = z.object({
  items: z.array(z.object({
    identifier: z.string(),
    title: z.string(),
    date: z.string().optional()
  })).min(1).max(100)
})


const youtubeGetDescriptionsSchema = z.object({
  items: z.array(z.object({
    identifier: z.string()
  })).min(1).max(100)
})

const youtubeUpdateDescriptionsStreamSchema = z.object({
  items: z.array(z.object({
    identifier: z.string(),
    description: z.string()
  })).min(1).max(100)
})

const youtubeUpdateRecordingDatesStreamSchema = z.object({
  items: z.array(z.object({
    identifier: z.string(),
    recordingdate: z.string()
  })).min(1).max(100)
})

// TypeScript interfaces for type safety
interface YouTubeVideo {
  id: { videoId: string }
  snippet: {
    title: string
    publishedAt: string
    channelTitle: string
    thumbnails?: {
      medium?: {
        url: string
      }
    }
  }
}

interface ScoredVideo extends YouTubeVideo {
  score: number
  url: string
  matchReason: string
}

interface ProgressData {
  type: string
  current?: number
  total?: number
  identifier?: string
  status?: string
  error?: string
  message?: string
  [key: string]: any
}

// Configure multer for file uploads (stores files temporarily in memory)
const upload = multer({
  storage: multer.memoryStorage(),  // Keep files in RAM (they get processed immediately)
  limits: {
    fileSize: 10 * 1024 * 1024,  // Maximum 10MB per file
    files: 50                     // Maximum 50 files per request
  }
})

// Configure Express middleware (the order matters!)
app.use(helmet({
  crossOriginEmbedderPolicy: false,  // Disable COEP to allow file uploads
  contentSecurityPolicy: false      // Disable CSP for development (should enable in production)
}))
app.use(cors())  // Allow cross-origin requests (frontend on different port)
app.use(express.json({ limit: '50mb' }))  // Parse JSON in request bodies (up to 50MB)
app.use(express.urlencoded({ extended: true }))  // Parse form data in request bodies

/**
 * Get Archive.org credentials from environment variables
 * These are needed to authenticate with Archive.org's APIs
 * @throws {Error} if credentials are not configured
 */
function getArchiveCredentials() {
  const email = process.env.ARCHIVE_EMAIL
  const accessKey = process.env.ARCHIVE_ACCESS_KEY
  const secretKey = process.env.ARCHIVE_SECRET_KEY
  
  if (!email || !accessKey || !secretKey) {
    throw new Error('Archive.org credentials not configured. Please set ARCHIVE_EMAIL, ARCHIVE_ACCESS_KEY, and ARCHIVE_SECRET_KEY in your .env file')
  }
  
  return { email, accessKey, secretKey }
}

/**
 * Get YouTube credentials from environment variables  
 * These are needed for YouTube integration (optional feature)
 * @returns YouTube config object or null if not configured
 */
function getYouTubeCredentials() {
  const apiKey = process.env.YOUTUBE_API_KEY
  const channelId = process.env.YOUTUBE_CHANNEL_ID
  
  if (!apiKey || !channelId) {
    return null
  }
  
  return { apiKey, channelId }
}

/**
 * Get YouTube OAuth credentials from environment variables
 * These are needed for YouTube OAuth authentication (write operations)
 * @returns OAuth config object or null if not configured  
 */
function getYouTubeOAuthCredentials() {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI
  
  if (!clientId || !clientSecret || !redirectUri) {
    return null
  }
  
  return { clientId, clientSecret, redirectUri }
}

/**
 * Create OAuth2 client for YouTube authentication
 */
function createOAuth2Client() {
  const credentials = getYouTubeOAuthCredentials()
  if (!credentials) {
    throw new Error('YouTube OAuth credentials not configured')
  }
  
  return new OAuth2Client(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri
  )
}

/**
 * Get authenticated YouTube client using stored tokens
 */
async function getAuthenticatedYouTubeClient() {
  try {
    createOAuth2Client()
    
    // For this simplified version, we'll need to implement token management differently
    // Since we removed the database, tokens would need to be managed another way
    // For now, we'll throw an error indicating this needs configuration
    throw new Error('YouTube OAuth token management requires database - not implemented')
    
  } catch (error) {
    console.error('Failed to get authenticated YouTube client:', error)
    throw error
  }
}

// Utility functions are now imported from ./utils.js

/**
 * Wrapper for Archive.org API calls with retry logic and rate limiting
 */
async function makeArchiveApiCall<T>(apiCall: () => Promise<T>, context: string): Promise<T> {
  let lastError: Error = new Error('Unknown error')
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await apiCall()
      
      if (attempt > 1) {
        console.log(`✅ ${context} succeeded on attempt ${attempt}`)
      }
      
      return result
    } catch (error) {
      lastError = error as Error
      console.warn(`⚠️  ${context} failed on attempt ${attempt}:`, error instanceof Error ? error.message : error)
      
      if (attempt < 3) {
        if (isRateLimitError(error)) {
          console.log(`🕒 Rate limited, waiting ${attempt * 2} seconds before retry...`)
          await delay(attempt * 2000)
        } else {
          console.log(`🕒 Retrying in ${attempt} seconds...`)
          await delay(attempt * 1000)
        }
      }
    }
  }
  
  console.error(`❌ ${context} failed after 3 attempts, giving up`)
  throw lastError
}

/**
 * Search YouTube for matching video using title and date
 * Now calls API directly without caching
 */
async function searchYouTubeForMatch(title: string, date?: string, identifier?: string) {
  try {
    console.log(`🔍 YOUTUBE SEARCH: title="${title}", date="${date}", identifier="${identifier}"`)
    
    const youtubeConfig = getYouTubeCredentials()
    if (!youtubeConfig) {
      console.log('🚫 YouTube API not configured, skipping search')
      return null
    }

    const { apiKey, channelId } = youtubeConfig
    
    // Build search query - prioritize title, optionally include date
    let searchQuery = `"${title}"`
    
    if (date) {
      // Try to add date context to search
      const year = date.split('-')[0]
      if (year && year.length === 4) {
        searchQuery += ` ${year}`
      }
    }
    
    console.log(`🔍 YouTube API search query: "${searchQuery}"`)
    
    // Build YouTube search URL using utility function
    const searchUrl = buildYouTubeSearchUrl(apiKey, channelId, searchQuery)
    console.log(`🌐 YouTube API request: ${searchUrl}`)
    
    const response = await fetch(searchUrl)
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ YouTube API error ${response.status}:`, errorText)
      
      // Check for quota exhaustion using utility function
      if (isYouTubeQuotaError({ status: response.status })) {
        throw new Error(`QUOTA_EXHAUSTED: YouTube API quota exceeded`)
      }
      
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log(`📊 YouTube search results: ${data.items?.length || 0} videos found`)
    
    if (!data.items || data.items.length === 0) {
      console.log('🚫 No YouTube videos found for query')
      return null
    }
    
    // Score and rank results
    const scoredResults = data.items.map((video: YouTubeVideo) => {
      const videoTitle = video.snippet.title.toLowerCase()
      const searchTitle = title.toLowerCase()
      
      let score = 0
      
      // Exact title match (highest priority)
      if (videoTitle === searchTitle) {
        score += 100
      } else if (videoTitle.includes(searchTitle) || searchTitle.includes(videoTitle)) {
        score += 50
      }
      
      // Word overlap scoring
      const videoWords = videoTitle.split(/\s+/).filter((word: string) => word.length > 2)
      const searchWords = searchTitle.split(/\s+/).filter((word: string) => word.length > 2)
      
      const commonWords = videoWords.filter((word: string) => 
        searchWords.some((searchWord: string) => 
          word.includes(searchWord) || searchWord.includes(word)
        )
      )
      score += commonWords.length * 10
      
      // Date proximity scoring (if date available)
      if (date && video.snippet.publishedAt) {
        const videoDate = new Date(video.snippet.publishedAt)
        const targetDate = new Date(date)
        const daysDiff = Math.abs((videoDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))
        
        // Bonus for videos published within 30 days of recording
        if (daysDiff <= 30) {
          score += 20
        } else if (daysDiff <= 90) {
          score += 10
        } else if (daysDiff <= 365) {
          score += 5
        }
      }
      
      return {
        ...video,
        score,
        url: createYouTubeUrl(video.id.videoId),
        matchReason: `Score: ${score} (title similarity + date proximity)`
      }
    })
    
    // Sort by score (highest first)
    scoredResults.sort((a: ScoredVideo, b: ScoredVideo) => b.score - a.score)
    
    const bestMatch = scoredResults[0]
    console.log(`🏆 Best YouTube match: "${bestMatch.snippet.title}" (score: ${bestMatch.score})`)
    
    // Extract structured metadata from the best match title
    const extractedBand = extractBandFromTitle(bestMatch.snippet.title)
    const extractedVenue = extractVenueFromTitle(bestMatch.snippet.title)
    const extractedDate = extractDateFromTitle(bestMatch.snippet.title)
    
    if (extractedBand) console.log(`🎵 Extracted band: ${extractedBand}`)
    if (extractedVenue) console.log(`🏛️ Extracted venue: ${extractedVenue}`)
    if (extractedDate) console.log(`📅 Extracted date: ${extractedDate}`)
    
    return {
      url: bestMatch.url,
      title: bestMatch.snippet.title,
      publishedAt: bestMatch.snippet.publishedAt,
      thumbnail: bestMatch.snippet.thumbnails?.medium?.url,
      channelTitle: bestMatch.snippet.channelTitle,
      score: bestMatch.score,
      matchReason: bestMatch.matchReason,
      extractedBand,
      extractedVenue,
      extractedDate,
      allMatches: scoredResults.slice(0, 5).map((result: ScoredVideo) => ({
        url: createYouTubeUrl(result.id.videoId),
        title: result.snippet.title,
        score: result.score,
        publishedAt: result.snippet.publishedAt
      }))
    }
    
  } catch (error) {
    console.error('YouTube search error:', error)
    
    // Re-throw quota exhaustion errors so they can be handled by the calling endpoint
    if (isYouTubeQuotaError(error)) {
      throw error
    }
    
    return null
  }
}




// API ENDPOINT: GET /search
// This endpoint searches within the authenticated user's uploaded items only
// Example: GET /search?q=radiohead will search for "radiohead" in YOUR items on Archive.org
app.get('/search', async (req, res) => {
  try {
    // Validate that the request has a proper 'q' (query) parameter
    const { q } = searchQuerySchema.parse(req.query)  // Zod validates the format
    
    // Get user's Archive.org credentials to limit search to their items
    const { email, accessKey, secretKey } = getArchiveCredentials()
    
    // Combine user query with uploader filter to search only their items
    // Example: if user searches "radiohead", actual query becomes "radiohead AND uploader:user@example.com"
    const combinedQuery = `(${q}) AND uploader:${email}`
    
    console.log(`Searching user items with query: "${combinedQuery}"`)
    
    // Build search URL using utility function
    const fields = ['identifier', 'title', 'creator', 'description', 'date', 'mediatype', 'collection', 'subject', 'uploader']
    const searchUrl = buildArchiveSearchUrl(combinedQuery, fields, 1000)
    
    // Use authenticated request to access uploader field
    const auth = btoa(`${accessKey}:${secretKey}`)
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    })
    if (!response.ok) {
      throw new Error(`Archive.org search error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    
    console.log(`Search results: Found ${data.response?.numFound || 0} total, returning ${data.response?.docs?.length || 0} items`)
    
    res.json({
      items: data.response?.docs || [],
      total: data.response?.numFound || 0,
      query: combinedQuery,  // Return the actual query used for debugging
      returned: data.response?.docs?.length || 0  // How many items we're actually returning
    })
  } catch (error) {
    console.error('Search error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search query' })
    }
    if (error instanceof Error && error.message.includes('credentials')) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Search failed' })
  }
})

// API ENDPOINT: GET /user-items  
// This endpoint fetches all items uploaded by the authenticated user
// Example: GET /user-items
app.get('/user-items', async (_req, res) => {
  try {
    // Get user's Archive.org credentials to authenticate the request
    const { email, accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`🔍 Fetching fresh user items for ${email} from Archive.org API`)
    
    // Build search URL using utility function
    const fields = ['identifier', 'title', 'creator', 'description', 'date', 'mediatype', 'collection', 'subject', 'uploader', 'youtube']
    const searchUrl = buildArchiveSearchUrl(`uploader:${email}`, fields, 10000)
    
    // Make authenticated request to Archive.org
    const auth = btoa(`${accessKey}:${secretKey}`)
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Archive.org API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    const items = data.response?.docs || []
    
    console.log(`✅ Fetched ${items.length} items from Archive.org API`)
    
    res.json({
      items,
      total: items.length,
      email: email
    })
    
  } catch (error) {
    console.error('User items error:', error)
    if (error instanceof Error && error.message.includes('credentials')) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to fetch user items' })
  }
})

// API ENDPOINT: POST /update-metadata-stream
// This endpoint handles batch metadata updates using Server-Sent Events for real-time progress
// Example: POST /update-metadata-stream with JSON body containing array of items to update
app.post('/update-metadata-stream', async (req, res) => {
  try {
    // Validate the request body contains properly formatted items
    const { items } = metadataUpdateStreamSchema.parse(req.body)
    
    // Get user's Archive.org credentials for authentication
    const { accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`🔄 Starting batch metadata update for ${items.length} items`)
    
    // Set up Server-Sent Events for real-time progress updates
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache') 
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    // Helper function to send progress updates to the client
    const sendProgress = (data: ProgressData) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    
    sendProgress({ type: 'start', total: items.length })
    
    const results = []
    
    // Process each item sequentially with progress updates
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { identifier, metadata, target = 'metadata' } = item
      
      try {
        sendProgress({ 
          type: 'progress', 
          current: i + 1, 
          total: items.length, 
          identifier,
          status: 'updating'
        })
        
        console.log(`📝 Updating metadata for ${identifier} (${i + 1}/${items.length})`)
        
        // Make API call to update Archive.org metadata
        const result = await makeArchiveApiCall(async () => {
          const formData = new URLSearchParams()
          formData.append('-target', target)
          
          // Add each metadata field to the form data (standardize dates)
          Object.entries(metadata).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              // Standardize date fields
              const processedValue = key === 'date' ? standardizeDate(String(value)) : String(value)
              formData.append(key, processedValue)
            }
          })
          
          const metadataUrl = buildArchiveMetadataUrl(identifier)
          const response = await fetch(metadataUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${accessKey}:${secretKey}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
          })
          
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Archive.org API error: ${response.status} ${response.statusText} - ${errorText}`)
          }
          
          return await response.json()
        }, `Metadata update for ${identifier}`)
        
        console.log(`✅ Successfully updated ${identifier}`)
        
        results.push({
          identifier,
          success: true,
          message: 'Metadata updated successfully',
          archiveResponse: result
        })
        
        sendProgress({ 
          type: 'progress', 
          current: i + 1, 
          total: items.length, 
          identifier,
          status: 'completed'
        })
        
        // Small delay to avoid overwhelming Archive.org
        if (i < items.length - 1) {
          await delay(1000)
        }
        
      } catch (error) {
        console.error(`❌ Failed to update ${identifier}:`, error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          identifier,
          success: false,
          error: errorMessage
        })
        
        sendProgress({ 
          type: 'progress', 
          current: i + 1, 
          total: items.length, 
          identifier,
          status: 'error',
          error: errorMessage
        })
      }
    }
    
    // Send final summary
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    sendProgress({ 
      type: 'complete', 
      total: items.length,
      successful,
      failed,
      results 
    })
    
    console.log(`🏁 Batch update complete: ${successful} successful, ${failed} failed`)
    
    res.end()
    
  } catch (error) {
    console.error('Batch metadata update error:', error)
    
    if (error instanceof z.ZodError) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid request format' })}\n\n`)
    } else if (error instanceof Error && error.message.includes('credentials')) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Batch update failed' })}\n\n`)
    }
    
    res.end()
  }
})

// API ENDPOINT: POST /update-metadata
// This endpoint handles single metadata updates (simpler than the batch version)
// Example: POST /update-metadata with JSON body containing identifier and metadata
app.post('/update-metadata', async (req, res) => {
  try {
    // Validate the request body
    const { identifier, metadata, target = 'metadata' } = metadataUpdateSchema.parse(req.body)
    
    // Get user's Archive.org credentials
    const { accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`📝 Updating metadata for ${identifier}`)
    
    // Make API call to update Archive.org metadata
    const result = await makeArchiveApiCall(async () => {
      const formData = new URLSearchParams()
      formData.append('-target', target)
      
      // Add each metadata field to the form data (standardize dates)
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Standardize date fields
          const processedValue = key === 'date' ? standardizeDate(String(value)) : String(value)
          formData.append(key, processedValue)
        }
      })
      
      const metadataUrl = buildArchiveMetadataUrl(identifier)
      const response = await fetch(metadataUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accessKey}:${secretKey}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Archive.org API error: ${response.status} ${response.statusText} - ${errorText}`)
      }
      
      return await response.json()
    }, `Metadata update for ${identifier}`)
    
    console.log(`✅ Successfully updated ${identifier}`)
    
    res.json({
      success: true,
      identifier,
      message: 'Metadata updated successfully',
      archiveResponse: result
    })
    
  } catch (error) {
    console.error('Metadata update error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request format' })
    }
    if (error instanceof Error && error.message.includes('credentials')) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Metadata update failed' })
  }
})

// API ENDPOINT: POST /youtube-suggest  
// This endpoint finds YouTube matches for Archive.org items
// Example: POST /youtube-suggest with JSON body containing array of items
app.post('/youtube-suggest', async (req, res) => {
  try {
    // Handle both old format (single item) and new format (items array)
    let items
    try {
      const parsed = youtubeSuggestSchema.parse(req.body)
      items = parsed.items
    } catch (error) {
      // Try old format: { identifier, title, date }
      if (req.body.identifier && req.body.title) {
        console.log('⚠️ Using legacy request format - please update frontend')
        items = [{
          identifier: req.body.identifier,
          title: req.body.title,
          date: req.body.date
        }]
      } else {
        throw error
      }
    }
    
    console.log(`🔍 Starting YouTube suggestions for ${items.length} items`)
    
    const results = []
    
    for (const item of items) {
      try {
        console.log(`🎵 Processing: ${item.title}`)
        
        const youtubeMatch = await searchYouTubeForMatch(
          item.title,
          item.date,
          item.identifier
        )
        
        if (youtubeMatch) {
          console.log(`✅ Found YouTube match: ${youtubeMatch.title}`)
          results.push({
            identifier: item.identifier,
            title: item.title,
            youtubeMatch,
            success: true
          })
        } else {
          console.log(`❌ No YouTube match found for: ${item.title}`)
          results.push({
            identifier: item.identifier,
            title: item.title,
            youtubeMatch: null,
            success: false,
            reason: 'No matching video found'
          })
        }
        
        // Rate limiting: small delay between requests
        await delay(500)
        
      } catch (error) {
        console.error(`❌ Error processing ${item.identifier}:`, error)
        
        // Check if this is a quota exhaustion error
        const isQuotaError = isYouTubeQuotaError(error)
        
        console.log(`🔍 DEBUG: Error message: "${error instanceof Error ? error.message : 'Unknown error'}"`)
        console.log(`🔍 DEBUG: Is quota error: ${isQuotaError}`)
        
        results.push({
          identifier: item.identifier,
          title: item.title,
          youtubeMatch: null,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          quotaExhausted: isQuotaError
        })
        
        // If quota exhausted, stop processing remaining items
        if (isQuotaError) {
          console.log(`🛑 YouTube quota exhausted - stopping batch processing`)
          break
        }
      }
    }
    
    // Check if any result had quota exhaustion and throw error to trigger 403 response
    const hasQuotaExhaustion = results.some(r => r.quotaExhausted)
    if (hasQuotaExhaustion) {
      throw new Error('QUOTA_EXHAUSTED: YouTube API quota exceeded during batch processing')
    }
    
    const successful = results.filter(r => r.success).length
    console.log(`🏁 YouTube suggestions complete: ${successful}/${items.length} matches found`)
    
    res.json({
      results,
      summary: {
        total: items.length,
        successful,
        failed: items.length - successful
      }
    })
    
  } catch (error) {
    console.error('YouTube suggest error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request format' })
    }
    
    // Check if this is a quota exhaustion error and return 403
    if (isYouTubeQuotaError(error)) {
      return res.status(403).json({ 
        error: 'YouTube API quota exceeded',
        quotaExhausted: true 
      })
    }
    
    res.status(500).json({ error: 'YouTube suggestion failed' })
  }
})

// API ENDPOINT: POST /batch-upload-image-stream
// This endpoint handles batch image uploads using Server-Sent Events for real-time progress
app.post('/batch-upload-image-stream', (req, res, _next) => {
  upload.array('files')(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err)
      return res.status(400).json({ error: 'File upload failed' })
    }

    try {
      // Get user's Archive.org credentials
      const { accessKey, secretKey } = getArchiveCredentials()
      
      // Parse the metadata from the request body
      const itemsMetadata = JSON.parse(req.body.itemsMetadata || '[]')
      const files = req.files as Express.Multer.File[]
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' })
      }
      
      if (files.length !== itemsMetadata.length) {
        return res.status(400).json({ 
          error: `File count (${files.length}) doesn't match metadata count (${itemsMetadata.length})` 
        })
      }
      
      console.log(`🔄 Starting batch image upload for ${files.length} items`)
      
      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      
      const sendProgress = (data: ProgressData) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
      
      sendProgress({ type: 'start', total: files.length })
      
      const results = []
      
      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const metadata = itemsMetadata[i]
        
        try {
          sendProgress({ 
            type: 'progress', 
            current: i + 1, 
            total: files.length, 
            identifier: metadata.identifier,
            status: 'uploading'
          })
          
          console.log(`📤 Uploading ${metadata.identifier} (${i + 1}/${files.length})`)
          
          // Generate standardized flyer filename
          const standardizedFilename = generateFlyerFilename(
            metadata.identifier,
            metadata.metadata.title || metadata.identifier,
            metadata.metadata.date,
            file.originalname
          )
          
          // Prepare form data for Archive.org upload
          const formData = new FormData()
          
          // Add the file with standardized name
          const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype })
          formData.append('file', blob, standardizedFilename)
          
          // Add metadata fields
          Object.entries(metadata.metadata).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              formData.append(key, String(value))
            }
          })
          
          // Upload to Archive.org with standardized filename
          const uploadResponse = await fetch(`https://s3.us.archive.org/${metadata.identifier}/${standardizedFilename}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Basic ${btoa(`${accessKey}:${secretKey}`)}`,
              'x-archive-auto-make-bucket': '1',
              'x-archive-meta-mediatype': 'image',
              ...Object.fromEntries(
                Object.entries(metadata.metadata).map(([key, value]) => [
                  `x-archive-meta-${key}`, String(value)
                ])
              )
            },
            body: Buffer.from(file.buffer)
          })
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
          }
          
          console.log(`✅ Successfully uploaded ${metadata.identifier}`)
          
          results.push({
            identifier: metadata.identifier,
            filename: file.originalname,
            success: true,
            message: 'File uploaded successfully'
          })
          
          sendProgress({ 
            type: 'progress', 
            current: i + 1, 
            total: files.length, 
            identifier: metadata.identifier,
            status: 'completed'
          })
          
          // Small delay between uploads
          if (i < files.length - 1) {
            await delay(1000)
          }
          
        } catch (error) {
          console.error(`❌ Failed to upload ${metadata.identifier}:`, error)
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          results.push({
            identifier: metadata.identifier,
            filename: file.originalname,
            success: false,
            error: errorMessage
          })
          
          sendProgress({ 
            type: 'progress', 
            current: i + 1, 
            total: files.length, 
            identifier: metadata.identifier,
            status: 'error',
            error: errorMessage
          })
        }
      }
      
      // Send final summary
      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      
      sendProgress({ 
        type: 'complete', 
        total: files.length,
        successful,
        failed,
        results 
      })
      
      console.log(`🏁 Batch upload complete: ${successful} successful, ${failed} failed`)
      
      res.end()
      
    } catch (error) {
      console.error('Batch upload error:', error)
      
      if (error instanceof Error && error.message.includes('credentials')) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Batch upload failed' })}\n\n`)
      }
      
      res.end()
    }
  })
})

// API ENDPOINT: POST /batch-upload-image
// This endpoint handles batch image uploads (non-streaming version)
app.post('/batch-upload-image', (req, res, _next) => {
  upload.array('files')(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err)
      return res.status(400).json({ error: 'File upload failed' })
    }

    try {
      const { accessKey, secretKey } = getArchiveCredentials()
      
      const itemsMetadata = JSON.parse(req.body.itemsMetadata || '[]')
      const files = req.files as Express.Multer.File[]
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' })
      }
      
      if (files.length !== itemsMetadata.length) {
        return res.status(400).json({ 
          error: `File count (${files.length}) doesn't match metadata count (${itemsMetadata.length})` 
        })
      }
      
      console.log(`🔄 Processing ${files.length} image uploads`)
      
      const results = []
      
      // Process all uploads
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const metadata = itemsMetadata[i]
        
        // Generate standardized flyer filename (outside try block so it's available for error handling)
        const standardizedFilename = generateFlyerFilename(
          metadata.identifier,
          metadata.metadata.title || metadata.identifier,
          metadata.metadata.date,
          file.originalname
        )
        
        try {
          console.log(`📤 Uploading ${metadata.identifier}`)
          
          
          const uploadResponse = await fetch(`https://s3.us.archive.org/${metadata.identifier}/${standardizedFilename}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Basic ${btoa(`${accessKey}:${secretKey}`)}`,
              'x-archive-auto-make-bucket': '1',
              'x-archive-meta-mediatype': 'image',
              ...Object.fromEntries(
                Object.entries(metadata.metadata).map(([key, value]) => [
                  `x-archive-meta-${key}`, String(value)
                ])
              )
            },
            body: Buffer.from(file.buffer)
          })
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`)
          }
          
          results.push({
            identifier: metadata.identifier,
            filename: standardizedFilename,
            originalFilename: file.originalname,
            success: true,
            message: 'File uploaded successfully'
          })
          
          await delay(1000)
          
        } catch (error) {
          console.error(`❌ Upload failed for ${metadata.identifier}:`, error)
          results.push({
            identifier: metadata.identifier,
            filename: standardizedFilename,
            originalFilename: file.originalname,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      const successful = results.filter(r => r.success).length
      
      res.json({
        success: true,
        results,
        summary: {
          total: files.length,
          successful,
          failed: files.length - successful
        }
      })
      
    } catch (error) {
      console.error('Batch image upload error:', error)
      
      if (error instanceof Error && error.message.includes('credentials')) {
        return res.status(401).json({ error: error.message })
      }
      res.status(500).json({ error: 'Batch upload failed' })
    }
  })
})

// API ENDPOINT: GET /health
// Simple health check endpoint to verify the server is running
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// YouTube OAuth endpoints
app.get('/auth/youtube/test', (_req, res) => {
  try {
    const config = getYouTubeOAuthCredentials()
    if (!config) {
      return res.json({ 
        configured: false, 
        error: 'YouTube OAuth not configured' 
      })
    }
    
    res.json({ 
      configured: true,
      clientId: config.clientId,
      redirectUri: config.redirectUri
    })
  } catch (error) {
    res.json({ 
      configured: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
})

// Start YouTube OAuth flow
app.get('/auth/youtube', (_req, res) => {
  try {
    const oauth2Client = createOAuth2Client()
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.force-ssl'],
      prompt: 'consent' // Force consent to get refresh token
    })
    
    res.redirect(authUrl)
  } catch (error) {
    console.error('YouTube OAuth initiation error:', error)
    res.status(500).json({ 
      error: 'Failed to initiate YouTube OAuth',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Handle YouTube OAuth callback
app.get('/auth/youtube/callback', async (req, res) => {
  try {
    const { code, error } = req.query
    
    if (error) {
      console.error('YouTube OAuth error:', error)
      return res.status(400).send(`OAuth Error: ${error}`)
    }
    
    if (!code || typeof code !== 'string') {
      return res.status(400).send('Missing authorization code')
    }
    
    const oauth2Client = createOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)
    
    // Note: Token storage would need to be implemented
    // using environment variables, external database, or file system
    console.log('YouTube OAuth successful - tokens received:', {
      access_token: tokens.access_token ? 'present' : 'missing',
      refresh_token: tokens.refresh_token ? 'present' : 'missing',
      expires_at: tokens.expiry_date
    })
    
    res.send(`
      <html>
        <body>
          <h2>YouTube OAuth Successful!</h2>
          <p>You can now close this window.</p>
          <p><strong>Note:</strong> Token storage needs to be implemented.</p>
        </body>
      </html>
    `)
  } catch (error) {
    console.error('YouTube OAuth callback error:', error)
    res.status(500).send(`OAuth Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
})

// Check YouTube OAuth status
app.get('/auth/youtube/status', (_req, res) => {
  try {
    const config = getYouTubeOAuthCredentials()
    if (!config) {
      return res.json({ authenticated: false, error: 'OAuth not configured' })
    }
    
    // Without database, we can't check stored tokens
    res.json({ 
      authenticated: false, 
      error: 'Token storage not implemented',
      configured: true
    })
  } catch (error) {
    console.error('YouTube OAuth status error:', error)
    res.json({ 
      authenticated: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
})

// API ENDPOINT: POST /youtube/update-recording-dates-stream
// This endpoint updates YouTube video recording dates using Server-Sent Events
app.post('/youtube/update-recording-dates-stream', async (req, res) => {
  try {
    const { items } = youtubeUpdateRecordingDatesStreamSchema.parse(req.body)
    
    console.log(`🎬 Starting YouTube recording date updates for ${items.length} items`)
    
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive') 
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    const sendProgress = (data: ProgressData) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    
    sendProgress({ type: 'start', total: items.length })
    
    try {
      await getAuthenticatedYouTubeClient()
      const results = []
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        
        try {
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'updating'
          })
          
          // Note: This would require implementing YouTube API calls
          // For now, we'll simulate the process
          console.log(`🎬 Would update recording date for ${item.identifier} to ${item.recordingdate}`)
          
          results.push({
            identifier: item.identifier,
            success: false,
            error: 'YouTube API integration not fully implemented'
          })
          
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'error',
            error: 'Not implemented'
          })
          
        } catch (error) {
          results.push({
            identifier: item.identifier,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      const successful = results.filter(r => r.success).length
      sendProgress({
        type: 'complete',
        total: items.length,
        successful,
        failed: items.length - successful,
        results
      })
      
    } catch (authError) {
      sendProgress({
        type: 'error',
        error: authError instanceof Error ? authError.message : 'Authentication failed'
      })
    }
    
    res.end()
    
  } catch (error) {
    console.error('YouTube recording dates update error:', error)
    
    if (error instanceof z.ZodError) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid request format' })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Update failed' })}\n\n`)
    }
    
    res.end()
  }
})

// API ENDPOINT: POST /youtube/get-descriptions
// This endpoint fetches YouTube video descriptions
app.post('/youtube/get-descriptions', async (req, res) => {
  try {
    const { items } = youtubeGetDescriptionsSchema.parse(req.body)
    
    console.log(`📄 Fetching YouTube descriptions for ${items.length} items`)
    
    const results = []
    
    for (const item of items) {
      try {
        // Note: This would require implementing YouTube API calls
        console.log(`📄 Would fetch description for ${item.identifier}`)
        
        results.push({
          identifier: item.identifier,
          success: false,
          error: 'YouTube API integration not fully implemented'
        })
        
      } catch (error) {
        results.push({
          identifier: item.identifier,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    res.json({
      results,
      summary: {
        total: items.length,
        successful: 0,
        failed: items.length
      }
    })
    
  } catch (error) {
    console.error('YouTube get descriptions error:', error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request format' })
    }
    res.status(500).json({ error: 'Failed to get descriptions' })
  }
})

// API ENDPOINT: POST /youtube/update-descriptions-stream
// This endpoint updates YouTube video descriptions using Server-Sent Events
app.post('/youtube/update-descriptions-stream', async (req, res) => {
  try {
    const { items } = youtubeUpdateDescriptionsStreamSchema.parse(req.body)
    
    console.log(`📝 Starting YouTube description updates for ${items.length} items`)
    
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    
    const sendProgress = (data: ProgressData) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    
    sendProgress({ type: 'start', total: items.length })
    
    try {
      await getAuthenticatedYouTubeClient()
      const results = []
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        
        try {
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'updating'
          })
          
          // Note: This would require implementing YouTube API calls
          console.log(`📝 Would update description for ${item.identifier}`)
          
          results.push({
            identifier: item.identifier,
            success: false,
            error: 'YouTube API integration not fully implemented'
          })
          
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'error',
            error: 'Not implemented'
          })
          
        } catch (error) {
          results.push({
            identifier: item.identifier,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: items.length,
            identifier: item.identifier,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
      
      const successful = results.filter(r => r.success).length
      sendProgress({
        type: 'complete',
        total: items.length,
        successful,
        failed: items.length - successful,
        results
      })
      
    } catch (authError) {
      sendProgress({
        type: 'error',
        error: authError instanceof Error ? authError.message : 'Authentication failed'
      })
    }
    
    res.end()
    
  } catch (error) {
    console.error('YouTube descriptions update error:', error)
    
    if (error instanceof z.ZodError) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid request format' })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Update failed' })}\n\n`)
    }
    
    res.end()
  }
})

// API ENDPOINT: GET /metadata/:identifier
// This endpoint fetches metadata for a specific Archive.org item
app.get('/metadata/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params
    
    if (!identifier) {
      return res.status(400).json({ error: 'Missing identifier' })
    }
    
    console.log(`📦 Fetching fresh metadata for ${identifier}`)
    
    // Make direct API call to Archive.org
    const response = await makeArchiveApiCall(async () => {
      const url = buildArchiveMetadataUrl(identifier)
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Archive.org API error: ${response.status} ${response.statusText}`)
      }
      
      return await response.json()
    }, `Metadata fetch for ${identifier}`)
    
    console.log(`✅ Fetched fresh metadata for ${identifier}`)
    
    res.json({
      identifier,
      metadata: response,
    })
    
  } catch (error) {
    console.error(`Metadata fetch error for ${req.params.identifier}:`, error)
    res.status(500).json({ 
      error: 'Failed to fetch metadata',
      identifier: req.params.identifier 
    })
  }
})

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  
  try {
    getArchiveCredentials()
    console.log('Archive.org credentials loaded successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.warn('Warning:', errorMessage)
    console.warn('Please configure your Archive.org credentials in the .env file')
  }
  
  // Check YouTube credentials
  const youtubeConfig = getYouTubeCredentials()
  if (youtubeConfig) {
    console.log('YouTube integration enabled')
    console.log(`YouTube Channel ID: ${youtubeConfig.channelId}`)
  } else {
    console.log('YouTube integration not configured (optional)')
  }
  
  console.log('🚀 Server ready - all cache functionality removed, direct API calls enabled')
})
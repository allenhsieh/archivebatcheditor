// Import all the libraries we need for our server
import express from 'express'  // Express.js - makes it easy to build web servers in Node.js
import cors from 'cors'        // CORS - allows our web app to talk to our server (different ports)
import helmet from 'helmet'    // Helmet - adds security headers to protect against common attacks
import { z } from 'zod'        // Zod - validates that data sent to our API has the right format
import Database from 'better-sqlite3'  // SQLite database for caching
import path from 'path'        // Path utilities for cache directory

// Create our Express server app
const app = express()
// Get the port number from environment variables, or use 3001 as default
const PORT = process.env.PORT || 3001

// SQLite Cache configuration
// This caching system helps us avoid hitting API limits by storing previous results locally
const CACHE_DB_PATH = path.join(process.cwd(), 'cache.db')  // Database file in project root
const CACHE_EXPIRY_DAYS = 30 // Cache entries expire after 30 days to keep data fresh

// Initialize SQLite database
let db: Database.Database

const initializeDatabase = () => {
  try {
    // Create a new SQLite database file (or connect to existing one)
    db = new Database(CACHE_DB_PATH)
    
    // Create tables for storing cached data
    // YouTube cache: stores search results to avoid repeated API calls (saves quota)
    db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,  -- Unique row identifier
        cache_key TEXT UNIQUE NOT NULL,        -- Hash of search parameters
        title TEXT NOT NULL,                   -- Video title searched
        date TEXT,                            -- Date from Archive.org item
        channel_id TEXT,                      -- YouTube channel ID
        result TEXT,                          -- JSON string of the YouTube match result
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- When this was cached
      )
    `)
    
    // Metadata cache: stores Archive.org item metadata to speed up loading
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata_cache (
        identifier TEXT PRIMARY KEY,          -- Archive.org item identifier (unique)
        metadata TEXT,                        -- JSON string of Archive.org metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- When this was cached
      )
    `)
    
    // Create indexes for faster database lookups (like adding bookmarks to a book)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_cache_key ON youtube_cache(cache_key)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_youtube_created ON youtube_cache(created_at)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_metadata_identifier ON metadata_cache(identifier)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_metadata_created ON metadata_cache(created_at)`)
    
    console.log('📁 SQLite cache database initialized')
    
  } catch (error) {
    console.warn('Failed to initialize cache database:', error)
  }
}

// Generate cache key from search parameters
// This creates a unique string from search data so we can find cached results later
const generateCacheKey = (data: any): string => {
  // Convert the search data to JSON, then to base64, then make it filename-safe
  return Buffer.from(JSON.stringify(data)).toString('base64').replace(/[/+=]/g, '_')
}

// Clean up expired cache entries
// This runs automatically to remove old cached data and keep the database small
const cleanupExpiredCache = () => {
  try {
    if (!db) return
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - CACHE_EXPIRY_DAYS)
    
    const youtubeDeleted = db.prepare(`DELETE FROM youtube_cache WHERE created_at < ?`).run(cutoffDate.toISOString()).changes
    const metadataDeleted = db.prepare(`DELETE FROM metadata_cache WHERE created_at < ?`).run(cutoffDate.toISOString()).changes
    
    if (youtubeDeleted > 0 || metadataDeleted > 0) {
      console.log(`🗑️  Cleaned up ${youtubeDeleted} YouTube + ${metadataDeleted} metadata expired cache entries`)
    }
  } catch (error) {
    console.warn('Failed to cleanup expired cache:', error)
  }
}

// Get YouTube result from cache
const getYouTubeFromCache = (title: string, date: string | undefined, channelId: string): any => {
  try {
    if (!db) return null
    
    const cacheKey = generateCacheKey({ title, date, channelId })
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - CACHE_EXPIRY_DAYS)
    
    const row = db.prepare(`
      SELECT result FROM youtube_cache 
      WHERE cache_key = ? AND created_at > ?
    `).get(cacheKey, cutoffDate.toISOString()) as { result: string } | undefined
    
    return row ? JSON.parse(row.result) : null
  } catch (error) {
    console.warn('Failed to get YouTube cache:', error)
    return null
  }
}

// Save YouTube result to cache
const saveYouTubeToCache = (title: string, date: string | undefined, channelId: string, result: any): void => {
  try {
    if (!db) return
    
    const cacheKey = generateCacheKey({ title, date, channelId })
    
    db.prepare(`
      INSERT OR REPLACE INTO youtube_cache (cache_key, title, date, channel_id, result)
      VALUES (?, ?, ?, ?, ?)
    `).run(cacheKey, title, date || null, channelId, JSON.stringify(result))
    
  } catch (error) {
    console.warn('Failed to save YouTube cache:', error)
  }
}

// Get metadata from cache
const getMetadataFromCache = (identifier: string): any => {
  try {
    if (!db) return null
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - CACHE_EXPIRY_DAYS)
    
    const row = db.prepare(`
      SELECT metadata FROM metadata_cache 
      WHERE identifier = ? AND created_at > ?
    `).get(identifier, cutoffDate.toISOString()) as { metadata: string } | undefined
    
    return row ? JSON.parse(row.metadata) : null
  } catch (error) {
    console.warn('Failed to get metadata cache:', error)
    return null
  }
}

// Save metadata to cache
const saveMetadataToCache = (identifier: string, metadata: any): void => {
  try {
    if (!db) return
    
    db.prepare(`
      INSERT OR REPLACE INTO metadata_cache (identifier, metadata)
      VALUES (?, ?)
    `).run(identifier, JSON.stringify(metadata))
    
  } catch (error) {
    console.warn('Failed to save metadata cache:', error)
  }
}

// Get cache statistics
const getCacheStats = () => {
  try {
    if (!db) return { youtube: 0, metadata: 0 }
    
    const youtubeCount = (db.prepare(`SELECT COUNT(*) as count FROM youtube_cache`).get() as { count: number }).count
    const metadataCount = (db.prepare(`SELECT COUNT(*) as count FROM metadata_cache`).get() as { count: number }).count
    
    return { youtube: youtubeCount, metadata: metadataCount }
  } catch (error) {
    console.warn('Failed to get cache stats:', error)
    return { youtube: 0, metadata: 0 }
  }
}

// Set up middleware (code that runs before our API endpoints)
app.use(helmet())       // Add security headers to all responses
app.use(cors())         // Allow cross-origin requests (frontend on port 3000 → backend on port 3001)
app.use(express.json()) // Automatically parse JSON data from POST requests

// Define what valid search requests should look like using Zod
// This ensures users send us a 'q' parameter that's a non-empty string
const searchQuerySchema = z.object({
  q: z.string().min(1)  // 'q' must be a string with at least 1 character
})

// Define what valid metadata update requests should look like
// This ensures the frontend sends us properly formatted data
const updateRequestSchema = z.object({
  items: z.array(z.string()).min(1),     // Array of item IDs (at least 1)
  updates: z.array(z.object({            // Array of updates to make
    field: z.string().min(1),            // Field name (like 'title', 'creator')
    value: z.string(),                   // New value for the field
    operation: z.enum(['add', 'replace', 'remove'])  // What to do with the field
  })).min(1)                             // At least 1 update required
})

// URLs for the external APIs we'll be calling
const ARCHIVE_API_BASE = 'https://archive.org'                              // Main Archive.org API
const ARCHIVE_SEARCH_API = 'https://archive.org/services/search/v1/scrape'  // Newer search API
const ARCHIVE_LEGACY_SEARCH_API = 'https://archive.org/advancedsearch.php'  // Older search API
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'             // YouTube Data API

// Simple in-memory cache to avoid repeatedly fetching the same user's items
// This makes the app faster by storing results temporarily in server memory
let userItemsCache: { items: any[], timestamp: number, email: string } | null = null
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes in milliseconds (30 * 60 seconds * 1000ms)

// Rate limiting constants to avoid getting throttled by Archive.org
const API_DELAY_MS = 1000        // Wait 1 second between API calls
const RETRY_DELAY_MS = 5000      // Wait 5 seconds before retrying failed requests
const MAX_RETRIES = 3            // Maximum number of retry attempts

// Helper function to get Archive.org credentials from environment variables
// Environment variables are secret values stored outside the code (in .env file)
function getArchiveCredentials() {
  // Get the credentials from environment variables (loaded from .env file)
  const accessKey = process.env.ARCHIVE_ACCESS_KEY  // Your Archive.org access key
  const secretKey = process.env.ARCHIVE_SECRET_KEY  // Your Archive.org secret key  
  const email = process.env.ARCHIVE_EMAIL          // Your Archive.org email
  
  // Make sure all required credentials are present
  if (!accessKey || !secretKey) {
    throw new Error('Archive.org credentials not configured. Please set ARCHIVE_ACCESS_KEY and ARCHIVE_SECRET_KEY environment variables.')
  }
  
  if (!email) {
    throw new Error('Archive.org email not configured. Please set ARCHIVE_EMAIL environment variable.')
  }
  
  // Return the credentials as an object
  return { accessKey, secretKey, email }
}

// Helper function to get YouTube API credentials (optional feature)
// Returns null if not configured, which disables YouTube integration
function getYouTubeCredentials() {
  // Get YouTube credentials from environment variables
  const apiKey = process.env.YOUTUBE_API_KEY      // Your YouTube API key from Google Cloud
  const channelId = process.env.YOUTUBE_CHANNEL_ID // Your YouTube channel ID
  
  // YouTube integration is optional - return null if not configured
  if (!apiKey || !channelId) {
    return null // This will disable YouTube features
  }
  
  return { apiKey, channelId }
}

// Helper function to add delays between API calls (prevents rate limiting)
// Archive.org doesn't like too many requests at once!
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper function to check if an error is a rate limit error
function isRateLimitError(error: any): boolean {
  // Check for common rate limiting indicators
  if (error?.status === 429) return true                    // HTTP 429 = Too Many Requests
  if (error?.status === 503) return true                    // HTTP 503 = Service Unavailable (often rate limiting)
  if (error?.message?.toLowerCase().includes('rate limit')) return true
  if (error?.message?.toLowerCase().includes('too many requests')) return true
  return false
}

// Helper function to make Archive.org API calls with automatic retries
async function makeArchiveApiCall<T>(apiCall: () => Promise<T>, context: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`${context} - Attempt ${attempt}/${MAX_RETRIES}`)
      
      // Add delay before each attempt (except the first one)
      if (attempt > 1) {
        console.log(`Waiting ${RETRY_DELAY_MS}ms before retry...`)
        await delay(RETRY_DELAY_MS)
      }
      
      const result = await apiCall()
      
      // If we get here, the call succeeded
      if (attempt > 1) {
        console.log(`${context} - Succeeded on attempt ${attempt}`)
      }
      
      return result
      
    } catch (error) {
      console.error(`${context} - Attempt ${attempt} failed:`, error)
      
      // If this was the last attempt, give up
      if (attempt === MAX_RETRIES) {
        console.error(`${context} - All ${MAX_RETRIES} attempts failed, giving up`)
        throw error
      }
      
      // If it's a rate limit error, wait longer before retrying
      if (isRateLimitError(error)) {
        console.log(`${context} - Rate limit detected, will retry after longer delay`)
        await delay(RETRY_DELAY_MS * 2) // Wait even longer for rate limits
      }
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw new Error('Unexpected end of retry logic')
}

// This function tries to find a matching YouTube video for an Archive.org item
// It's pretty smart - it tries multiple search strategies to find the best match
async function searchYouTubeForMatch(title: string, date?: string) {
  // First, check if YouTube integration is enabled
  const youtubeConfig = getYouTubeCredentials()
  if (!youtubeConfig) {
    console.log('No YouTube credentials configured')
    return null // Exit early if YouTube isn't set up
  }
  
  // Check cache first to avoid hitting YouTube API
  const cached = getYouTubeFromCache(title, date, youtubeConfig.channelId)
  if (cached) {
    console.log(`📦 Using cached YouTube result for: "${title}"`)
    return cached
  }
  
  console.log(`🔍 Searching YouTube API for: "${title}" (not in cache)`)
  
  try {
    // Parse the Archive.org title to extract useful parts
    // Example: "Radiohead @ Madison Square Garden on 2023-10-15" 
    // → band="Radiohead", venue="Madison Square Garden"
    const titleParts = title.split(' @ ')           // Split on " @ " to separate band from venue
    const band = titleParts[0]?.trim()              // Everything before " @ " is the band name
    const venue = titleParts[1]?.split(' on ')[0]?.trim() // Everything between " @ " and " on " is venue
    
    // Convert date formats to match what might be in YouTube titles
    // Archive.org uses YYYY-MM-DD, but YouTube titles often use MM.DD.YY
    let searchDate = date
    if (date) {
      if (date.match(/\d{4}-\d{2}-\d{2}/)) {  // If date looks like "2014-05-15"
        const [year, month, day] = date.split('-')   // Split into parts
        searchDate = `${month}.${day}.${year.slice(-2)}` // Convert to "05.15.14"
      } else if (date.match(/\d{2}\.\d{2}\.\d{2}/)) {  // If already in MM.DD.YY format
        searchDate = date  // Use as-is
      }
    }
    
    // Create multiple search queries to try, from most specific to least specific
    // This increases our chances of finding a match
    const searchQueries = [
      `${band} ${venue} ${searchDate}`.trim(),     // "Landfill Mango's Cafe 05.15.14" (most specific)
      `${band} ${venue}`.trim(),                   // "Landfill Mango's Cafe" (band + venue)
      `${band} ${searchDate}`.trim(),              // "Landfill 05.15.14" (band + date)
      band || title,                               // Just the band name
      title,                                       // Full original title (fallback)
    ].filter(Boolean)                              // Remove empty strings
     .filter((query, index, arr) => arr.indexOf(query) === index) // Remove duplicates
    
    console.log(`Trying ${searchQueries.length} search queries for: ${title}`)
    
    // Try each search query until we find a good match
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i]
      
      // Build the URL parameters for YouTube API search
      const searchParams = new URLSearchParams({
        part: 'id,snippet',                    // What data we want back from YouTube
        channelId: youtubeConfig.channelId,    // Only search within your channel
        q: searchQuery,                        // The search query
        type: 'video',                         // Only search for videos (not playlists)
        maxResults: '5',                       // Get up to 5 results to choose from
        order: 'relevance',                    // Sort by how relevant YouTube thinks they are
        key: youtubeConfig.apiKey              // Your YouTube API key for authentication
      })
      
      console.log(`[${i+1}/${searchQueries.length}] YouTube search query: "${searchQuery}"`)
      
      const response = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`)
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`YouTube API rate limit exceeded. Daily quota: 10,000 units, each search uses 100 units. Wait 24 hours or check your Google Cloud Console quota.`)
        }
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      
      console.log(`YouTube API response: ${data.items?.length || 0} items found`)
      if (data.items?.length > 0) {
        
        // Look through all the YouTube search results to find the best match
        // We'll score each result based on how well it matches what we're looking for
        for (let j = 0; j < data.items.length; j++) {
          const item = data.items[j]
          const videoTitle = item.snippet.title
          console.log(`Result ${j+1}: ${videoTitle}`)
          
          // Create a "score" for this video based on how well it matches
          let score = 0
          const lowerTitle = videoTitle.toLowerCase()  // Convert to lowercase for comparison
          const lowerBand = band?.toLowerCase() || ''  // Convert band name to lowercase too
          const lowerVenue = venue?.toLowerCase() || '' // Convert venue name to lowercase too
          
          // Add points for different types of matches (higher = better match)
          if (lowerBand && lowerTitle.includes(lowerBand)) {
            score += 15  // Band name match is very important = +15 points
          }
          
          if (lowerVenue && lowerTitle.includes(lowerVenue)) {
            score += 10  // Venue match is important = +10 points
          }
          
          // Check for date matches in multiple formats
          if (searchDate) {
            if (lowerTitle.includes(searchDate.toLowerCase())) {
              score += 20  // Date match is most important = +20 points
            }
            // Also check for original date format
            if (date && lowerTitle.includes(date)) {
              score += 20  // Original date format match = +20 points
            }
          }
          
          // Check for common venue keywords that might be in YouTube titles
          const venueKeywords = ['cafe', 'club', 'bar', 'venue', 'theater', 'hall', 'house']
          venueKeywords.forEach(keyword => {
            if (lowerVenue.includes(keyword) && lowerTitle.includes(keyword)) {
              score += 5  // Venue type match = +5 points
            }
          })
          
          console.log(`Score for "${videoTitle}": ${score} (band: ${lowerBand ? 'found' : 'missing'}, venue: ${lowerVenue ? 'found' : 'missing'}, date: ${searchDate ? 'found' : 'missing'})`)
          
          // If this video scored high enough, consider it a good match
          if (score >= 15) {  // Raised threshold for better matches
            console.log(`Using match with score ${score}: ${videoTitle}`)
            const result = {
              videoId: item.id.videoId,                                    // YouTube video ID  
              title: videoTitle,                                           // YouTube video title
              url: `https://youtu.be/${item.id.videoId}`,                 // Full YouTube URL
              publishedAt: item.snippet.publishedAt,                      // When video was uploaded
              // Try to extract useful info from the YouTube title
              extractedBand: extractBandFromTitle(videoTitle),            // Band name from YouTube title
              extractedVenue: extractVenueFromTitle(videoTitle),          // Venue name from YouTube title
              extractedDate: extractDateFromTitle(videoTitle)             // Date from YouTube title
            }
            
            // Cache the successful result
            saveYouTubeToCache(title, date, youtubeConfig.channelId, result)
            console.log(`💾 Cached YouTube result for future use`)
            
            return result
          }
        }
        
        // If no good scored match, fall back to first result
        const bestMatch = data.items[0]
        console.log(`No high-scoring match, using first result: ${bestMatch.snippet.title}`)
        const fallbackResult = {
          videoId: bestMatch.id.videoId,
          title: bestMatch.snippet.title,
          url: `https://youtu.be/${bestMatch.id.videoId}`,
          publishedAt: bestMatch.snippet.publishedAt,
          // Extract metadata from YouTube title
          extractedBand: extractBandFromTitle(bestMatch.snippet.title),
          extractedVenue: extractVenueFromTitle(bestMatch.snippet.title),
          extractedDate: extractDateFromTitle(bestMatch.snippet.title)
        }
        
        // Cache the fallback result
        saveYouTubeToCache(title, date, youtubeConfig.channelId, fallbackResult)
        console.log(`💾 Cached fallback YouTube result`)
        
        return fallbackResult
      } else {
        console.log(`No results for query "${searchQuery}"`)
      }
    }
    
    console.log('No YouTube matches found after trying all queries')
    
    // Cache the "no match" result to avoid repeated API calls
    saveYouTubeToCache(title, date, youtubeConfig.channelId, null)
    console.log(`💾 Cached "no match" result to avoid future API calls`)
    
    return null
  } catch (error) {
    console.error('YouTube search error:', error)
    if (error instanceof Error) {
      console.error('YouTube API error message:', error.message)
    }
    return null
  }
}

function extractBandFromTitle(title: string) {
  // Common patterns: "Band Name @ Venue" or "Band Name - Venue" or "Band Name live at Venue"
  const patterns = [
    /^([^@]+)\s*@/,
    /^([^-]+)\s*-/,
    /^([^(]+)\s*\(/,
    /^([^|]+)\s*\|/
  ]
  
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  
  return null
}

function extractVenueFromTitle(title: string) {
  console.log(`Extracting venue from: "${title}"`)
  
  // Look for patterns like "@ Venue Name" but exclude dates
  const patterns = [
    /@\s*([^@]+?)\s+on\s+[\d./-]+/,  // @ Venue on DATE - capture everything between @ and "on"
    /@\s*([^(|,\-]+)/,               // @ Venue - fallback for other cases
    /\sat\s+([^(|,\-]+?)\s+on\s+[\d./-]+/i, // at Venue on DATE
    /\sat\s+([^(|,\-]+)/i,           // at Venue - fallback
  ]
  
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) {
      console.log(`Venue pattern matched: "${match[1].trim()}"`)
      return match[1].trim()
    }
  }
  
  console.log('No venue pattern matched')
  return null
}

function extractDateFromTitle(title: string) {
  // Look for date patterns like YYYY-MM-DD, MM.DD.YY, MM/DD/YY, etc.
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD
    /(\d{2}\.\d{2}\.\d{2,4})/, // MM.DD.YY or MM.DD.YYYY
    /(\d{2}\/\d{2}\/\d{2,4})/, // MM/DD/YY or MM/DD/YYYY
    /(\d{1,2}-\d{1,2}-\d{2,4})/, // M-D-YY or MM-DD-YYYY
  ]
  
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) {
      return convertToArchiveFormat(match[1])
    }
  }
  
  return null
}

function convertToArchiveFormat(dateStr: string): string {
  // Convert various date formats to YYYY-MM-DD (Archive.org preferred format)
  try {
    if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
      return dateStr // Already in correct format
    }
    
    if (dateStr.match(/\d{2}\.\d{2}\.\d{2,4}/)) {
      // MM.DD.YY or MM.DD.YYYY format
      const [month, day, year] = dateStr.split('.')
      const fullYear = year.length === 2 ? `20${year}` : year
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    if (dateStr.match(/\d{2}\/\d{2}\/\d{2,4}/)) {
      // MM/DD/YY or MM/DD/YYYY format
      const [month, day, year] = dateStr.split('/')
      const fullYear = year.length === 2 ? `20${year}` : year
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    return dateStr // Return as-is if we can't convert
  } catch {
    return dateStr // Return original if parsing fails
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
    
    // Build parameters for Archive.org's search API with authentication
    const searchParams = new URLSearchParams({
      q: combinedQuery,                                                               // Combined query (user search + uploader filter)
      fl: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader',  // Include uploader field
      rows: '1000',                                                                   // Return up to 1000 results to handle large collections
      output: 'json',                                                                 // Return results as JSON
      sort: 'addeddate desc'                                                          // Sort by upload date (newest first) to ensure consistent results
    })
    
    // Use authenticated request to access uploader field
    const auth = btoa(`${accessKey}:${secretKey}`)
    const response = await fetch(`${ARCHIVE_LEGACY_SEARCH_API}?${searchParams}`, {
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
// It's smarter than the public search because it uses caching and authentication
// Example: GET /user-items or GET /user-items?refresh=true
app.get('/user-items', async (req, res) => {
  try {
    // Get user's Archive.org credentials to authenticate the request
    const { email, accessKey, secretKey } = getArchiveCredentials()
    
    // Check if we can use cached results (faster than calling Archive.org API every time)
    const now = Date.now()                           // Current time in milliseconds
    const forceRefresh = req.query.refresh === 'true' // User wants fresh data?
    
    // If we have cached data and it's still fresh, return it instead of calling Archive.org
    if (!forceRefresh && userItemsCache && 
        userItemsCache.email === email &&                    // Cache is for the same user
        (now - userItemsCache.timestamp) < CACHE_DURATION) { // Cache is still fresh (< 30 minutes old)
      console.log(`Returning cached items (${userItemsCache.items.length} items)`)
      return res.json({
        items: userItemsCache.items,
        total: userItemsCache.items.length,
        cached: true  // Let frontend know this data is cached
      })
    }
    
    console.log(`Searching for items by user email: ${email}`)
    
    // Use authenticated request to access uploader field (internal metadata)
    const searchParams = new URLSearchParams({
      q: `uploader:${email}`,
      fields: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader',
      count: '1000'
    })
    
    try {
      console.log(`Trying authenticated scrape API: ${ARCHIVE_SEARCH_API}?${searchParams}`)
      
      // Make authenticated request using S3 credentials
      const auth = btoa(`${accessKey}:${secretKey}`)
      const response = await fetch(`${ARCHIVE_SEARCH_API}?${searchParams}`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      })
      if (!response.ok) {
        throw new Error(`Archive.org scrape API error: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      
      // The scrape API returns data in different formats
      let items = []
      let totalFound = 0
      
      if (data.items && Array.isArray(data.items)) {
        items = data.items
        totalFound = data.total || items.length
      } else if (Array.isArray(data)) {
        items = data
        totalFound = items.length
      }
      
      if (totalFound > 0) {
        console.log(`Found ${totalFound} items using authenticated scrape API`)
        
        // Cache the results
        userItemsCache = {
          items: items,
          timestamp: now,
          email: email
        }
        
        return res.json({
          items: items,
          total: totalFound,
          cached: false
        })
      }
      
      console.log('Authenticated scrape API returned no items, trying legacy authenticated API')
      
      // Fallback to legacy API with authentication
      const legacyParams = new URLSearchParams({
        q: `uploader:${email}`,
        fl: 'identifier,title,creator,description,date,mediatype,collection,subject,uploader',
        rows: '100',
        output: 'json'
      })
      
      const legacyAuth = btoa(`${accessKey}:${secretKey}`)
      const legacyResponse = await fetch(`${ARCHIVE_LEGACY_SEARCH_API}?${legacyParams}`, {
        headers: {
          'Authorization': `Basic ${legacyAuth}`
        }
      })
      if (!legacyResponse.ok) {
        throw new Error(`Archive.org legacy API error: ${legacyResponse.status} ${legacyResponse.statusText}`)
      }
      const legacyData = await legacyResponse.json()
      
      const legacyItems = legacyData.response?.docs || []
      const legacyFound = legacyData.response?.numFound || 0
      
      console.log(`Legacy authenticated API found ${legacyFound} items`)
      
      // Cache the legacy results too
      if (legacyFound > 0) {
        userItemsCache = {
          items: legacyItems,
          timestamp: now,
          email: email
        }
      }
      
      res.json({
        items: legacyItems,
        total: legacyFound,
        cached: false
      })
      
    } catch (apiError) {
      console.error('Both authenticated APIs failed:', apiError)
      res.status(500).json({ error: 'Failed to search Archive.org APIs with authentication' })
    }
    
  } catch (error) {
    console.error('User items error:', error)
    if (error instanceof Error && error.message.includes('credentials')) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Failed to load user items' })
  }
})

// Helper function to get current metadata for an item to check if update is needed
async function getCurrentMetadata(identifier: string, accessKey: string, secretKey: string): Promise<any> {
  // Check cache first
  const cached = getMetadataFromCache(identifier)
  if (cached) {
    console.log(`📦 Using cached metadata for: ${identifier}`)
    return cached
  }
  
  try {
    console.log(`🔍 Fetching metadata from Archive.org for: ${identifier} (not in cache)`)
    const response = await fetch(`${ARCHIVE_API_BASE}/metadata/${identifier}`, {
      headers: {
        'Authorization': `Basic ${btoa(`${accessKey}:${secretKey}`)}`
      }
    })
    
    if (!response.ok) {
      console.log(`Could not fetch metadata for ${identifier}, proceeding with update`)
      return null
    }
    
    const data = await response.json()
    const metadata = data.metadata || null
    
    // Cache the metadata
    if (metadata) {
      saveMetadataToCache(identifier, metadata)
      console.log(`💾 Cached metadata for ${identifier}`)
    }
    
    return metadata
  } catch (error) {
    console.log(`Error fetching metadata for ${identifier}, proceeding with update`)
    return null
  }
}

// This function updates metadata for a single Archive.org item
// The tricky part: Archive.org requires 'add' for new fields, 'replace' for existing fields
// Since we can't know beforehand, we try 'add' first, then 'replace' if it fails
// NOW WITH RATE LIMITING: We add delays to avoid getting throttled!
// SMART SKIPPING: Skip updates if the field already has the target value!
async function updateItemMetadata(identifier: string, updates: any[], accessKey: string, secretKey: string) {
  // First, get current metadata to check if updates are needed
  const currentMetadata = await getCurrentMetadata(identifier, accessKey, secretKey)
  
  // Note: Removed blanket curation check as many curated items can still be edited
  // We'll handle specific edit restrictions when they occur during the API call
  
  // Process each metadata update one by one (safer than doing them all at once)
  const actualUpdates = []
  const skippedUpdates = []
  
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i]
    
    // Check if this update is actually needed
    if (currentMetadata && currentMetadata[update.field]) {
      const currentValue = Array.isArray(currentMetadata[update.field]) 
        ? currentMetadata[update.field][0]  // Take first value if it's an array
        : currentMetadata[update.field]
      
      // If current value matches target value, skip this update
      if (currentValue === update.value) {
        console.log(`   ⏭️  SKIPPING ${update.field}: already set to "${update.value}"`)
        skippedUpdates.push(update)
        continue
      } else {
        console.log(`   🔄 UPDATING ${update.field}: "${currentValue}" → "${update.value}"`)
      }
    } else {
      console.log(`   ➕ ADDING ${update.field}: "${update.value}" (field doesn't exist)`)
    }
    
    actualUpdates.push(update)
  }
  
  // If all updates were skipped, return early
  if (actualUpdates.length === 0) {
    console.log(`   ✅ All fields already up-to-date, nothing to change!`)
    return { skipped: skippedUpdates.length, updated: 0 }
  }
  
  console.log(`   🎯 Will update ${actualUpdates.length} field(s), skip ${skippedUpdates.length} field(s)`)
  
  // Now process only the updates that are actually needed
  for (let i = 0; i < actualUpdates.length; i++) {
    const update = actualUpdates[i]
    
    // Add delay between updates to avoid rate limiting (except for first update)
    if (i > 0) {
      console.log(`Waiting ${API_DELAY_MS}ms before next update...`)
      await delay(API_DELAY_MS)
    }
    const path = `/${update.field}`           // Archive.org wants field names like "/title" or "/creator"
    let operation = update.operation          // What the user wants to do: 'add', 'replace', or 'remove'
    
    console.log(`Processing field ${i + 1}/${updates.length}: ${update.field} = ${update.value}`)
    console.log(`🔍 DEBUG: About to prepare Archive.org API request...`)
    
    // Smart strategy: For 'replace' operations, try 'add' first
    // Why? 'add' works for both new AND existing fields in most cases
    if (operation === 'replace') {
      operation = 'add'  // Try 'add' first - if it fails, we'll retry with 'replace'
    }
    
    // Create the "patch" object that tells Archive.org what to do
    // Archive.org API expects objects like: {"add": "/title", "value": "New Title"}
    const patch = operation === 'remove' 
      ? { remove: path, value: update.value }  // For removing fields
      : { add: path, value: update.value }     // For adding/updating fields
    
    console.log(`Updating ${identifier}: ${operation} ${update.field} = ${update.value}`)
    
    // Prepare the data to send to Archive.org's metadata API
    // Archive.org has a very specific format it expects
    const requestData = {
      '-target': 'metadata',                  // Tell Archive.org we're updating metadata
      '-patch': JSON.stringify([patch]),     // The actual changes, as a JSON string
      'access': accessKey,                   // Your Archive.org access key (for authentication)
      'secret': secretKey                    // Your Archive.org secret key (for authentication)
    }
    
    // Convert the data to "form-encoded" format (like HTML form submission)
    // Archive.org expects data like: "-target=metadata&-patch=%5B...&access=..."
    const formData = Object.keys(requestData)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(requestData[key as keyof typeof requestData])}`)
      .join('&')  // Join with '&' to create: "key1=value1&key2=value2&..."
    
    // DEBUG: Log the exact request being sent to Archive.org
    console.log(`\n=== DEBUGGING ARCHIVE.ORG REQUEST ===`)
    console.log(`Identifier: ${identifier}`)
    console.log(`URL: ${ARCHIVE_API_BASE}/metadata/${identifier}`)
    console.log(`Headers: Content-Type: application/x-www-form-urlencoded`)
    console.log(`Raw patch data:`, JSON.stringify(patch, null, 2))
    console.log(`Request data object:`, JSON.stringify(requestData, null, 2))
    console.log(`Form encoded body:`, formData)
    console.log(`Body length: ${formData.length} characters`)
    console.log(`=====================================\n`)
    
    let data
    try {
      // Use our retry wrapper for the API call
      const result = await makeArchiveApiCall(async () => {
        const response = await fetch(`${ARCHIVE_API_BASE}/metadata/${identifier}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData
        })
        
        // DEBUG: Log the response details
        console.log(`\n=== ARCHIVE.ORG RESPONSE ===`)
        console.log(`Status: ${response.status} ${response.statusText}`)
        console.log(`Headers:`, Object.fromEntries(response.headers.entries()))
        
        // Get response text to see what Archive.org actually returned
        const responseText = await response.text()
        console.log(`Response body:`, responseText)
        console.log(`===========================\n`)
        
        // Try to parse the response as JSON first
        let responseData
        try {
          responseData = JSON.parse(responseText)
        } catch (parseError) {
          console.error('Failed to parse response as JSON:', parseError)
          responseData = { rawResponse: responseText }
        }
        
        // For 400 errors with specific "already set" message, don't throw - return the data so we can handle retry
        if (response.status === 400 && responseData.error && responseData.error.includes("already set")) {
          return { response, data: responseData }
        }
        
        if (!response.ok) {
          const error = new Error(`Archive.org metadata API error: ${response.status} ${response.statusText}. Response: ${responseText}`)
          ;(error as any).status = response.status
          throw error
        }
        
        return { response, data: responseData }
      }, `Update ${identifier}:${update.field}`)
      
      data = result.data
      
      // Smart retry logic: If 'add' failed because the field already exists, try 'replace'
      // This happens when we tried to 'add' to a field that already has a value
      if (!data.success && data.error && data.error.includes("already set") && operation === 'add') {
        console.log(`Field ${update.field} already exists, retrying with replace...`)
        
        // Create a new patch using 'replace' instead of 'add'
        const replacePatch = { replace: path, value: update.value }
        const retryRequestData = {
          '-target': 'metadata',
          '-patch': JSON.stringify([replacePatch]),
          'access': accessKey,
          'secret': secretKey
        }
        
        const retryFormData = Object.keys(retryRequestData)
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(retryRequestData[key as keyof typeof retryRequestData])}`)
          .join('&')
        
        // Use retry wrapper for the replace operation too
        const { retryData } = await makeArchiveApiCall(async () => {
          const retryResponse = await fetch(`${ARCHIVE_API_BASE}/metadata/${identifier}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: retryFormData
          })
          
          if (!retryResponse.ok) {
            const error = new Error(`Archive.org metadata API error on retry: ${retryResponse.status} ${retryResponse.statusText}`)
            ;(error as any).status = retryResponse.status
            throw error
          }
          
          const retryData = await retryResponse.json()
          return { retryData }
        }, `Retry ${identifier}:${update.field} with replace`)
        if (!retryData.success) {
          throw new Error(retryData.error || 'Replace operation failed')
        }
        
        console.log(`Successfully replaced ${update.field} for ${identifier}`)
      } else if (!data.success) {
        throw new Error(data.error || 'Unknown error')
      } else {
        console.log(`Successfully updated ${update.field} for ${identifier}`)
      }
    } catch (error) {
      console.error(`Failed to update ${update.field} for ${identifier}:`, error)
      
      // Check if this is a curation-related error (only throw specific error for actual restrictions)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('curator') || errorMessage.includes('restricted') || errorMessage.includes('permission')) {
        throw new Error(`Item ${identifier} has editing restrictions. Contact Archive.org support if changes are needed. Original error: ${errorMessage}`)
      }
      
      throw error
    }
  }
  
  return { skipped: skippedUpdates.length, updated: actualUpdates.length }
}

// Real-time streaming endpoint for metadata updates
// Uses Server-Sent Events (SSE) to send progress updates to the browser as each item is processed
app.post('/update-metadata-stream', async (req, res) => {
  try {
    const { items, updates } = updateRequestSchema.parse(req.body)
    const { accessKey, secretKey } = getArchiveCredentials()
    
    // Set up Server-Sent Events headers
    // This tells the browser to keep the connection open and expect streaming data
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',  // SSE content type
      'Cache-Control': 'no-cache',          // Don't cache the stream
      'Connection': 'keep-alive',           // Keep connection open
      'Access-Control-Allow-Origin': '*',   // Allow cross-origin requests
      'Access-Control-Allow-Headers': 'Cache-Control',
    })
    
    // Helper function to send SSE events to the browser
    // Each event has a type and data that the frontend can listen for
    const sendEvent = (type: string, data: any) => {
      res.write(`event: ${type}\n`)          // Event type (e.g., 'progress', 'error')
      res.write(`data: ${JSON.stringify(data)}\n\n`)  // Event data as JSON
    }
    
    console.log(`🚀 BATCH UPDATE STARTED (STREAMING)`)
    console.log(`📊 Items: ${items.length} | Fields: ${updates.length}`)
    
    // Send initial start event
    sendEvent('start', {
      message: `Starting metadata update for ${items.length} items...`,
      totalItems: items.length
    })
    
    // Process items ONE AT A TIME to avoid overwhelming Archive.org
    const results = []
    for (let i = 0; i < items.length; i++) {
      const identifier = items[i]
      const progress = `[${i + 1}/${items.length}]`
      
      console.log(`\n${progress} 🔄 PROCESSING: ${identifier}`)
      
      // Send processing event
      sendEvent('processing', {
        identifier,
        progress: i + 1,
        total: items.length,
        message: `Processing ${identifier}...`
      })
      
      // Add delay between items (except for first item)
      if (i > 0) {
        console.log(`${progress} ⏳ Waiting ${API_DELAY_MS}ms...`)
        await delay(API_DELAY_MS)
      }
      
      try {
        const updateResult = await updateItemMetadata(identifier, updates, accessKey, secretKey)
        const result = {
          success: true,
          identifier,
          message: updateResult.updated === 0 
            ? `All ${updateResult.skipped} field(s) already up-to-date (skipped)`
            : updateResult.skipped > 0
              ? `Updated ${updateResult.updated} field(s), skipped ${updateResult.skipped} field(s)`
              : `Updated ${updateResult.updated} field(s) successfully`,
          progress: `${i + 1}/${items.length}`,
          skipped: updateResult.skipped,
          updated: updateResult.updated
        }
        results.push(result)
        
        // Send success event immediately
        sendEvent('success', {
          identifier,
          progress: i + 1,
          total: items.length,
          message: result.message,
          skipped: updateResult.skipped,
          updated: updateResult.updated
        })
        
        if (updateResult.updated === 0) {
          console.log(`${progress} ⏭️  SKIPPED: ${identifier} (no changes needed)`)
        } else {
          console.log(`${progress} ✅ SUCCESS: ${identifier} (${updateResult.updated} updated, ${updateResult.skipped} skipped)`)
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const result = {
          success: false,
          identifier,
          error: errorMessage,
          progress: `${i + 1}/${items.length}`,
          skipped: 0,
          updated: 0
        }
        results.push(result)
        
        // Send error event immediately
        sendEvent('error', {
          identifier,
          progress: i + 1,
          total: items.length,
          error: errorMessage
        })
        
        console.error(`${progress} ❌ FAILED: ${identifier} - ${errorMessage}`)
      }
      
      // Show progress every 10 items
      if ((i + 1) % 10 === 0 || i === items.length - 1) {
        const completed = i + 1
        const remaining = items.length - completed
        const percent = Math.round((completed / items.length) * 100)
        const successSoFar = results.filter(r => r.success).length
        const skippedSoFar = results.reduce((sum, r) => sum + (r.skipped || 0), 0)
        const updatedSoFar = results.reduce((sum, r) => sum + (r.updated || 0), 0)
        console.log(`\n📈 PROGRESS UPDATE: ${completed}/${items.length} (${percent}%) | ✅ ${successSoFar} success | 🔄 ${updatedSoFar} updated | ⏭️ ${skippedSoFar} skipped | ⏳ ${remaining} remaining`)
      }
    }
    
    // Calculate final statistics
    const successCount = results.filter(r => r.success).length
    const failureCount = results.length - successCount
    const successRate = Math.round((successCount / items.length) * 100)
    const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0)
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0)
    const fullySkippedItems = results.filter(r => r.success && r.updated === 0).length
    
    console.log(`\n════════════════════════════════════════════════════════════════`)
    console.log(`🎉 BATCH UPDATE COMPLETED (STREAMING)`)
    console.log(`📊 Total Items: ${items.length}`)
    console.log(`✅ Successful: ${successCount} (${successRate}%)`)
    console.log(`❌ Failed: ${failureCount}`)
    console.log(`🔄 Fields Updated: ${totalUpdated}`)
    console.log(`⏭️ Fields Skipped: ${totalSkipped} (already correct)`)
    console.log(`👍 Items Fully Up-to-Date: ${fullySkippedItems}`)
    console.log(`════════════════════════════════════════════════════════════════`)
    
    // Send completion event
    sendEvent('complete', {
      summary: {
        successCount,
        failureCount,
        totalItems: items.length,
        successRate,
        totalUpdated,
        totalSkipped,
        fullySkippedItems
      },
      message: `🎉 Batch update completed! ${successCount}/${items.length} items successful (${successRate}%)`
    })
    
    // Close the SSE connection
    res.end()
  } catch (error) {
    console.error('Update metadata error (streaming):', error)
    const errorMessage = error instanceof Error ? error.message : 'Metadata update failed'
    
    // Send error event and close connection
    res.write(`event: error\n`)
    res.write(`data: ${JSON.stringify({ 
      message: errorMessage,
      fatal: true 
    })}\n\n`)
    res.end()
  }
})

// Keep original endpoint as fallback for non-streaming clients
app.post('/update-metadata', async (req, res) => {
  try {
    const { items, updates } = updateRequestSchema.parse(req.body)
    const { accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`🚀 BATCH UPDATE STARTED`)
    console.log(`📊 Items: ${items.length} | Fields: ${updates.length}`)
    console.log(`⏱️  Estimated time: ~${Math.ceil((items.length * updates.length * API_DELAY_MS) / 1000)} seconds`)
    console.log(`════════════════════════════════════════════════════════════════`)
    
    // Process items ONE AT A TIME to avoid overwhelming Archive.org
    const results = []
    for (let i = 0; i < items.length; i++) {
      const identifier = items[i]
      const progress = `[${i + 1}/${items.length}]`
      
      console.log(`\n${progress} 🔄 PROCESSING: ${identifier}`)
      
      // Add delay between items (except for first item)
      if (i > 0) {
        console.log(`${progress} ⏳ Waiting ${API_DELAY_MS}ms...`)
        await delay(API_DELAY_MS)
      }
      
      try {
        const updateResult = await updateItemMetadata(identifier, updates, accessKey, secretKey)
        const result = {
          success: true,
          identifier,
          message: updateResult.updated === 0 
            ? `All ${updateResult.skipped} field(s) already up-to-date (skipped)`
            : updateResult.skipped > 0
              ? `Updated ${updateResult.updated} field(s), skipped ${updateResult.skipped} field(s)`
              : `Updated ${updateResult.updated} field(s) successfully`,
          progress: `${i + 1}/${items.length}`,
          skipped: updateResult.skipped,
          updated: updateResult.updated
        }
        results.push(result)
        
        if (updateResult.updated === 0) {
          console.log(`${progress} ⏭️  SKIPPED: ${identifier} (no changes needed)`)
        } else {
          console.log(`${progress} ✅ SUCCESS: ${identifier} (${updateResult.updated} updated, ${updateResult.skipped} skipped)`)
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const result = {
          success: false,
          identifier,
          error: errorMessage,
          progress: `${i + 1}/${items.length}`,
          skipped: 0,
          updated: 0
        }
        results.push(result)
        console.error(`${progress} ❌ FAILED: ${identifier} - ${errorMessage}`)
      }
      
      // Show progress every 10 items
      if ((i + 1) % 10 === 0 || i === items.length - 1) {
        const completed = i + 1
        const remaining = items.length - completed
        const percent = Math.round((completed / items.length) * 100)
        const successSoFar = results.filter(r => r.success).length
        const skippedSoFar = results.reduce((sum, r) => sum + (r.skipped || 0), 0)
        const updatedSoFar = results.reduce((sum, r) => sum + (r.updated || 0), 0)
        console.log(`\n📈 PROGRESS UPDATE: ${completed}/${items.length} (${percent}%) | ✅ ${successSoFar} success | 🔄 ${updatedSoFar} updated | ⏭️ ${skippedSoFar} skipped | ⏳ ${remaining} remaining`)
      }
    }
    
    // Calculate final statistics
    const successCount = results.filter(r => r.success).length
    const failureCount = results.length - successCount
    const successRate = Math.round((successCount / items.length) * 100)
    const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0)
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0)
    const fullySkippedItems = results.filter(r => r.success && r.updated === 0).length
    
    console.log(`\n════════════════════════════════════════════════════════════════`)
    console.log(`🎉 BATCH UPDATE COMPLETED!`)
    console.log(`📊 Total Items: ${items.length}`)
    console.log(`✅ Successful: ${successCount} (${successRate}%)`)
    console.log(`❌ Failed: ${failureCount}`)
    console.log(`🔄 Fields Updated: ${totalUpdated}`)
    console.log(`⏭️ Fields Skipped: ${totalSkipped} (already correct)`)
    console.log(`👍 Items Fully Up-to-Date: ${fullySkippedItems}`)
    console.log(`════════════════════════════════════════════════════════════════`)
    
    res.json({ 
      results,
      summary: { 
        successCount, 
        failureCount, 
        totalItems: items.length,
        successRate: successRate,
        totalUpdated,
        totalSkipped,
        fullySkippedItems
      }
    })
  } catch (error) {
    console.error('Update metadata error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid update request' })
    }
    if (error instanceof Error && error.message.includes('credentials')) {
      return res.status(401).json({ error: error.message })
    }
    res.status(500).json({ error: 'Metadata update failed' })
  }
})

app.post('/youtube-suggest', async (req, res) => {
  try {
    const { title, date } = req.body
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }
    
    const youtubeMatch = await searchYouTubeForMatch(title, date)
    
    if (youtubeMatch) {
      res.json({
        success: true,
        match: youtubeMatch,
        suggestions: {
          youtube: youtubeMatch.url,
          band: youtubeMatch.extractedBand,
          venue: youtubeMatch.extractedVenue,
          date: youtubeMatch.extractedDate
        }
      })
    } else {
      res.json({
        success: false,
        message: 'No YouTube match found'
      })
    }
  } catch (error) {
    console.error('YouTube suggest error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to search YouTube'
    res.status(500).json({ error: errorMessage })
  }
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Cache management endpoints
app.post('/cache/clear', async (req, res) => {
  try {
    const { type } = req.body // 'youtube', 'metadata', or 'all'
    
    if (!db) {
      return res.status(500).json({ error: 'Cache database not initialized' })
    }
    
    let youtubeCleared = 0
    let metadataCleared = 0
    
    if (type === 'youtube' || type === 'all') {
      youtubeCleared = db.prepare(`DELETE FROM youtube_cache`).run().changes
      console.log(`🗑️  Cleared ${youtubeCleared} YouTube cache entries`)
    }
    
    if (type === 'metadata' || type === 'all') {
      metadataCleared = db.prepare(`DELETE FROM metadata_cache`).run().changes
      console.log(`🗑️  Cleared ${metadataCleared} metadata cache entries`)
    }
    
    res.json({ 
      success: true, 
      message: `Cleared ${type} cache`,
      cleared: { youtube: youtubeCleared, metadata: metadataCleared }
    })
  } catch (error) {
    console.error('Cache clear error:', error)
    res.status(500).json({ error: 'Failed to clear cache' })
  }
})

app.get('/cache/stats', async (_req, res) => {
  try {
    const stats = getCacheStats()
    
    res.json({
      youtube: {
        entries: stats.youtube,
        table: 'youtube_cache'
      },
      metadata: {
        entries: stats.metadata,
        table: 'metadata_cache'
      },
      database: CACHE_DB_PATH,
      expiry: `${CACHE_EXPIRY_DAYS} days`
    })
  } catch (error) {
    console.error('Cache stats error:', error)
    res.status(500).json({ error: 'Failed to get cache stats' })
  }
})

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  
  // Initialize SQLite database
  initializeDatabase()
  
  // Clean up expired cache entries
  cleanupExpiredCache()
  
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
  
  // Show cache stats
  const stats = getCacheStats()
  console.log(`💾 Cache: ${stats.youtube} YouTube + ${stats.metadata} metadata entries (expire after ${CACHE_EXPIRY_DAYS} days)`)
})
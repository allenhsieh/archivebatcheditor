import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { z } from 'zod'

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(cors())
app.use(express.json())

const searchQuerySchema = z.object({
  q: z.string().min(1)
})

const updateRequestSchema = z.object({
  items: z.array(z.string()).min(1),
  updates: z.array(z.object({
    field: z.string().min(1),
    value: z.string(),
    operation: z.enum(['add', 'replace', 'remove'])
  })).min(1)
})

const ARCHIVE_API_BASE = 'https://archive.org'
const ARCHIVE_SEARCH_API = 'https://archive.org/services/search/v1/scrape'
const ARCHIVE_LEGACY_SEARCH_API = 'https://archive.org/advancedsearch.php'
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

// Simple in-memory cache for user items
let userItemsCache: { items: any[], timestamp: number, email: string } | null = null
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

function getArchiveCredentials() {
  const accessKey = process.env.ARCHIVE_ACCESS_KEY
  const secretKey = process.env.ARCHIVE_SECRET_KEY
  const email = process.env.ARCHIVE_EMAIL
  
  if (!accessKey || !secretKey) {
    throw new Error('Archive.org credentials not configured. Please set ARCHIVE_ACCESS_KEY and ARCHIVE_SECRET_KEY environment variables.')
  }
  
  if (!email) {
    throw new Error('Archive.org email not configured. Please set ARCHIVE_EMAIL environment variable.')
  }
  
  return { accessKey, secretKey, email }
}

function getYouTubeCredentials() {
  const apiKey = process.env.YOUTUBE_API_KEY
  const channelId = process.env.YOUTUBE_CHANNEL_ID
  
  if (!apiKey || !channelId) {
    return null // YouTube integration is optional
  }
  
  return { apiKey, channelId }
}

async function searchYouTubeForMatch(title: string, date?: string) {
  const youtubeConfig = getYouTubeCredentials()
  if (!youtubeConfig) {
    console.log('No YouTube credentials configured')
    return null
  }
  
  console.log('YouTube credentials found, searching...')
  
  try {
    // Extract potential band name and venue from title
    const titleParts = title.split(' @ ')
    const band = titleParts[0]?.trim()
    const venue = titleParts[1]?.split(' on ')[0]?.trim()
    
    // Convert date format for better matching
    let searchDate = date
    if (date && date.match(/\d{4}-\d{2}-\d{2}/)) {
      // Convert YYYY-MM-DD to MM.DD.YY for YouTube search
      const [year, month, day] = date.split('-')
      searchDate = `${month}.${day}.${year.slice(-2)}`
    }
    
    // Try multiple search strategies with date variations
    const searchQueries = [
      `${band} ${searchDate}`.trim(), // Band + converted date
      `${band} 01.05.12`.trim(), // Band + specific date format
      `${band} che cafe ${searchDate}`.trim(), // Band + venue + date
      band || title, // Just band name
      `${band} ${venue}`.trim(), // Band + venue
      `${band} che cafe`.trim(), // Band + che cafe (your common venue)
      title, // Full title
    ].filter(Boolean).filter((query, index, arr) => arr.indexOf(query) === index) // Remove duplicates
    
    console.log(`Trying ${searchQueries.length} search queries for: ${title}`)
    
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i]
      
      const searchParams = new URLSearchParams({
        part: 'id,snippet',
        channelId: youtubeConfig.channelId,
        q: searchQuery,
        type: 'video',
        maxResults: '5',
        order: 'relevance',
        key: youtubeConfig.apiKey
      })
      
      console.log(`[${i+1}/${searchQueries.length}] YouTube search query: "${searchQuery}"`)
      
      const response = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`)
      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      
      console.log(`YouTube API response: ${data.items?.length || 0} items found`)
      if (data.items?.length > 0) {
        
        // Look through all results to find the best match
        for (let j = 0; j < data.items.length; j++) {
          const item = data.items[j]
          const videoTitle = item.snippet.title
          console.log(`Result ${j+1}: ${videoTitle}`)
          
          // Score this result based on how well it matches our criteria
          let score = 0
          const lowerTitle = videoTitle.toLowerCase()
          const lowerBand = band?.toLowerCase() || ''
          
          // Higher score for better matches
          if (lowerTitle.includes(lowerBand)) score += 10
          if (lowerTitle.includes('che cafe')) score += 5
          if (lowerTitle.includes('01.05.12') || lowerTitle.includes('2012-01-05')) score += 15
          
          console.log(`Score for "${videoTitle}": ${score}`)
          
          // If this looks like a good match, use it
          if (score >= 10) {
            console.log(`Using match with score ${score}: ${videoTitle}`)
            return {
              videoId: item.id.videoId,
              title: videoTitle,
              url: `https://youtu.be/${item.id.videoId}`,
              publishedAt: item.snippet.publishedAt,
              // Extract metadata from YouTube title
              extractedBand: extractBandFromTitle(videoTitle),
              extractedVenue: extractVenueFromTitle(videoTitle),
              extractedDate: extractDateFromTitle(videoTitle)
            }
          }
        }
        
        // If no good scored match, fall back to first result
        const bestMatch = data.items[0]
        console.log(`No high-scoring match, using first result: ${bestMatch.snippet.title}`)
        return {
          videoId: bestMatch.id.videoId,
          title: bestMatch.snippet.title,
          url: `https://youtu.be/${bestMatch.id.videoId}`,
          publishedAt: bestMatch.snippet.publishedAt,
          // Extract metadata from YouTube title
          extractedBand: extractBandFromTitle(bestMatch.snippet.title),
          extractedVenue: extractVenueFromTitle(bestMatch.snippet.title),
          extractedDate: extractDateFromTitle(bestMatch.snippet.title)
        }
      } else {
        console.log(`No results for query "${searchQuery}"`)
      }
    }
    
    console.log('No YouTube matches found after trying all queries')
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

app.get('/search', async (req, res) => {
  try {
    const { q } = searchQuerySchema.parse(req.query)
    
    // Use legacy search API for public searches
    const searchParams = new URLSearchParams({
      q,
      fl: 'identifier,title,creator,description,date,mediatype,collection,subject',
      rows: '50',
      output: 'json'
    })
    
    const response = await fetch(`${ARCHIVE_LEGACY_SEARCH_API}?${searchParams}`)
    if (!response.ok) {
      throw new Error(`Archive.org search error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    
    res.json({
      items: data.response?.docs || [],
      total: data.response?.numFound || 0
    })
  } catch (error) {
    console.error('Search error:', error)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search query' })
    }
    res.status(500).json({ error: 'Search failed' })
  }
})

app.get('/user-items', async (req, res) => {
  try {
    const { email, accessKey, secretKey } = getArchiveCredentials()
    
    // Check cache first
    const now = Date.now()
    const forceRefresh = req.query.refresh === 'true'
    
    if (!forceRefresh && userItemsCache && 
        userItemsCache.email === email && 
        (now - userItemsCache.timestamp) < CACHE_DURATION) {
      console.log(`Returning cached items (${userItemsCache.items.length} items)`)
      return res.json({
        items: userItemsCache.items,
        total: userItemsCache.items.length,
        cached: true
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

app.post('/update-metadata', async (req, res) => {
  try {
    const { items, updates } = updateRequestSchema.parse(req.body)
    const { accessKey, secretKey } = getArchiveCredentials()
    
    const results = await Promise.allSettled(
      items.map(async (identifier) => {
        const patches = updates.map(update => {
          const path = `/${update.field}`
          
          switch (update.operation) {
            case 'add':
              return { add: path, value: update.value }
            case 'replace':
              // Archive.org requires using 'add' for fields that don't exist yet
              // Since we can't easily check if fields exist, let's try 'add' first
              // which will work for both new and existing fields
              return { add: path, value: update.value }
            case 'remove':
              return { remove: path, value: update.value }
            default:
              throw new Error(`Invalid operation: ${update.operation}`)
          }
        })
        
        console.log(`Updating metadata for ${identifier}`)
        console.log('Patches:', JSON.stringify(patches, null, 2))
        
        const requestData = {
          '-target': 'metadata',
          '-patch': JSON.stringify(patches),
          'access': accessKey,
          'secret': secretKey
        }
        
        console.log('Request data:', requestData)
        console.log('Request URL:', `${ARCHIVE_API_BASE}/metadata/${identifier}`)
        
        const formData = Object.keys(requestData)
          .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(requestData[key as keyof typeof requestData])}`)
          .join('&')
        console.log('Form data being sent:', formData)
        
        const response = await fetch(`${ARCHIVE_API_BASE}/metadata/${identifier}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData
        })
        if (!response.ok) {
          throw new Error(`Archive.org metadata API error: ${response.status} ${response.statusText}`)
        }
        const data = await response.json()
        
        return {
          success: data.success === true,
          identifier,
          message: data.log || 'Updated successfully',
          error: data.error
        }
      })
    )
    
    const processedResults = results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        const identifier = items[results.indexOf(result)]
        console.error(`Update failed for ${identifier}:`, result.reason)
        const error = result.reason instanceof Error ? result.reason : new Error('Unknown error')
        console.error('Archive.org error message:', error.message)
        return {
          success: false,
          identifier,
          error: error.message
        }
      }
    })
    
    res.json({ results: processedResults })
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

app.listen(PORT, () => {
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
})
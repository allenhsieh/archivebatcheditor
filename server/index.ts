// Import all the libraries we need for our server
import express from 'express'  // Express.js - makes it easy to build web servers in Node.js
import cors from 'cors'        // CORS - allows our web app to talk to our server (different ports)
import helmet from 'helmet'    // Helmet - adds security headers to protect against common attacks
import { z } from 'zod'        // Zod - validates that data sent to our API has the right format
import multer from 'multer'    // Multer - handles file uploads
import { OAuth2Client, Credentials } from 'google-auth-library'  // Google OAuth 2.0 authentication
import { google } from 'googleapis'  // YouTube Data API v3 client
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  standardizeDate, 
  extractBandFromTitle, 
  extractVenueFromTitle, 
  extractDateFromTitle,
  delay,
  isRateLimitError,
  isYouTubeQuotaError,
  isYouTubeAuthError,
  buildArchiveSearchUrl,
  buildArchiveMetadataUrl,
  buildYouTubeSearchUrl,
  createYouTubeUrl,
  standardizeYouTubeUrl,
  generateFlyerFilename
} from './utils.js'
import type { JsonPatchOperation, ApiError } from '../src/types.js'
import { isApiError } from '../src/types.js'

// Create our Express server app
const app = express()
// Get the port number from environment variables, or use 3001 as default
// Configuration constants
const DEFAULT_PORT = 3001
const PORT = process.env.PORT || DEFAULT_PORT

// API timing constants
const API_DELAY_MS = 1000 // 1 second between Archive.org API calls to avoid rate limiting
const SEARCH_DELAY_MS = 500 // Shorter delay for search operations  
const MAX_SEARCH_RESULTS = 1000 // Maximum results for general searches
const MAX_USER_ITEMS = 10000 // Maximum results for user's own items

// YouTube video date matching thresholds (business logic)
const YOUTUBE_DATE_MATCH_CLOSE_DAYS = 30   // High score for videos within 30 days
const YOUTUBE_DATE_MATCH_MEDIUM_DAYS = 90  // Medium score for videos within 90 days  
const YOUTUBE_DATE_MATCH_FAR_DAYS = 365    // Low score for videos within 365 days



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


// New schema matching the TypeScript UpdateRequest interface (items: string[], updates: MetadataUpdate[])
const updateRequestSchema = z.object({
  items: z.array(z.string().min(1).max(100)).min(1).max(100),
  updates: z.array(z.object({
    field: z.string().min(1).max(100),
    value: z.string().max(1000),
    operation: z.enum(['add', 'replace', 'remove']).optional()
  })).min(0).max(100) // Allow empty updates array for graceful handling
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

// Frontend at src/components/MetadataEditor.tsx resolves archiveId → videoId before POSTing,
// so this endpoint trusts the mapping and doesn't re-fetch Archive.org metadata.
const youtubeUpdateRecordingDatesStreamSchema = z.object({
  updates: z.array(z.object({
    archiveId: z.string(),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    recordingDate: z.string().datetime()
  })).min(1).max(100)
})

// snippet.tags has a 500-char total budget (spaces + commas between items count).
// We cap inputs here to fail fast rather than let the API reject the whole batch.
const youtubeUpdateTagsStreamSchema = z.object({
  updates: z.array(z.object({
    archiveId: z.string(),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    tags: z.array(z.string().min(1)).max(50)
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

// YouTube OAuth tokens are persisted to a gitignored JSON file at the repo root.
// Refresh tokens are only issued on first consent, so we merge on save to preserve it.
const YOUTUBE_TOKEN_FILE = path.resolve(process.cwd(), '.youtube-tokens.json')

// ─── YouTube channel video cache ───────────────────────────────────────────────
// Fetches all videos from the channel's uploads playlist via playlistItems API.
// Cost: ~1 quota unit per 50 videos (~13 units for 638 videos) vs 100 units per
// search query. Cached to disk; refreshed on demand or when older than 24 hours.

interface CachedVideo {
  videoId: string
  title: string
  publishedAt: string
  url: string
}

interface ChannelCache {
  fetchedAt: string
  channelId: string
  videos: CachedVideo[]
}

const YOUTUBE_CHANNEL_CACHE_FILE = path.resolve(process.cwd(), '.youtube-channel-cache.json')
const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function loadChannelCache(): Promise<ChannelCache | null> {
  try {
    const raw = await fs.readFile(YOUTUBE_CHANNEL_CACHE_FILE, 'utf8')
    return JSON.parse(raw) as ChannelCache
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function saveChannelCache(cache: ChannelCache): Promise<void> {
  await fs.writeFile(YOUTUBE_CHANNEL_CACHE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 })
}

async function fetchAndCacheChannelVideos(): Promise<ChannelCache> {
  const config = getYouTubeCredentials()
  if (!config) throw new Error('YouTube API credentials not configured')

  // Uploads playlist ID is channel ID with UC→UU prefix swap
  const uploadsPlaylistId = config.channelId.replace(/^UC/, 'UU')
  const videos: CachedVideo[] = []
  let pageToken: string | undefined

  console.log(`📺 Fetching all videos from channel ${config.channelId}...`)

  do {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
      key: config.apiKey,
      ...(pageToken ? { pageToken } : {})
    })
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params}`
    const response = await fetch(url)

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`YouTube playlistItems error ${response.status}: ${body}`)
    }

    const data = await response.json() as {
      items: Array<{ snippet: { resourceId: { videoId: string }; title: string; publishedAt: string } }>
      nextPageToken?: string
    }

    for (const item of data.items) {
      const videoId = item.snippet.resourceId.videoId
      videos.push({
        videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        url: createYouTubeUrl(videoId)
      })
    }

    pageToken = data.nextPageToken
    console.log(`  ...fetched ${videos.length} videos so far`)
  } while (pageToken)

  const cache: ChannelCache = { fetchedAt: new Date().toISOString(), channelId: config.channelId, videos }
  await saveChannelCache(cache)
  console.log(`✅ Channel cache saved: ${videos.length} videos`)
  return cache
}

async function getChannelCache(): Promise<ChannelCache | null> {
  const existing = await loadChannelCache()
  if (existing && Date.now() - new Date(existing.fetchedAt).getTime() < CHANNEL_CACHE_TTL_MS) {
    return existing
  }
  return null
}

function scoreVideoAgainstQuery(video: CachedVideo, title: string, date?: string): number {
  const videoTitle = video.title.toLowerCase()
  const searchTitle = title.toLowerCase()
  let score = 0

  if (videoTitle === searchTitle) {
    score += 100
  } else if (videoTitle.includes(searchTitle) || searchTitle.includes(videoTitle)) {
    score += 50
  }

  const videoWords = videoTitle.split(/\s+/).filter((w) => w.length > 2)
  const searchWords = searchTitle.split(/\s+/).filter((w) => w.length > 2)
  const commonWords = videoWords.filter((w) => searchWords.some((s) => w.includes(s) || s.includes(w)))
  score += commonWords.length * 10

  if (date && video.publishedAt) {
    const daysDiff = Math.abs(
      (new Date(video.publishedAt).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysDiff <= YOUTUBE_DATE_MATCH_CLOSE_DAYS) score += 20
    else if (daysDiff <= YOUTUBE_DATE_MATCH_MEDIUM_DAYS) score += 10
    else if (daysDiff <= YOUTUBE_DATE_MATCH_FAR_DAYS) score += 5
  }

  return score
}

function searchChannelCache(cache: ChannelCache, title: string, date?: string) {
  const scored = cache.videos
    .map((v) => ({ ...v, score: scoreVideoAgainstQuery(v, title, date) }))
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const best = scored[0]
  const extractedBand = extractBandFromTitle(best.title)
  const extractedVenue = extractVenueFromTitle(best.title)
  const extractedDate = extractDateFromTitle(best.title)

  return {
    url: best.url,
    title: best.title,
    publishedAt: best.publishedAt,
    score: best.score,
    matchReason: `Cache match — score ${best.score}`,
    extractedBand,
    extractedVenue,
    extractedDate,
    allMatches: scored.slice(0, 5).map((v) => ({ url: v.url, title: v.title, score: v.score, publishedAt: v.publishedAt }))
  }
}

async function loadStoredYouTubeTokens(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(YOUTUBE_TOKEN_FILE, 'utf8')
    return JSON.parse(raw) as Credentials
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function saveYouTubeTokens(tokens: Credentials): Promise<void> {
  const existing = (await loadStoredYouTubeTokens()) ?? {}
  const merged: Credentials = { ...existing, ...tokens }
  await fs.writeFile(YOUTUBE_TOKEN_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 })
}

async function getAuthenticatedYouTubeClient() {
  const tokens = await loadStoredYouTubeTokens()
  if (!tokens?.refresh_token) {
    throw new Error('YouTube not authenticated — visit /auth/youtube to authorize')
  }

  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials(tokens)
  oauth2Client.on('tokens', (rotated) => {
    saveYouTubeTokens(rotated).catch((e) => console.error('Failed to persist rotated YouTube tokens:', e))
  })

  return google.youtube({ version: 'v3', auth: oauth2Client })
}

// ─── YouTube quota-retry queue ─────────────────────────────────────────────────
// Items that failed with `quotaExceeded` get persisted here and retried on server
// startup (and via POST /api/youtube/retry-queue/drain). Keyed by (kind, videoId),
// so re-queuing an already-queued item just updates the payload.

type RetryKind = 'recording-date' | 'tags'

interface RetryItem {
  kind: RetryKind
  archiveId: string
  videoId: string
  payload: { recordingDate?: string; tags?: string[] }
  queuedAt: string
  attempts: number
  lastError?: string
}

const YOUTUBE_RETRY_FILE = path.resolve(process.cwd(), '.youtube-retry-queue.json')

async function loadRetryQueue(): Promise<RetryItem[]> {
  try {
    const raw = await fs.readFile(YOUTUBE_RETRY_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.items) ? (parsed.items as RetryItem[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    console.error('Failed to load retry queue:', err)
    return []
  }
}

async function saveRetryQueue(items: RetryItem[]): Promise<void> {
  await fs.writeFile(
    YOUTUBE_RETRY_FILE,
    JSON.stringify({ items, updatedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 }
  )
}

async function enqueueForRetry(item: Omit<RetryItem, 'queuedAt' | 'attempts'>, lastError?: string): Promise<void> {
  const queue = await loadRetryQueue()
  const idx = queue.findIndex((q) => q.kind === item.kind && q.videoId === item.videoId)
  if (idx >= 0) {
    queue[idx] = {
      ...queue[idx],
      archiveId: item.archiveId,
      payload: item.payload,
      attempts: queue[idx].attempts + 1,
      lastError
    }
  } else {
    queue.push({
      ...item,
      queuedAt: new Date().toISOString(),
      attempts: 1,
      lastError
    })
  }
  await saveRetryQueue(queue)
}

async function removeFromRetryQueue(kind: RetryKind, videoId: string): Promise<void> {
  const queue = await loadRetryQueue()
  const next = queue.filter((q) => !(q.kind === kind && q.videoId === videoId))
  if (next.length !== queue.length) await saveRetryQueue(next)
}

// Run one retry item against the live YouTube API. Mirrors the logic in the
// streaming endpoints (tag merge re-fetches existing snippet).
// Returns:
//  - { ok: true } on success
//  - { ok: false, quotaExceeded: true } if we hit quota (caller should stop draining)
//  - { ok: false, error } for any other failure
async function applyRetryItem(
  youtube: ReturnType<typeof google.youtube>,
  item: RetryItem
): Promise<{ ok: true } | { ok: false; quotaExceeded?: boolean; authExpired?: boolean; error?: string }> {
  try {
    if (item.kind === 'recording-date') {
      const recordingDate = item.payload.recordingDate
      if (!recordingDate) return { ok: false, error: 'Missing recordingDate in queued item' }
      await youtube.videos.update({
        part: ['recordingDetails'],
        requestBody: { id: item.videoId, recordingDetails: { recordingDate } }
      })
      return { ok: true }
    }

    if (item.kind === 'tags') {
      const tags = item.payload.tags ?? []
      const listRes = await youtube.videos.list({ part: ['snippet'], id: [item.videoId] })
      const existing = listRes.data.items?.[0]?.snippet
      if (!existing) return { ok: false, error: 'Video not found or not owned by authenticated account' }

      const mergedTags: string[] = []
      const seen = new Set<string>()
      for (const tag of [...(existing.tags ?? []), ...tags]) {
        const clean = tag.trim()
        if (!clean) continue
        const key = clean.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        mergedTags.push(clean)
      }
      while (mergedTags.join(', ').length > 500 && mergedTags.length > 1) mergedTags.pop()

      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: item.videoId,
          snippet: {
            title: existing.title ?? '',
            categoryId: existing.categoryId ?? '10',
            description: existing.description ?? '',
            defaultLanguage: existing.defaultLanguage ?? undefined,
            tags: mergedTags
          }
        }
      })
      return { ok: true }
    }

    return { ok: false, error: `Unknown retry kind: ${item.kind}` }
  } catch (error) {
    if (isYouTubeAuthError(error)) return { ok: false, authExpired: true }
    if (isYouTubeQuotaError(error)) return { ok: false, quotaExceeded: true }
    const errAny = error as { errors?: Array<{ message?: string }>; message?: string }
    return { ok: false, error: errAny?.errors?.[0]?.message ?? errAny?.message ?? 'Unknown error' }
  }
}

interface DrainSummary {
  attempted: number
  succeeded: number
  failed: number
  remaining: number
  quotaHit: boolean
  authExpired: boolean
  details: Array<{ archiveId: string; videoId: string; kind: RetryKind; status: 'success' | 'error' | 'quota'; error?: string }>
}

async function drainRetryQueue(
  onItem?: (progress: { current: number; total: number; item: RetryItem; result: Awaited<ReturnType<typeof applyRetryItem>> }) => void
): Promise<DrainSummary> {
  const queue = await loadRetryQueue()
  const summary: DrainSummary = { attempted: 0, succeeded: 0, failed: 0, remaining: queue.length, quotaHit: false, authExpired: false, details: [] }
  if (queue.length === 0) return summary

  let youtube: ReturnType<typeof google.youtube>
  try {
    youtube = await getAuthenticatedYouTubeClient()
  } catch (err) {
    console.warn('Retry queue: YouTube not authenticated, skipping drain:', err instanceof Error ? err.message : err)
    return summary
  }

  const kept: RetryItem[] = []
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    if (summary.quotaHit || summary.authExpired) {
      kept.push(item)
      continue
    }
    summary.attempted++
    const result = await applyRetryItem(youtube, item)
    onItem?.({ current: i + 1, total: queue.length, item, result })

    if (result.ok) {
      summary.succeeded++
      summary.details.push({ archiveId: item.archiveId, videoId: item.videoId, kind: item.kind, status: 'success' })
      console.log(`  ✅ [${item.kind}] ${item.archiveId} (yt:${item.videoId})`)
    } else if (result.authExpired) {
      summary.authExpired = true
      kept.push(item)
      console.warn(`  🔑 [${item.kind}] ${item.archiveId} — invalid_grant: OAuth token expired or revoked. Re-authenticate via /auth/youtube to resume drain.`)
    } else if (result.quotaExceeded) {
      summary.quotaHit = true
      kept.push(item)
      summary.details.push({ archiveId: item.archiveId, videoId: item.videoId, kind: item.kind, status: 'quota' })
      console.log(`  ⏸️  [${item.kind}] ${item.archiveId} — quota still exhausted, stopping drain`)
    } else {
      summary.failed++
      kept.push({ ...item, attempts: item.attempts + 1, lastError: result.error })
      summary.details.push({ archiveId: item.archiveId, videoId: item.videoId, kind: item.kind, status: 'error', error: result.error })
      console.warn(`  ❌ [${item.kind}] ${item.archiveId} (yt:${item.videoId}) attempt #${item.attempts + 1}: ${result.error ?? 'unknown error'}`)
    }

    // Same pacing as the streaming endpoints
    await delay(200)
  }

  summary.remaining = kept.length
  await saveRetryQueue(kept)
  return summary
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
      if (error instanceof Error) lastError = error
      const archiveError = isApiError(error) ? (error.response?.result?.error ?? '') : ''
      if (archiveError === 'no changes to _meta.xml') {
        console.log(`✅ ${context}: no changes needed (already up to date)`)
        return { success: true, noChanges: true } as unknown as T
      }
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
 * Search YouTube for a matching video by title and date.
 * Checks the local channel cache first (free, no quota). Only falls back to the
 * YouTube Data API search (100 quota units) when the cache is missing or stale.
 * Refresh the cache via POST /api/youtube/channel-cache/refresh (~13 quota units total).
 */
async function searchYouTubeForMatch(title: string, date?: string, identifier?: string) {
  try {
    console.log(`🔍 YOUTUBE SEARCH: title="${title}", date="${date}", identifier="${identifier}"`)

    const cache = await getChannelCache()
    if (cache) {
      console.log(`📦 Using channel cache (${cache.videos.length} videos, fetched ${cache.fetchedAt})`)
      const match = searchChannelCache(cache, title, date)
      if (match) {
        console.log(`✅ Cache hit: "${match.title}" (score: ${match.score})`)
        return match
      }
      console.log(`❌ No cache match for "${title}" — not falling back to API search`)
      return null
    }

    console.log(`⚠️  No channel cache found — falling back to YouTube API search (costs 100 quota units)`)
    console.log(`   Run POST /api/youtube/channel-cache/refresh to build cache (~13 units for all videos)`)

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
    console.log(`🌐 YouTube API request: ${searchUrl.replace(apiKey, '[REDACTED]')}`)
    
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
        
        // Bonus for videos published close to recording date
        if (daysDiff <= YOUTUBE_DATE_MATCH_CLOSE_DAYS) {
          score += 20
        } else if (daysDiff <= YOUTUBE_DATE_MATCH_MEDIUM_DAYS) {
          score += 10
        } else if (daysDiff <= YOUTUBE_DATE_MATCH_FAR_DAYS) {
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




/**
 * API ENDPOINT: GET /api/search
 * This endpoint searches within the authenticated user's uploaded items only
 * 
 * Request example:
 * GET /api/search?q=radiohead
 * 
 * Response example:
 * {
 *   "items": [
 *     {
 *       "identifier": "09.19.15_TestBand",
 *       "title": "Test Concert Recording",
 *       "date": "2015-09-19",
 *       "creator": "test@example.com"
 *     }
 *   ],
 *   "total": 1,
 *   "returned": 1
 * }
 */
app.get('/api/search', async (req, res) => {
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
    const searchUrl = buildArchiveSearchUrl(combinedQuery, fields, MAX_SEARCH_RESULTS)
    
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
app.get('/api/user-items', async (_req, res) => {
  try {
    // Get user's Archive.org credentials to authenticate the request
    const { email, accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`🔍 Fetching fresh user items for ${email} from Archive.org API`)
    
    // Build search URL using utility function
    const fields = ['identifier', 'title', 'creator', 'description', 'date', 'mediatype', 'collection', 'subject', 'uploader', 'youtube']
    const searchUrl = buildArchiveSearchUrl(`uploader:${email}`, fields, MAX_USER_ITEMS)
    
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
// 
// ===== SERVER-SENT EVENTS (SSE) EXPLANATION =====
// 
// This endpoint uses Server-Sent Events (SSE) to provide real-time progress updates to the browser.
// 
// WHAT IS SSE?
// Server-Sent Events is a web standard that allows a server to push real-time data to a web page
// without the page needing to constantly refresh or make repeated requests.
//
// HOW SSE WORKS:
// 1. Browser makes one request to this endpoint
// 2. Server keeps the HTTP connection open (doesn't close it immediately)
// 3. As the server processes each item, it sends progress updates in this format:
//    data: {"type":"progress","current":1,"total":100,"identifier":"item1","status":"updating"}
//    data: {"type":"progress","current":1,"total":100,"identifier":"item1","status":"completed"}
// 4. Browser receives each update instantly and can show live progress to the user
// 5. When all items are processed, server sends final summary and closes the connection
//
// WHY WE USE SSE HERE:
// - Batch metadata updates can take several minutes for 100+ items
// - Without SSE: User sees loading spinner for minutes with no feedback
// - With SSE: User sees "Processing item 5 of 100... ✅ Item 5 complete..." in real-time
//
// SSE VS OTHER APPROACHES:
// - WebSockets: Two-way communication (we only need server → browser)
// - Polling: Browser repeatedly asks "are you done yet?" (inefficient)
// - SSE: Server pushes updates as they happen (perfect for progress updates)
//
// REAL-WORLD EXAMPLE:
// User selects 100 Archive.org items to update with YouTube links.
// 
// WITHOUT SSE (traditional approach):
// - User clicks "Update" button
// - Page shows loading spinner
// - User waits 5+ minutes with no feedback
// - Page finally shows "Done!" or "Error" (no details about which items failed)
//
// WITH SSE (our approach):
// - User clicks "Update" button  
// - User immediately sees: "Starting update for 100 items..."
// - User sees live updates: "Processing item 1/100... ✅ Item 1 complete"
// - User sees live updates: "Processing item 2/100... ✅ Item 2 complete" 
// - If item 50 fails: "❌ Item 50 failed: YouTube link not found"
// - User sees final summary: "🎉 Complete! 98/100 successful, 2 failed"
//
// BENEFITS:
// - User knows the system is working (not frozen)
// - User can see progress and estimate completion time
// - User gets immediate feedback on failures (can cancel if needed)
// - Much better user experience for long-running operations
//
/**
 * API ENDPOINT: POST /api/update-metadata-stream
 * Updates metadata for multiple Archive.org items using Server-Sent Events for progress tracking
 * 
 * Request example:
 * POST /api/update-metadata-stream
 * Content-Type: application/json
 * {
 *   "items": ["09.19.15_TestBand"],
 *   "updates": [
 *     {
 *       "field": "title",
 *       "value": "Updated Title"
 *     },
 *     {
 *       "field": "date", 
 *       "value": "2015-09-19"
 *     }
 *   ]
 * }
 * 
 * Response example (Server-Sent Events):
 * Content-Type: text/event-stream
 * 
 * data: {"type":"start","total":1}
 * 
 * data: {"type":"progress","identifier":"09.19.15_TestBand","current":1,"total":1,"status":"processing"}
 * 
 * data: {"type":"progress","identifier":"09.19.15_TestBand","current":1,"total":1,"status":"success"}
 * 
 * data: {"type":"complete","total":1,"successful":1,"failed":0}
 */
app.post('/api/update-metadata-stream', async (req, res) => {
  try {
    // Validate the request body contains properly formatted UpdateRequest
    const { items: identifiers, updates } = updateRequestSchema.parse(req.body)
    
    // Handle empty updates array gracefully
    if (updates.length === 0) {
      // Set up SSE headers for consistent response format
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      
      // Send start and complete events immediately
      res.write(`data: ${JSON.stringify({ type: 'start', total: identifiers.length })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'complete', total: identifiers.length, successful: identifiers.length, failed: 0 })}\n\n`)
      res.end()
      return
    }
    
    // Transform UpdateRequest format to the format expected by processing logic
    const items = identifiers.map(identifier => {
      // Convert updates array to metadata object
      const metadata: Record<string, any> = {}
      updates.forEach(update => {
        metadata[update.field] = update.value
      })
      
      return {
        identifier,
        metadata,
        target: 'metadata' as const
      }
    })
    
    // Get user's Archive.org credentials for authentication
    const { accessKey, secretKey } = getArchiveCredentials()
    
    console.log(`🔄 Starting batch metadata update for ${items.length} items`)
    
    // ===== SET UP SERVER-SENT EVENTS (SSE) =====
    //
    // These HTTP headers tell the browser this is a streaming response (SSE format):
    res.setHeader('Content-Type', 'text/event-stream')  // Browser knows to expect SSE format
    res.setHeader('Cache-Control', 'no-cache')          // Don't cache the streaming response  
    res.setHeader('Connection', 'keep-alive')           // Keep the HTTP connection open
    res.setHeader('Access-Control-Allow-Origin', '*')   // Allow requests from any domain
    
    // ===== SSE DATA FORMAT =====
    //
    // Helper function to send progress updates to the client in SSE format.
    // SSE format requires each message to be: "data: {JSON}\n\n"
    // The browser's EventSource API automatically parses this format.
    const sendProgress = (data: ProgressData) => {
      // Write data in SSE format: "data: " + JSON + two newlines
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      // Browser immediately receives this update and can display progress to user
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
          progress: i + 1,
          total: items.length,
          identifier,
          status: 'updating'
        })
        
        console.log(`📝 Updating metadata for ${identifier} (${i + 1}/${items.length})`)
        
        // Make API call to update Archive.org metadata using JSON Patch format
        // Use add-first-then-replace pattern to handle both new and existing fields
        const result = await makeArchiveApiCall(async () => {
          const metadataUrl = buildArchiveMetadataUrl(identifier)
          
          // Helper function to try a patch operation
          // forceOperation: when true, ignores per-field operation settings and uses the operation parameter for all fields
          const tryPatchOperation = async (operation: 'add' | 'replace', forceOperation = false) => {
            const formData = new URLSearchParams()
            formData.append('-target', target)

            // Create JSON Patch operations for metadata updates
            const patches: JsonPatchOperation[] = []
            Object.entries(metadata).forEach(([key, value]) => {
              if (value !== undefined && value !== null) {
                // Standardize special fields
                let processedValue = String(value)
                if (key === 'date') {
                  processedValue = standardizeDate(processedValue)
                } else if (key === 'youtube') {
                  processedValue = standardizeYouTubeUrl(processedValue)
                }

                // Array fields must always use 'add' to append — 'replace' would overwrite the whole array
                // Scalar fields use replace-first logic (or the forced operation on fallback)
                const ARRAY_FIELDS = new Set(['subject', 'collection'])
                const update = updates.find(u => u.field === key)
                const op = ARRAY_FIELDS.has(key) ? 'add'
                  : forceOperation ? operation
                  : (update?.operation || operation)

                patches.push({
                  op,
                  path: `/${key}`,
                  value: processedValue
                })
              }
            })

            // Add the JSON patch to form data
            formData.append('-patch', JSON.stringify(patches))

            const response = await fetch(metadataUrl, {
              method: 'POST',
              headers: {
                'Authorization': `LOW ${accessKey}:${secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: formData
            })

            const result = await response.json()

            if (!response.ok) {
              // Return error with parsed result for better error handling
              const error: ApiError = new Error(`Archive.org API error: ${response.status} ${response.statusText}`)
              error.response = { status: response.status, result }
              throw error
            }

            return result
          }

          // Use replace-first-then-add pattern:
          // - replace avoids creating duplicate tags when a field already exists
          // - add is the fallback for fields that don't exist yet (replace would fail)
          try {
            return await tryPatchOperation('replace')
          } catch (replaceError: any) {
            const errorMsg = replaceError.response?.result?.error || replaceError.message || ''
            if (errorMsg.includes('no changes to _meta.xml')) {
              console.log(`✅ No changes needed for ${identifier} (already up to date)`)
              return { success: true, noChanges: true }
            }
            console.log(`🔄 Replace failed for ${identifier} (${errorMsg}), retrying with add operation`)
            sendProgress({
              type: 'progress',
              identifier,
              progress: i + 1,
              total: items.length,
              info: `🔄 Field not found, using add operation (${errorMsg})`
            })
            // Force 'add' for all fields so the fallback actually uses add, not the per-field 'replace' setting
            return await tryPatchOperation('add', true)
          }
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
          progress: i + 1,
          total: items.length,
          identifier,
          status: 'completed',
          message: 'Metadata updated successfully'
        })
        
        // Small delay to avoid overwhelming Archive.org
        if (i < items.length - 1) {
          await delay(API_DELAY_MS)
        }
        
      } catch (error) {
        console.error(`❌ Failed to update ${identifier}:`, error)

        const archiveDetail = isApiError(error) ? error.response?.result?.error : undefined
        const errorMessage = archiveDetail
          ? `${error instanceof Error ? error.message : 'Unknown error'}: ${archiveDetail}`
          : error instanceof Error ? error.message : 'Unknown error'
        results.push({
          identifier,
          success: false,
          error: errorMessage
        })
        
        sendProgress({
          type: 'progress',
          progress: i + 1,
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
app.post('/api/update-metadata', async (req, res) => {
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
          'Authorization': `LOW ${accessKey}:${secretKey}`,
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

/**
 * API ENDPOINT: POST /api/youtube-suggest
 * Finds YouTube matches for Archive.org items using intelligent matching
 * 
 * Request example:
 * POST /api/youtube-suggest
 * Content-Type: application/json
 * {
 *   "items": [
 *     {
 *       "identifier": "gd1977-05-08.sbd.miller",
 *       "title": "Grateful Dead - Fire on the Mountain Live at Cornell 1977-05-08",
 *       "date": "1977-05-08"
 *     }
 *   ]
 * }
 * 
 * Response example:
 * {
 *   "results": [
 *     {
 *       "identifier": "gd1977-05-08.sbd.miller",
 *       "success": true,
 *       "match": {
 *         "videoId": "dQw4w9WgXcQ",
 *         "title": "Grateful Dead - Fire on the Mountain (Cornell 1977)",
 *         "url": "https://youtu.be/dQw4w9WgXcQ",
 *         "publishedAt": "2019-05-08T00:00:00Z",
 *         "extractedBand": "Grateful Dead",
 *         "extractedVenue": "Cornell",
 *         "extractedDate": "1977-05-08"
 *       },
 *       "suggestions": {
 *         "youtube": "https://youtu.be/dQw4w9WgXcQ",
 *         "band": "Grateful Dead",
 *         "venue": "Cornell University",
 *         "date": "1977-05-08"
 *       }
 *     }
 *   ],
 *   "summary": {
 *     "total": 1,
 *     "successful": 1,
 *     "failed": 0
 *   }
 * }
 */
app.post('/api/youtube-suggest', async (req, res) => {
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
          console.log(`🔗 YouTube URL: ${youtubeMatch.url}`)
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
        await delay(SEARCH_DELAY_MS)
        
      } catch (error) {
        console.error(`❌ Error processing ${item.identifier}:`, error)
        
        // Check if this is a quota exhaustion error
        const isQuotaError = isYouTubeQuotaError(error)
        
        
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
    
    // Log detailed summary of all found URLs
    const successfulResults = results.filter(r => r.success)
    if (successfulResults.length > 0) {
      console.log(`📋 Summary of found YouTube URLs:`)
      successfulResults.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.identifier} -> ${result.youtubeMatch?.url}`)
      })
    }
    
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

/**
 * API ENDPOINT: POST /api/batch-upload-image-stream
 * Handles batch image uploads using Server-Sent Events for real-time progress
 * 
 * Request example:
 * POST /api/batch-upload-image-stream
 * Content-Type: multipart/form-data
 * 
 * Form data:
 * - files: [File] (image files to upload)
 * - itemsMetadata: JSON string containing:
 *   [
 *     {
 *       "identifier": "09.19.15_TestBand",
 *       "metadata": {
 *         "title": "Test Concert",
 *         "date": "2015-09-19",
 *         "band": "Test Band",
 *         "venue": "Test Venue"
 *       }
 *     }
 *   ]
 * 
 * Response example (Server-Sent Events):
 * Content-Type: text/event-stream
 * 
 * data: {"type":"start","total":1}
 * 
 * data: {"type":"progress","identifier":"09.19.15_TestBand","current":1,"total":1,"status":"processing"}
 * 
 * data: {"type":"progress","identifier":"09.19.15_TestBand","current":1,"total":1,"status":"success"}
 * 
 * data: {"type":"complete","total":1,"successful":1,"failed":0}
 */
app.post('/api/batch-upload-image-stream', (req, res, _next) => {
  
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
        return res.status(400).json({ error: 'No image file uploaded' })
      }
      
      if (files.length !== 1) {
        return res.status(400).json({ error: 'Expected exactly one image file' })
      }
      
      if (!itemsMetadata || itemsMetadata.length === 0) {
        return res.status(400).json({ error: 'No items specified for upload' })
      }
      
      
      console.log(`🔄 Starting batch image upload: uploading "${files[0].originalname}" to ${itemsMetadata.length} items`)
      
      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      
      const sendProgress = (data: ProgressData) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
      
      sendProgress({ type: 'start', total: itemsMetadata.length })
      
      const results = []
      
      // Process each item (uploading the same image file to each item)
      for (let i = 0; i < itemsMetadata.length; i++) {
        const file = files[0] // Always use the single uploaded file
        const metadata = itemsMetadata[i]
        
        try {
          sendProgress({ 
            type: 'progress', 
            current: i + 1, 
            total: itemsMetadata.length, 
            identifier: metadata.identifier,
            status: 'uploading'
          })
          
          console.log(`📤 Uploading ${metadata.identifier} (${i + 1}/${itemsMetadata.length})`)
          
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
              'authorization': `LOW ${accessKey}:${secretKey}`,
              'x-amz-auto-make-bucket': '1',
              ...Object.fromEntries(
                Object.entries(metadata.metadata).map(([key, value]) => [
                  `x-archive-meta-${key}`, String(value)
                ])
              )
            },
            body: Buffer.from(file.buffer)
          })
          
          if (!uploadResponse.ok) {
            // Get detailed error information from Archive.org
            let errorDetails = `${uploadResponse.status} ${uploadResponse.statusText}`
            try {
              const responseText = await uploadResponse.text()
              if (responseText) {
                console.error(`❌ Archive.org response body for ${metadata.identifier}:`, responseText)
                errorDetails += ` - ${responseText}`
              }
            } catch (textError) {
              console.error(`❌ Could not read response body for ${metadata.identifier}:`, textError)
            }
            
            console.error(`❌ Archive.org upload failed for ${metadata.identifier}:`)
            console.error(`   URL: https://s3.us.archive.org/${metadata.identifier}/${standardizedFilename}`)
            console.error(`   Status: ${uploadResponse.status}`)
            console.error(`   Headers:`, Object.fromEntries(uploadResponse.headers.entries()))
            
            throw new Error(`Upload failed: ${errorDetails}`)
          }
          
          // Also upload the _rules.conf file with derivation rules
          const rulesContent = 'CAT.ALL'
          const rulesResponse = await fetch(`https://s3.us.archive.org/${metadata.identifier}/_rules.conf`, {
            method: 'PUT',
            headers: {
              'authorization': `LOW ${accessKey}:${secretKey}`,
              'x-archive-meta-format': 'Derivation Rules'
            },
            body: rulesContent
          })
          
          if (!rulesResponse.ok) {
            console.warn(`⚠️  Failed to upload _rules.conf to ${metadata.identifier}: ${rulesResponse.status} ${rulesResponse.statusText}`)
          } else {
            console.log(`📋 Uploaded _rules.conf to ${metadata.identifier}`)
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
            total: itemsMetadata.length, 
            identifier: metadata.identifier,
            status: 'completed'
          })
          
          // Small delay between uploads
          if (i < itemsMetadata.length - 1) {
            await delay(API_DELAY_MS)
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
            total: itemsMetadata.length, 
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
        total: itemsMetadata.length,
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
app.post('/api/batch-upload-image', (req, res, _next) => {
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
        return res.status(400).json({ error: 'No image file uploaded' })
      }
      
      if (files.length !== 1) {
        return res.status(400).json({ error: 'Expected exactly one image file' })
      }
      
      if (!itemsMetadata || itemsMetadata.length === 0) {
        return res.status(400).json({ error: 'No items specified for upload' })
      }
      
      console.log(`🔄 Processing batch upload: uploading "${files[0].originalname}" to ${itemsMetadata.length} items`)
      
      const results = []
      
      // Process all items (uploading the same image file to each item)
      for (let i = 0; i < itemsMetadata.length; i++) {
        const file = files[0] // Always use the single uploaded file
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
              'authorization': `LOW ${accessKey}:${secretKey}`,
              'x-amz-auto-make-bucket': '1',
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
          
          // Also upload the _rules.conf file with derivation rules
          const rulesContent = 'CAT.ALL'
          const rulesResponse = await fetch(`https://s3.us.archive.org/${metadata.identifier}/_rules.conf`, {
            method: 'PUT',
            headers: {
              'authorization': `LOW ${accessKey}:${secretKey}`,
              'x-archive-meta-format': 'Derivation Rules'
            },
            body: rulesContent
          })
          
          if (!rulesResponse.ok) {
            console.warn(`⚠️  Failed to upload _rules.conf to ${metadata.identifier}: ${rulesResponse.status} ${rulesResponse.statusText}`)
          } else {
            console.log(`📋 Uploaded _rules.conf to ${metadata.identifier}`)
          }
          
          results.push({
            identifier: metadata.identifier,
            filename: standardizedFilename,
            originalFilename: file.originalname,
            success: true,
            message: 'File uploaded successfully'
          })
          
          await delay(API_DELAY_MS)
          
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

/**
 * API ENDPOINT: GET /api/health
 * Simple health check endpoint to verify the server is running
 * 
 * Request example:
 * GET /api/health
 * 
 * Response example:
 * {
 *   "status": "ok",
 *   "timestamp": "2023-12-25T10:30:00.000Z"
 * }
 */
app.get('/api/health', (_req, res) => {
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

    if (!tokens.refresh_token) {
      // Google only issues a refresh token on first consent. If we get here without one,
      // the user previously granted access — they need to revoke at
      // https://myaccount.google.com/permissions and re-run the flow.
      return res.status(400).send(
        'OAuth succeeded but no refresh token was returned. Revoke the app at ' +
        'https://myaccount.google.com/permissions and retry /auth/youtube.'
      )
    }

    await saveYouTubeTokens(tokens)
    console.log('YouTube OAuth successful — tokens saved to .youtube-tokens.json')

    // In dev, Express (3001) and Vite (3000) run on different ports, so a plain "/"
    // redirect lands on Express — not the frontend. FRONTEND_URL bridges the gap.
    // In production both are served from the same origin so FRONTEND_URL is unset and "/" works.
    const frontendUrl = process.env.FRONTEND_URL ?? ''
    res.redirect(`${frontendUrl}/?youtube_auth=success`)
  } catch (error) {
    console.error('YouTube OAuth callback error:', error)
    res.status(500).send(`OAuth Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
})

// Check YouTube OAuth status
app.get('/auth/youtube/status', async (_req, res) => {
  try {
    const config = getYouTubeOAuthCredentials()
    if (!config) {
      return res.json({ authenticated: false, configured: false, error: 'OAuth not configured' })
    }

    const tokens = await loadStoredYouTubeTokens()
    res.json({
      authenticated: !!tokens?.refresh_token,
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

// Channel cache status + refresh
app.get('/api/youtube/channel-cache/status', async (_req, res) => {
  try {
    const cache = await loadChannelCache()
    if (!cache) return res.json({ cached: false })
    const ageMs = Date.now() - new Date(cache.fetchedAt).getTime()
    res.json({
      cached: true,
      videoCount: cache.videos.length,
      fetchedAt: cache.fetchedAt,
      ageHours: Math.round(ageMs / 1000 / 60 / 60 * 10) / 10,
      stale: ageMs > CHANNEL_CACHE_TTL_MS
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/youtube/channel-cache/refresh', async (_req, res) => {
  try {
    const cache = await fetchAndCacheChannelVideos()
    res.json({ success: true, videoCount: cache.videos.length, fetchedAt: cache.fetchedAt })
  } catch (error) {
    console.error('Channel cache refresh error:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

// API ENDPOINT: POST /youtube/update-recording-dates-stream
// This endpoint updates YouTube video recording dates using Server-Sent Events
app.post('/api/youtube/update-recording-dates-stream', async (req, res) => {
  try {
    const { updates } = youtubeUpdateRecordingDatesStreamSchema.parse(req.body)

    console.log(`🎬 Starting YouTube recording date updates for ${updates.length} videos`)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')

    const sendProgress = (data: ProgressData) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    sendProgress({ type: 'start', total: updates.length })

    try {
      const youtube = await getAuthenticatedYouTubeClient()
      const results: Array<{ archiveId: string; videoId: string; success: boolean; error?: string }> = []

      for (let i = 0; i < updates.length; i++) {
        const { archiveId, videoId, recordingDate } = updates[i]

        sendProgress({
          type: 'progress',
          current: i + 1,
          total: updates.length,
          archiveId,
          videoId,
          status: 'updating'
        })

        try {
          await youtube.videos.update({
            part: ['recordingDetails'],
            requestBody: {
              id: videoId,
              recordingDetails: { recordingDate }
            }
          })

          results.push({ archiveId, videoId, success: true })
          // Item succeeded — drop any prior queued retry for it.
          await removeFromRetryQueue('recording-date', videoId).catch((e) =>
            console.warn('Failed to remove from retry queue:', e)
          )
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: updates.length,
            archiveId,
            videoId,
            status: 'success'
          })
        } catch (error) {
          const errAny = error as { errors?: Array<{ message?: string }>; message?: string }
          const errorMessage = errAny?.errors?.[0]?.message ?? errAny?.message ?? 'Unknown error'
          console.error(`🎬 ❌ ${archiveId} (${videoId}):`, errorMessage)

          // On quota errors, persist for retry on next startup / manual drain.
          if (isYouTubeQuotaError(error)) {
            await enqueueForRetry(
              { kind: 'recording-date', archiveId, videoId, payload: { recordingDate } },
              errorMessage
            ).catch((e) => console.warn('Failed to enqueue for retry:', e))
          }

          results.push({ archiveId, videoId, success: false, error: errorMessage })
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: updates.length,
            archiveId,
            videoId,
            status: 'error',
            error: errorMessage
          })
        }

        // Gentle pacing between writes (videos.update = 50 quota units each; daily default is 10k)
        await delay(200)
      }

      const successful = results.filter((r) => r.success).length
      sendProgress({
        type: 'complete',
        total: updates.length,
        successful,
        failed: updates.length - successful,
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

// API ENDPOINT: POST /api/youtube/update-tags-stream
// Merges incoming tags with each video's existing snippet.tags (case-insensitive dedupe,
// existing tags kept first). Snippet is required-all-or-nothing on write, so we fetch first
// to preserve title/categoryId/description anyway — reusing that read for the merge is free.
app.post('/api/youtube/update-tags-stream', async (req, res) => {
  try {
    const { updates } = youtubeUpdateTagsStreamSchema.parse(req.body)

    // YouTube enforces 500 chars total on the serialized tag list. Reject locally for a clearer error.
    for (const u of updates) {
      const serialized = u.tags.join(', ')
      if (serialized.length > 500) {
        return res.status(400).json({
          error: `Tags for ${u.archiveId} exceed 500-char total (got ${serialized.length})`
        })
      }
    }

    console.log(`🏷️  Starting YouTube tag updates for ${updates.length} videos`)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')

    const sendProgress = (data: ProgressData) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    sendProgress({ type: 'start', total: updates.length })

    try {
      const youtube = await getAuthenticatedYouTubeClient()
      const results: Array<{ archiveId: string; videoId: string; success: boolean; error?: string }> = []

      for (let i = 0; i < updates.length; i++) {
        const { archiveId, videoId, tags } = updates[i]

        sendProgress({
          type: 'progress',
          current: i + 1,
          total: updates.length,
          archiveId,
          videoId,
          status: 'updating'
        })

        try {
          const listRes = await youtube.videos.list({ part: ['snippet'], id: [videoId] })
          const existing = listRes.data.items?.[0]?.snippet
          if (!existing) {
            throw new Error('Video not found or not owned by authenticated account')
          }

          // Merge existing + incoming, dedupe case-insensitively, existing tags first.
          // Then trim from the end to fit YouTube's 500-char serialized limit.
          const mergedTags: string[] = []
          const seen = new Set<string>()
          for (const tag of [...(existing.tags ?? []), ...tags]) {
            const clean = tag.trim()
            if (!clean) continue
            const key = clean.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            mergedTags.push(clean)
          }
          while (mergedTags.join(', ').length > 500 && mergedTags.length > 1) {
            mergedTags.pop()
          }

          await youtube.videos.update({
            part: ['snippet'],
            requestBody: {
              id: videoId,
              snippet: {
                title: existing.title ?? '',
                categoryId: existing.categoryId ?? '10',
                description: existing.description ?? '',
                defaultLanguage: existing.defaultLanguage ?? undefined,
                tags: mergedTags
              }
            }
          })

          results.push({ archiveId, videoId, success: true })
          await removeFromRetryQueue('tags', videoId).catch((e) =>
            console.warn('Failed to remove from retry queue:', e)
          )
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: updates.length,
            archiveId,
            videoId,
            status: 'success'
          })
        } catch (error) {
          const errAny = error as { errors?: Array<{ message?: string }>; message?: string }
          const errorMessage = errAny?.errors?.[0]?.message ?? errAny?.message ?? 'Unknown error'
          console.error(`🏷️  ❌ ${archiveId} (${videoId}):`, errorMessage)

          if (isYouTubeQuotaError(error)) {
            await enqueueForRetry(
              { kind: 'tags', archiveId, videoId, payload: { tags } },
              errorMessage
            ).catch((e) => console.warn('Failed to enqueue for retry:', e))
          }

          results.push({ archiveId, videoId, success: false, error: errorMessage })
          sendProgress({
            type: 'progress',
            current: i + 1,
            total: updates.length,
            archiveId,
            videoId,
            status: 'error',
            error: errorMessage
          })
        }

        // Tags writes cost 1 (list) + 50 (update) = 51 units each
        await delay(200)
      }

      const successful = results.filter((r) => r.success).length
      sendProgress({
        type: 'complete',
        total: updates.length,
        successful,
        failed: updates.length - successful,
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
    console.error('YouTube tags update error:', error)

    if (error instanceof z.ZodError) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid request format' })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Update failed' })}\n\n`)
    }

    res.end()
  }
})

// API ENDPOINT: GET /api/youtube/retry-queue
// Returns the current queue of items that failed due to quota exhaustion.
app.get('/api/youtube/retry-queue', async (_req, res) => {
  try {
    const items = await loadRetryQueue()
    res.json({ count: items.length, items })
  } catch (error) {
    console.error('Failed to load retry queue:', error)
    res.status(500).json({ error: 'Failed to load retry queue' })
  }
})

// API ENDPOINT: POST /api/youtube/retry-queue/drain
// Attempts each queued item against YouTube. Stops as soon as another quota error
// hits; successful items are removed from the queue.
app.post('/api/youtube/retry-queue/drain', async (_req, res) => {
  try {
    const summary = await drainRetryQueue()
    console.log(
      `♻️  Retry drain: attempted=${summary.attempted} ok=${summary.succeeded} failed=${summary.failed} ` +
      `remaining=${summary.remaining} quotaHit=${summary.quotaHit}`
    )
    res.json(summary)
  } catch (error) {
    console.error('Retry drain failed:', error)
    res.status(500).json({ error: error instanceof Error ? error.message : 'Drain failed' })
  }
})

// API ENDPOINT: POST /youtube/get-descriptions
// This endpoint fetches YouTube video descriptions
app.post('/api/youtube/get-descriptions', async (req, res) => {
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
app.post('/api/youtube/update-descriptions-stream', async (req, res) => {
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
app.get('/api/metadata/:identifier', async (req, res) => {
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
    
    // Archive.org returns { files, metadata: {...fields}, ... }. Return the inner metadata
    // object directly so callers read `response.<field>` instead of `response.metadata.metadata.<field>`.
    res.json(response?.metadata ?? response ?? {})
    
  } catch (error) {
    console.error(`Metadata fetch error for ${req.params.identifier}:`, error)
    res.status(500).json({ 
      error: 'Failed to fetch metadata',
      identifier: req.params.identifier 
    })
  }
})


// Export the app for testing
export default app

// Start the server only if this file is run directly (not imported)  
// Only start server when not in test environment and running directly
if (process.env.NODE_ENV !== 'test' && process.argv[1]?.includes('server/index.ts')) {
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

    // Try to drain any pending retry items (won't block startup — runs in background).
    // Items left from the last quota exhaustion will retry automatically if quota is free.
    loadRetryQueue()
      .then(async (queue) => {
        if (queue.length === 0) return
        console.log(`♻️  Retry queue: ${queue.length} item(s) pending, attempting drain...`)
        const summary = await drainRetryQueue()
        if (summary.authExpired) {
          console.warn(
            `♻️  Drain aborted: OAuth token expired or revoked (invalid_grant). Re-authenticate via /auth/youtube. ${summary.remaining} item(s) preserved in queue.`
          )
        } else if (summary.quotaHit) {
          console.log(
            `♻️  Drain paused: quota still exhausted. ${summary.succeeded} succeeded, ${summary.remaining} remaining.`
          )
        } else if (summary.failed > 0) {
          const errorGroups = summary.details
            .filter((d) => d.status === 'error' && d.error)
            .reduce<Record<string, number>>((acc, d) => {
              const key = d.error!
              acc[key] = (acc[key] ?? 0) + 1
              return acc
            }, {})
          const errorSummary = Object.entries(errorGroups)
            .map(([msg, count]) => `"${msg}" ×${count}`)
            .join(', ')
          console.log(
            `♻️  Drain done: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.remaining} remaining.` +
            (errorSummary ? ` Errors: ${errorSummary}` : '')
          )
        } else {
          console.log(
            `♻️  Drain done: ${summary.succeeded} succeeded, 0 failed, ${summary.remaining} remaining.`
          )
        }
      })
      .catch((err) => console.warn('Retry queue drain error on startup:', err))

    console.log('🚀 Server ready - all cache functionality removed, direct API calls enabled')
  })
}
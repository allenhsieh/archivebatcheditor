import React, { useState, useEffect } from 'react'
import { MetadataUpdate, UpdateRequest, ArchiveItem, YouTubeSuggestionResponse } from '../types'

interface MetadataEditorProps {
  selectedItems: string[]
  items: ArchiveItem[]
  onUpdate: (updateData: UpdateRequest) => Promise<void>
  loading: boolean
  addLog: (entry: { type: 'success' | 'error' | 'info' | 'skipped', message: string, identifier?: string }) => void
  onLoadUserItems: () => Promise<void>
  onSelectAllItems: () => void
}

const commonFields = [
  'title',
  'creator', 
  'description',
  'subject',
  'date',
  'venue',
  'city',
  'state',
  'country',
  'band',
  'contact',
  'youtube',
  'bandcamp',
  'event',
  'language',
  'price',
  'time'
]

export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  selectedItems,
  items,
  onUpdate,
  loading,
  addLog,
  onSelectAllItems
}) => {
  const [updates, setUpdates] = useState<MetadataUpdate[]>([
    { field: 'city', value: '', operation: 'replace' }
  ])
  const [youtubeSuggestions, setYoutubeSuggestions] = useState<Record<string, YouTubeSuggestionResponse>>({})
  const [loadingYoutube, setLoadingYoutube] = useState<Record<string, boolean>>({})
  const [selectedFields, setSelectedFields] = useState<Record<string, Record<string, boolean>>>({})
  const [editableFields, setEditableFields] = useState<Record<string, {
    youtube?: string,
    band?: string,
    venue?: string,
    date?: string
  }>>({})
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [recordingDate, setRecordingDate] = useState('')
  const [videoDateMappings, setVideoDateMappings] = useState<Array<{
    archiveId: string,
    videoId: string,
    title: string,
    detectedDate: string,
    finalDate: string
  }>>([])
  const [showVideoDateEditor, setShowVideoDateEditor] = useState(false)
  const [youtubeDateLoading, setYoutubeDateLoading] = useState(false)
  const [youtubeAuthStatus, setYoutubeAuthStatus] = useState<{authenticated: boolean, loading: boolean}>({
    authenticated: false,
    loading: true
  })
  const [bandcampUrl, setBandcampUrl] = useState('')
  const [descriptionPreviews, setDescriptionPreviews] = useState<Array<{
    archiveId: string,
    videoId: string,
    currentDescription: string,
    newDescription: string,
    needsUpdate: boolean
  }>>([])
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false)

  // Check YouTube authentication status on component load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/auth/youtube/status')
        const status = await response.json()
        setYoutubeAuthStatus({
          authenticated: status.authenticated || false,
          loading: false
        })
      } catch (error) {
        console.error('Failed to check YouTube auth status:', error)
        setYoutubeAuthStatus({
          authenticated: false,
          loading: false
        })
      }
    }

    checkAuthStatus()
  }, [])

  // Handle OAuth callback success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const authResult = urlParams.get('youtube_auth')
    
    if (authResult === 'success') {
      // Refresh auth status after successful OAuth
      setYoutubeAuthStatus({ loading: true, authenticated: false })
      
      const refreshAuthStatus = async () => {
        try {
          const response = await fetch('/auth/youtube/status')
          const status = await response.json()
          setYoutubeAuthStatus({
            authenticated: status.authenticated || false,
            loading: false
          })
          
          if (status.authenticated) {
            addLog({ type: 'success', message: '✅ Successfully connected to YouTube!' })
          }
        } catch (error) {
          console.error('Failed to refresh YouTube auth status:', error)
          setYoutubeAuthStatus({
            authenticated: false,
            loading: false
          })
        }
      }
      
      refreshAuthStatus()
      
      // Clean up URL parameter
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    } else if (authResult === 'error') {
      addLog({ type: 'error', message: '❌ YouTube authentication failed. Please try again.' })
      // Clean up URL parameter
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const handleUpdateChange = (index: number, key: keyof MetadataUpdate, value: string) => {
    const newUpdates = [...updates]
    newUpdates[index] = { ...newUpdates[index], [key]: value }
    setUpdates(newUpdates)
  }

  const addUpdate = () => {
    setUpdates([...updates, { field: '', value: '', operation: 'replace' }])
  }

  const removeUpdate = (index: number) => {
    setUpdates(updates.filter((_, i) => i !== index))
  }

  const getYoutubeSuggestion = async (identifier: string) => {
    const item = items.find(i => i.identifier === identifier)
    if (!item || !item.title) return

    setLoadingYoutube(prev => ({ ...prev, [identifier]: true }))
    
    try {
      const response = await fetch('/api/youtube-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            identifier,
            title: item.title,
            ...(item.date ? { date: item.date } : {})
          }]
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const responseData = await response.json()
      // Extract the first result since we sent one item
      const data: YouTubeSuggestionResponse = responseData.results?.[0] || responseData
      setYoutubeSuggestions(prev => ({ ...prev, [identifier]: data }))
      
      // Initialize selected fields - all checked by default
      if (data.success && data.suggestions) {
        setSelectedFields(prev => ({
          ...prev,
          [identifier]: {
            youtube: !!data.suggestions?.youtube,
            band: !!data.suggestions?.band,
            venue: !!data.suggestions?.venue,
            date: !!data.suggestions?.date,
          }
        }))
        
        // Initialize editable fields with the suggestion values
        setEditableFields(prev => ({
          ...prev,
          [identifier]: {
            youtube: data.suggestions?.youtube || '',
            band: data.suggestions?.band || '',
            venue: data.suggestions?.venue || '',
            date: data.suggestions?.date || '',
          }
        }))
      }
      
      console.log('YouTube suggestion response:', data)
    } catch (error) {
      console.error('Failed to get YouTube suggestion:', error)
      setYoutubeSuggestions(prev => ({ 
        ...prev, 
        [identifier]: { 
          success: false, 
          message: error instanceof Error ? error.message : 'Network error' 
        } 
      }))
    } finally {
      setLoadingYoutube(prev => ({ ...prev, [identifier]: false }))
    }
  }

  const applyYoutubeSuggestions = (identifier: string, selectedFields: Record<string, boolean>) => {
    const editableValues = editableFields[identifier]
    if (!editableValues) return

    const newUpdates = [...updates]
    
    // Add YouTube URL if selected and has value
    if (selectedFields.youtube && editableValues.youtube) {
      newUpdates.push({
        field: 'youtube',
        value: editableValues.youtube,
        operation: 'replace'
      })
    }
    
    // Add band if selected and has value
    if (selectedFields.band && editableValues.band) {
      newUpdates.push({
        field: 'band',
        value: editableValues.band,
        operation: 'replace'
      })
    }
    
    // Add venue if selected and has value  
    if (selectedFields.venue && editableValues.venue) {
      newUpdates.push({
        field: 'venue',
        value: editableValues.venue,
        operation: 'replace'
      })
    }
    
    // Add date if selected and has value
    if (selectedFields.date && editableValues.date) {
      newUpdates.push({
        field: 'date',
        value: editableValues.date,
        operation: 'replace'
      })
    }

    setUpdates(newUpdates)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const validUpdates = updates.filter(update => 
      update.field.trim() && update.value.trim()
    )
    
    if (validUpdates.length === 0) {
      alert('Please add at least one valid metadata update')
      return
    }

    if (selectedItems.length === 0) {
      alert('Please select at least one item to update')
      return
    }

    onUpdate({
      items: selectedItems,
      updates: validUpdates
    })
  }

  // Handler for YouTube recording date updates
  const handleUpdateRecordingDates = async () => {
    if (!recordingDate || selectedItems.length === 0) {
      return
    }

    try {
      // Convert date to ISO 8601 format that YouTube expects
      const isoDate = new Date(recordingDate + 'T00:00:00.000Z').toISOString()
      
      // First, we need to fetch YouTube video IDs from Archive.org metadata
      const recordingStartMessage = `🎵 Looking up YouTube video IDs from Archive.org metadata...`
      console.log(recordingStartMessage)
      addLog({ type: 'info', message: recordingStartMessage })

      // Fetch metadata for each selected item to get YouTube URLs
      // Use our server's metadata endpoint
      const updates = []
      for (const identifier of selectedItems) {
        try {
          const metadataResponse = await fetch(`/api/metadata/${identifier}`)
          const metadata = await metadataResponse.json()
          
          const youtubeUrl = metadata.metadata?.youtube
          if (youtubeUrl) {
            // Extract video ID from YouTube URL
            const videoIdMatch = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/)
            if (videoIdMatch) {
              updates.push({
                archiveId: identifier,
                videoId: videoIdMatch[1],
                recordingDate: isoDate
              })
              console.log(`🎵 Found YouTube video: ${identifier} → ${videoIdMatch[1]}`)
            } else {
              console.warn(`🎵 Invalid YouTube URL format for ${identifier}: ${youtubeUrl}`)
              addLog({
                type: 'error',
                message: `Invalid YouTube URL format for ${identifier}`,
                identifier: identifier
              })
            }
          } else {
            console.warn(`🎵 No YouTube URL found for ${identifier}`)
            addLog({
              type: 'error', 
              message: `No YouTube URL found in metadata`,
              identifier: identifier
            })
          }
        } catch (error) {
          console.error(`🎵 Failed to fetch metadata for ${identifier}:`, error)
          addLog({
            type: 'error',
            message: `Failed to fetch metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
            identifier: identifier
          })
        }
      }

      if (updates.length === 0) {
        addLog({
          type: 'error',
          message: 'No YouTube video IDs found in selected Archive.org items. Make sure the items have "youtube" metadata field with valid YouTube URLs.'
        })
        return
      }

      const foundMessage = `🎵 Found ${updates.length} YouTube videos out of ${selectedItems.length} selected items`
      console.log(foundMessage)
      addLog({ type: 'info', message: foundMessage })

      // Confirmation for large batches
      if (updates.length > 20) {
        const confirmed = window.confirm(
          `You're about to update recording dates for ${updates.length} YouTube videos.\n\n` +
          `Recording Date: ${recordingDate}\n\n` +
          `This will update all ${updates.length} videos with this same date. Are you sure you want to continue?`
        )
        if (!confirmed) {
          addLog({ type: 'info', message: '❌ Operation cancelled by user' })
          return
        }
      }

      // Call the streaming endpoint
      const response = await fetch('/youtube/update-recording-dates-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Handle streaming response similar to image upload
      if (!response.body) {
        throw new Error('Streaming not supported')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6))

                if (data.videoId) {
                  // Find the corresponding Archive.org identifier
                  const update = updates.find(u => u.videoId === data.videoId)
                  const archiveId = update?.archiveId || 'unknown'
                  
                  if (data.error) {
                    const errorMsg = `YouTube recording date update failed: ${data.error}`
                    console.error(`🎵 ❌ ${archiveId} (${data.videoId}): ${errorMsg}`)
                    addLog({
                      type: 'error',
                      message: errorMsg,
                      identifier: archiveId
                    })
                  } else {
                    const successMsg = `YouTube recording date updated successfully`
                    console.log(`🎵 ✅ ${archiveId} (${data.videoId}): ${successMsg}`)
                    addLog({
                      type: 'success',
                      message: successMsg,
                      identifier: archiveId
                    })
                  }
                } else if (data.message) {
                  console.log(`🎵 ${data.message}`)
                  addLog({
                    type: 'info',
                    message: data.message
                  })
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete messages
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Clear the recording date after successful completion
      setRecordingDate('')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('YouTube recording date update failed:', errorMessage)
      addLog({
        type: 'error',
        message: `YouTube recording date update failed: ${errorMessage}`
      })
    }
  }

  // Handler for inferring recording dates and building video-date mapping
  const handleInferRecordingDate = async () => {
    console.log('🔍 Auto-detect button clicked!', { selectedItems })
    if (selectedItems.length === 0) {
      console.log('❌ No items selected')
      return
    }

    addLog({ type: 'info', message: `🔍 Building individual date mappings for ${selectedItems.length} items...` })
    setYoutubeDateLoading(true)

    try {
      const videoMappings = []

      for (const identifier of selectedItems) {
        try {
          // Get metadata from our server endpoint
          const metadataResponse = await fetch(`/api/metadata/${identifier}`)
          const metadata = await metadataResponse.json()
          
          // Check if this item has a YouTube URL
          const youtubeUrl = metadata.metadata?.youtube
          if (!youtubeUrl) continue

          // Extract video ID from YouTube URL
          const videoIdMatch = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/)
          if (!videoIdMatch) continue

          // Try to extract date from multiple sources
          const sources = [
            { text: metadata.metadata?.title || '', type: 'title' },
            { text: metadata.metadata?.description || '', type: 'description' },
            { text: identifier, type: 'identifier' },
            { text: metadata.metadata?.date || '', type: 'archive_date' }
          ]

          let detectedDate = ''

          for (const source of sources) {
            if (!source.text) continue

            // Look for date patterns like YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, etc.
            const dateMatches = source.text.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/g)
            
            if (dateMatches && dateMatches.length > 0) {
              for (const match of dateMatches) {
                let normalizedDate = match
                
                // Convert different formats to YYYY-MM-DD
                if (match.match(/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/)) {
                  // MM/DD/YYYY or MM-DD-YYYY
                  const parts = match.split(/[-\/]/)
                  normalizedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
                } else {
                  // YYYY/MM/DD or YYYY-MM-DD  
                  normalizedDate = match.replace(/\//g, '-')
                  const parts = normalizedDate.split('-')
                  if (parts.length === 3) {
                    normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                  }
                }

                // Validate the date
                const testDate = new Date(normalizedDate)
                if (!isNaN(testDate.getTime()) && testDate.getFullYear() >= 1900 && testDate.getFullYear() <= new Date().getFullYear()) {
                  detectedDate = normalizedDate
                  break
                }
              }
              if (detectedDate) break
            }
          }

          // Use today's date as fallback or detected date
          const finalDate = detectedDate || new Date().toISOString().split('T')[0]

          videoMappings.push({
            archiveId: identifier,
            videoId: videoIdMatch[1],
            title: metadata.metadata?.title || identifier,
            detectedDate: detectedDate || '',
            finalDate: finalDate
          })

        } catch (error) {
          console.warn(`Failed to analyze ${identifier} for dates:`, error)
        }
      }

      if (videoMappings.length === 0) {
        addLog({ 
          type: 'error', 
          message: 'No YouTube videos found in selected items. Make sure items have YouTube URLs in their metadata.' 
        })
        return
      }

      setVideoDateMappings(videoMappings)
      setShowVideoDateEditor(true)
      addLog({ 
        type: 'success', 
        message: `✅ Found ${videoMappings.length} YouTube videos with individual date detection. Review and edit dates below.` 
      })

    } catch (error) {
      console.error('Date inference failed:', error)
      addLog({
        type: 'error',
        message: `Date inference failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      setYoutubeDateLoading(false)
    }
  }

  // Handler for updating individual recording dates
  const handleUpdateIndividualRecordingDates = async () => {
    if (videoDateMappings.length === 0 || !youtubeAuthStatus.authenticated) {
      return
    }

    setYoutubeDateLoading(true)

    try {
      // Convert to the format expected by the server
      const updates = videoDateMappings.map(mapping => ({
        archiveId: mapping.archiveId,
        videoId: mapping.videoId,
        recordingDate: new Date(mapping.finalDate + 'T00:00:00.000Z').toISOString()
      }))

      const startMessage = `🎵 Updating ${updates.length} YouTube videos with individual recording dates...`
      console.log(startMessage)
      addLog({ type: 'info', message: startMessage })

      // Confirmation for large batches
      if (updates.length > 20) {
        const confirmed = window.confirm(
          `You're about to update recording dates for ${updates.length} YouTube videos with individual dates.\n\n` +
          `This will update each video with its own specific date. Are you sure you want to continue?`
        )
        if (!confirmed) {
          addLog({ type: 'info', message: '❌ Operation cancelled by user' })
          return
        }
      }

      // Call the streaming endpoint (same as before)
      const response = await fetch('/youtube/update-recording-dates-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Handle streaming response similar to the bulk update
      if (!response.body) {
        throw new Error('Streaming not supported')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6))
                
                if (data.type === 'success') {
                  const { archiveId, videoId } = data
                  const successMsg = `✅ Updated recording date for ${archiveId} (${videoId})`
                  console.log(`🎵 ${successMsg}`)
                  addLog({
                    type: 'success',
                    message: successMsg,
                    identifier: archiveId
                  })
                } else if (data.message) {
                  console.log(`🎵 ${data.message}`)
                  addLog({
                    type: 'info',
                    message: data.message
                  })
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete messages
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Clear the video date mappings and hide the editor after successful completion
      setVideoDateMappings([])
      setShowVideoDateEditor(false)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('YouTube individual recording date update failed:', errorMessage)
      addLog({
        type: 'error',
        message: `YouTube recording date update failed: ${errorMessage}`
      })
    } finally {
      setYoutubeDateLoading(false)
    }
  }

  // Handler for generating description previews
  const handlePreviewDescriptions = async () => {
    if (!youtubeAuthStatus.authenticated || selectedItems.length === 0) {
      return
    }

    setShowDescriptionPreview(false)
    const descriptionStartMessage = `🎵 Analyzing YouTube descriptions for ${selectedItems.length} items...`
    console.log(descriptionStartMessage)
    addLog({ type: 'info', message: descriptionStartMessage })

    try {
      // First get YouTube video IDs from Archive.org metadata (same as recording date logic)
      const videoMappings = []
      for (const identifier of selectedItems) {
        try {
          const metadataResponse = await fetch(`/api/metadata/${identifier}`)
          const metadata = await metadataResponse.json()
          
          const youtubeUrl = metadata.metadata?.youtube
          if (youtubeUrl) {
            const videoIdMatch = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/)
            if (videoIdMatch) {
              // Extract band name from Archive.org metadata
              const bandName = metadata.metadata?.band || metadata.metadata?.creator || 'Unknown Artist'
              videoMappings.push({
                archiveId: identifier,
                videoId: videoIdMatch[1],
                bandName: bandName,
                archiveUrl: `https://archive.org/details/${identifier}`
              })
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch metadata for ${identifier}:`, error)
        }
      }

      if (videoMappings.length === 0) {
        addLog({
          type: 'error',
          message: 'No YouTube videos found in selected items'
        })
        return
      }

      // Now get current YouTube descriptions
      const response = await fetch('/youtube/get-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoIds: videoMappings.map(v => v.videoId)
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch descriptions: ${response.status}`)
      }

      const descriptions = await response.json()

      // Generate description previews
      const previews = videoMappings.map(mapping => {
        const currentDesc = descriptions[mapping.videoId] || ''
        const newDesc = generateStandardDescription(currentDesc, mapping.bandName, mapping.archiveUrl, bandcampUrl)
        
        return {
          archiveId: mapping.archiveId,
          videoId: mapping.videoId,
          currentDescription: currentDesc,
          newDescription: newDesc,
          needsUpdate: shouldUpdateDescription(currentDesc, newDesc)
        }
      })

      setDescriptionPreviews(previews)
      setShowDescriptionPreview(true)
      
      const needsUpdateCount = previews.filter(p => p.needsUpdate).length
      addLog({
        type: 'info',
        message: `📋 Found ${needsUpdateCount} descriptions that need updating out of ${previews.length} total`
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      addLog({
        type: 'error',
        message: `Failed to analyze descriptions: ${errorMessage}`
      })
    }
  }

  // Generate standardized description
  const generateStandardDescription = (currentDesc: string, bandName: string, archiveUrl: string, bandcampUrl: string): string => {
    // Clean up current description
    let cleanedDesc = currentDesc

    // Fix bandcamp URLs from http to https
    cleanedDesc = cleanedDesc.replace(/http:\/\/([^\/]*\.bandcamp\.com)/g, 'https://$1')

    // Remove existing download lines (various formats)
    const downloadPatterns = [
      /\s*[|\-]\s*.*?(?:download|full)\s*@.*$/gim,
      /\s*download\s*@.*$/gim,
      /\s*full\s*@.*$/gim,
      /\s*full download\s*@.*$/gim
    ]
    
    downloadPatterns.forEach(pattern => {
      cleanedDesc = cleanedDesc.replace(pattern, '')
    })

    // Trim whitespace
    cleanedDesc = cleanedDesc.trim()

    // Add standardized ending
    const standardEnding = `${bandcampUrl ? ` | ${bandName} - ` : ' | '}download @ ${archiveUrl}`
    
    return cleanedDesc + standardEnding
  }

  // Check if description needs updating
  const shouldUpdateDescription = (current: string, proposed: string): boolean => {
    // Skip if they're the same
    if (current === proposed) return false
    
    // Skip if current description is very long (probably has custom content)
    if (current.length > 500) return false
    
    // Skip if current description doesn't have any download-related patterns
    const hasDownloadPattern = /(?:download|full)\s*@/i.test(current)
    const hasBandcampPattern = /bandcamp\.com/i.test(current)
    
    // Only update if it has download patterns or bandcamp links that might need fixing
    return hasDownloadPattern || hasBandcampPattern
  }

  // Apply description updates
  const handleApplyDescriptionUpdates = async () => {
    const toUpdate = descriptionPreviews.filter(p => p.needsUpdate)
    
    if (toUpdate.length === 0) {
      addLog({ type: 'info', message: 'No descriptions selected for update' })
      return
    }

    try {
      const response = await fetch('/youtube/update-descriptions-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: toUpdate.map(item => ({
            videoId: item.videoId,
            newDescription: item.newDescription
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Handle streaming response (similar to recording date updates)
      if (!response.body) {
        throw new Error('Streaming not supported')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6))

                if (data.videoId) {
                  const preview = toUpdate.find(u => u.videoId === data.videoId)
                  const archiveId = preview?.archiveId || 'unknown'
                  
                  if (data.error) {
                    const errorMsg = `YouTube description update failed: ${data.error}`
                    console.error(`🎵 ❌ ${archiveId} (${data.videoId}): ${errorMsg}`)
                    addLog({
                      type: 'error',
                      message: errorMsg,
                      identifier: archiveId
                    })
                  } else {
                    const successMsg = `YouTube description updated successfully`
                    console.log(`🎵 ✅ ${archiveId} (${data.videoId}): ${successMsg}`)
                    addLog({
                      type: 'success',
                      message: successMsg,
                      identifier: archiveId
                    })
                  }
                } else if (data.message) {
                  console.log(`🎵 ${data.message}`)
                  addLog({
                    type: 'info',
                    message: data.message
                  })
                }
              } catch (parseError) {
                // Ignore parse errors
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Clear previews after successful update
      setShowDescriptionPreview(false)
      setDescriptionPreviews([])

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      addLog({
        type: 'error',
        message: `YouTube description update failed: ${errorMessage}`
      })
    }
  }

  if (selectedItems.length === 0) {
    return (
      <div className="section">
        <h3>Metadata Editor</h3>
        
        {/* Daily Workflow Button - Always visible for complete morning routine */}
        <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '8px', textAlign: 'center' }}>
          <button
            type="button"
            className="button primary"
            onClick={async () => {
              console.log('🚀 Starting Complete Daily YouTube Workflow...')
              
              try {
                // Phase 0a: Clear previous state to ensure fresh start
                console.log('🔄 Clearing previous YouTube suggestion state...')
                addLog({ type: 'info', message: '🔄 Clearing previous YouTube suggestion state...' })
                setYoutubeSuggestions({})
                setLoadingYoutube({})
                setEditableFields({})
                
                // Wait for React state updates to complete
                await new Promise<void>(resolve => {
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                })
                
                // Phase 0b: Load all user items and get the data directly
                console.log('📂 Loading all your Archive.org items...')
                addLog({ type: 'info', message: '📂 Loading all your Archive.org items...' })
                
                // Get items directly from API instead of relying on state
                const response = await fetch('/api/user-items')
                if (!response.ok) {
                  alert('❌ Failed to load items! Check your Archive.org credentials.')
                  return
                }
                const data = await response.json()
                const allItems = data.items || []
                
                console.log(`📊 Total items loaded: ${allItems.length}`)
                if (allItems.length === 0) {
                  alert('❌ No items found! Make sure your Archive.org credentials are configured correctly.')
                  return
                }
                
                // Debug: Check what items look like
                console.log('🔍 DEBUG: Sample items:', allItems.slice(0, 3).map(item => ({ 
                  identifier: item.identifier, 
                  title: item.title?.substring(0, 50), 
                  youtube: item.youtube,
                  hasYoutube: !!item.youtube
                })))
                
                // Filter to only items that DON'T have YouTube URLs yet
                const itemsNeedingYouTube = allItems.filter((item: ArchiveItem) => !item.youtube)
                console.log(`📊 Items needing YouTube URLs: ${itemsNeedingYouTube.length} out of ${allItems.length}`)
                addLog({ type: 'info', message: `📊 Found ${itemsNeedingYouTube.length} items needing YouTube URLs (out of ${allItems.length} total)` })
                
                if (itemsNeedingYouTube.length === 0) {
                  alert('✅ All items already have YouTube URLs! No work needed.')
                  return
                }
                
                // Process all items needing YouTube URLs (quota-safe with fail-fast)
                const loadedItems = itemsNeedingYouTube
                console.log(`📊 Ready to process ${loadedItems.length} items needing YouTube URLs`)
                addLog({ type: 'info', message: `📊 Ready to process ${loadedItems.length} items needing YouTube URLs (with quota protection)` })
                
                // Phase 1: Select all items (trigger the hook to update UI state)
                console.log(`✅ Selecting all ${loadedItems.length} items...`)
                addLog({ type: 'info', message: `✅ Selecting all ${loadedItems.length} items...` })
                onSelectAllItems()
                
                // Let React state update propagate
                await new Promise<void>(resolve => {
                  // Use requestAnimationFrame to wait for next render cycle
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                })
                
                console.log(`🎯 Starting YouTube workflow for ${loadedItems.length} items...`)
                addLog({ type: 'info', message: `🎯 Starting YouTube workflow for ${loadedItems.length} items...` })
                
                let processedCount = 0
                let addedCount = 0
                let skippedCount = 0
                
                addLog({ type: 'info', message: `🔄 Starting sequential workflow - search YouTube → apply to Archive.org → next item` })
                
                // Phase 2 & 3 Combined: Sequential processing (search → apply → next)
                for (let i = 0; i < loadedItems.length; i++) {
                  const identifier = loadedItems[i].identifier
                  const itemTitle = loadedItems[i].title || 'Unknown Title'
                  const itemData = loadedItems[i]
                  
                  // Debug logging to see what's happening
                  console.log(`DEBUG: Processing ${identifier} sequentially (${i+1}/${loadedItems.length})`)
                  
                  // Skip if no title
                  if (!itemData.title) {
                    addLog({ type: 'skipped', message: `[${i+1}/${loadedItems.length}] ⏭️  Skipping ${identifier} - no title` })
                    skippedCount++
                    continue
                  }
                  
                  try {
                    // Step 1: Search YouTube for this item
                    addLog({ type: 'info', message: `[${i+1}/${loadedItems.length}] 🔍 Searching YouTube for: ${identifier} (${itemTitle})` })
                    
                    const response = await fetch('/api/youtube-suggest', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        items: [{
                          identifier,
                          title: itemData.title,
                          ...(itemData.date ? { date: itemData.date } : {})
                        }]
                      })
                    })
                    
                    if (!response.ok) {
                      // Check if this is a quota exhaustion error at HTTP level
                      if (response.status === 403) {
                        addLog({ type: 'error', message: `🚫 QUOTA EXHAUSTED - Stopping workflow after processing ${processedCount} items` })
                        console.log(`⚡ YouTube quota exhausted: HTTP 403 error, stopping workflow after processing ${processedCount} items`)
                        alert(`⚡ YouTube API quota exhausted! Processed ${processedCount} items before hitting daily limit. Workflow stopped to preserve quota. Try again tomorrow when quota resets.`)
                        return
                      }
                      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                    }
                    
                    const responseData = await response.json()
                    
                    // Check for quota exhaustion at response body level first
                    if (responseData.quotaExhausted) {
                      addLog({ type: 'error', message: `🚫 QUOTA EXHAUSTED - Stopping workflow after processing ${processedCount} items` })
                      console.log(`⚡ YouTube quota exhausted: stopping workflow after processing ${processedCount} items`)
                      alert(`⚡ YouTube API quota exhausted! Processed ${processedCount} items before hitting daily limit. Workflow stopped to preserve quota. Try again tomorrow when quota resets.`)
                      return
                    }
                    
                    // Extract the first result since we sent one item
                    const suggestion = responseData.results?.[0] || responseData
                    
                    // Check for quota exhaustion in individual result - stop entire workflow immediately
                    if (suggestion && suggestion.quotaExhausted) {
                      addLog({ type: 'error', message: `🚫 QUOTA EXHAUSTED - Stopping workflow after processing ${processedCount} items` })
                      console.log(`⚡ YouTube quota exhausted: stopping workflow after processing ${processedCount} items`)
                      alert(`⚡ YouTube API quota exhausted! Processed ${processedCount} items before hitting daily limit. Workflow stopped to preserve quota. Try again tomorrow when quota resets.`)
                      return
                    }
                    
                    // Also check if error message contains quota exhausted - stop immediately
                    if (suggestion && !suggestion.success && suggestion.error && 
                        (suggestion.error.includes('QUOTA_EXHAUSTED') || suggestion.error.toLowerCase().includes('quota'))) {
                      addLog({ type: 'error', message: `🚫 YouTube quota exhausted - stopping entire workflow` })
                      console.log(`⚡ YouTube quota exhausted: stopping workflow after processing ${processedCount} items`)
                      alert(`⚡ YouTube quota exhausted! Processed ${processedCount} items before hitting daily limit. Workflow stopped to preserve quota. Try again tomorrow when quota resets.`)
                      return
                    }
                    
                    processedCount++
                    
                    // Step 2: If YouTube match found, immediately apply it to Archive.org
                    if (suggestion && suggestion.success && suggestion.suggestions?.youtube) {
                      addLog({ type: 'success', message: `[${i+1}/${loadedItems.length}] ✅ Found YouTube match: ${suggestion.suggestions.youtube}` })
                      addLog({ type: 'info', message: `[${i+1}/${loadedItems.length}] 🔗 Applying YouTube link to Archive.org metadata...` })
                      
                      try {
                        // Apply the YouTube link to Archive.org
                        await onUpdate({
                          items: [identifier],
                          updates: [{
                            field: 'youtube',
                            value: suggestion.suggestions.youtube,
                            operation: 'replace'
                          }]
                        })
                        
                        addLog({ type: 'success', message: `[${i+1}/${loadedItems.length}] ✅ Successfully added YouTube link to ${identifier}` })
                        addedCount++
                        
                      } catch (updateError) {
                        addLog({ type: 'error', message: `[${i+1}/${loadedItems.length}] ❌ Failed to update ${identifier}: ${updateError instanceof Error ? updateError.message : 'Unknown error'}` })
                        console.error('Error updating Archive.org metadata:', updateError)
                        
                        // HALT WORKFLOW IMMEDIATELY ON UPDATE FAILURE
                        addLog({ type: 'error', message: `🛑 WORKFLOW HALTED: Archive.org update failed for ${identifier}. Stopping to prevent further issues.` })
                        console.log(`🛑 Sequential workflow stopped: Archive.org update failed for ${identifier} after processing ${processedCount} items`)
                        alert(`🛑 Workflow stopped after Archive.org update failure for ${identifier}.\\n\\nProcessed: ${processedCount} items\\nAdded: ${addedCount} YouTube links\\n\\nCheck logs for error details.`)
                        return
                      }
                      
                    } else {
                      // Check if this is actually a quota/error issue vs genuine no match
                      if (suggestion && !suggestion.success && suggestion.error) {
                        if (suggestion.error.includes('QUOTA_EXHAUSTED') || suggestion.error.toLowerCase().includes('quota')) {
                          // This should already be caught above, but double-check
                          addLog({ type: 'error', message: `🚫 YouTube quota exhausted - stopping workflow` })
                          console.log(`⚡ YouTube quota exhausted: stopping workflow`)
                          alert(`⚡ YouTube quota exhausted! Workflow stopped to preserve quota.`)
                          return
                        } else {
                          addLog({ type: 'error', message: `[${i+1}/${loadedItems.length}] ❌ Error processing ${identifier}: ${suggestion.error}` })
                        }
                      } else {
                        // Genuine no match found
                        addLog({ type: 'info', message: `[${i+1}/${loadedItems.length}] ⏭️ No YouTube match found for ${identifier}` })
                      }
                      skippedCount++
                    }
                    
                  } catch (error) {
                    addLog({ type: 'error', message: `[${i+1}/${loadedItems.length}] ❌ Error processing ${identifier}: ${error instanceof Error ? error.message : 'Unknown error'}` })
                    console.error('Error in sequential workflow:', error)
                    
                    // HALT WORKFLOW IMMEDIATELY ON ANY ERROR
                    addLog({ type: 'error', message: `🛑 WORKFLOW HALTED: Error encountered during processing of ${identifier}. Stopping to prevent further issues.` })
                    console.log(`🛑 Sequential workflow stopped: error encountered while processing ${identifier} after processing ${processedCount} items`)
                    alert(`🛑 Workflow stopped after encountering an error while processing ${identifier}.\\n\\nProcessed: ${processedCount} items\\nAdded: ${addedCount} YouTube links\\n\\nError: ${error instanceof Error ? error.message : 'Unknown error'}\\n\\nCheck logs for details.`)
                    return
                  }
                  
                  // Small delay to avoid overwhelming APIs
                  await new Promise(resolve => setTimeout(resolve, 100))
                }
                
                addLog({ type: 'info', message: `🎉 SEQUENTIAL WORKFLOW COMPLETE! ✅ ${addedCount} links added, ⏭️ ${skippedCount} items skipped` })
                console.log(`✅ Daily workflow completed: ${processedCount} items processed, ${addedCount} links successfully added`)
                alert(`✅ Complete Daily YouTube workflow finished!\\n\\n📂 Loaded ${loadedItems.length} Archive.org items\\n📊 ${processedCount} items processed sequentially\\n🔗 ${addedCount} YouTube links successfully added to Archive.org\\n\\nAll done! Check the logs for details.`)
                
              } catch (error) {
                console.error('Error in daily workflow:', error)
                alert(`❌ Daily workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
              }
            }}
            style={{ padding: '15px 30px', fontSize: '18px', fontWeight: 'bold' }}
            title="Complete one-click morning routine: Loads all items, selects all, gets matches, adds YouTube links"
            disabled={loading}
          >
            ⚡ Complete Daily YouTube Workflow
          </button>
          <p style={{ marginTop: '8px', fontSize: '14px', opacity: 0.8 }}>
            🛡️ QUOTA-SAFE: Processes all items without YouTube links → Gets matches → Adds links (halts immediately on quota/errors)
          </p>
        </div>
        
        <p style={{ opacity: 0.7 }}>Select items above to edit their metadata, or use the Daily Workflow button for your morning routine!</p>
      </div>
    )
  }

  return (
    <div className="section">
      <h3>Metadata Editor ({selectedItems.length} items selected)</h3>
      
      <form onSubmit={handleSubmit}>
        {updates.map((update, index) => (
          <div key={index} style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 2fr auto', 
            gap: '10px', 
            alignItems: 'end',
            marginBottom: '15px',
            padding: '15px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px'
          }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Field</label>
              <select
                value={update.field}
                onChange={(e) => handleUpdateChange(index, 'field', e.target.value)}
              >
                <option value="">Select field</option>
                {commonFields.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
                <option value="custom">Custom field...</option>
              </select>
              {update.field === 'custom' && (
                <input
                  type="text"
                  placeholder="Enter custom field name"
                  style={{ marginTop: '5px' }}
                  onChange={(e) => handleUpdateChange(index, 'field', e.target.value)}
                />
              )}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>Value (will replace existing)</label>
              <input
                type="text"
                value={update.value}
                onChange={(e) => handleUpdateChange(index, 'value', e.target.value)}
                placeholder="Enter new value - this will replace any existing value"
              />
            </div>

            <button
              type="button"
              className="button danger"
              onClick={() => removeUpdate(index)}
              style={{ height: 'fit-content' }}
            >
              ×
            </button>
          </div>
        ))}

        <div style={{ marginTop: '20px' }}>
          <button type="button" className="button secondary" onClick={addUpdate}>
            + Add Field
          </button>
          
          <button type="submit" className="button" disabled={loading}>
            {loading ? <span className="loading" /> : `Update ${selectedItems.length} Items`}
          </button>
        </div>
      </form>

      {selectedItems.length > 0 && (
        <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(0, 123, 255, 0.1)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '15px' }}>🎵 YouTube Suggestions</h4>
          <p style={{ marginBottom: '15px', fontSize: '14px', opacity: 0.9 }}>
            Get YouTube video matches and auto-extract metadata for selected items:
          </p>

          <div style={{ marginBottom: '20px', textAlign: 'center', display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                // Add delays between requests to avoid rate limiting
                for (let i = 0; i < selectedItems.length; i++) {
                  const identifier = selectedItems[i]
                  if (!loadingYoutube[identifier]) {
                    try {
                      await getYoutubeSuggestion(identifier)
                      // Check if quota was exhausted in the response
                      const suggestion = youtubeSuggestions[identifier]
                      if (suggestion && !suggestion.success && (suggestion as any).quotaExhausted) {
                        console.log('YouTube API quota exhausted, stopping batch processing')
                        break
                      }
                    } catch (error) {
                      console.error('Error getting YouTube suggestion:', error)
                    }
                    // Natural rate limiting through async operations
                  }
                }
              }}
              style={{ padding: '10px 20px' }}
            >
              🔍 Get YouTube Matches for All
            </button>
            
            <button
              type="button"
              className="button"
              onClick={() => {
                // Process each item individually with its own YouTube URL
                let addedCount = 0
                
                selectedItems.forEach(identifier => {
                  const editableValues = editableFields[identifier]
                  if (editableValues?.youtube) {
                    // Apply YouTube URL only to this specific item
                    onUpdate({
                      items: [identifier], // Only this item
                      updates: [{
                        field: 'youtube',
                        value: editableValues.youtube,
                        operation: 'replace'
                      }]
                    })
                    addedCount++
                  }
                })
                
                if (addedCount === 0) {
                  alert('❌ No YouTube matches found. Click "Get YouTube Matches for All" first.')
                }
              }}
              style={{ padding: '10px 20px' }}
              disabled={!Object.values(editableFields).some(fields => fields?.youtube)}
            >
              🔗 Add YouTube Links
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            {selectedItems.map(identifier => {
              const item = items.find(i => i.identifier === identifier)
              const suggestion = youtubeSuggestions[identifier]
              const isLoading = loadingYoutube[identifier]
              
              return (
                <div key={identifier} style={{ 
                  flex: '1', 
                  minWidth: '300px',
                  padding: '15px', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  borderRadius: '6px' 
                }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '5px' }}>
                    <a 
                      href={`https://archive.org/details/${identifier}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#007bff', textDecoration: 'none' }}
                    >
                      {identifier} 🔗
                    </a>
                  </div>
                  <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                    {item?.title || 'No title'}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => getYoutubeSuggestion(identifier)}
                      disabled={isLoading}
                      style={{ flex: 1 }}
                    >
                      {isLoading ? 'Searching...' : 'Get YouTube Match'}
                    </button>
                  </div>
                  
                  {suggestion && (
                    <div style={{ fontSize: '13px' }}>
                      {suggestion.success && suggestion.suggestions ? (
                        <div>
                          <div style={{ color: '#4CAF50', marginBottom: '8px' }}>✓ Match found!</div>
                          
                          <div style={{ marginBottom: '10px', fontSize: '12px', opacity: 0.8 }}>
                            Select fields to apply:
                          </div>
                          
                          {editableFields[identifier]?.youtube && (
                            <div style={{ 
                              marginBottom: '8px', 
                              padding: '8px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              borderRadius: '4px',
                              display: 'flex', 
                              alignItems: 'flex-start', 
                              gap: '10px' 
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedFields[identifier]?.youtube || false}
                                onChange={(e) => setSelectedFields(prev => ({
                                  ...prev,
                                  [identifier]: { ...prev[identifier], youtube: e.target.checked }
                                }))}
                                style={{ marginTop: '2px' }}
                              />
                              <div style={{ flex: 1, lineHeight: '1.4' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>YouTube URL:</div>
                                <input
                                  type="text"
                                  value={editableFields[identifier]?.youtube || ''}
                                  onChange={(e) => setEditableFields(prev => ({
                                    ...prev,
                                    [identifier]: { ...prev[identifier], youtube: e.target.value }
                                  }))}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '3px',
                                    backgroundColor: '#fff',
                                    color: '#333'
                                  }}
                                />
                                <a 
                                  href={editableFields[identifier]?.youtube} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ 
                                    color: '#007bff', 
                                    textDecoration: 'none',
                                    fontSize: '11px',
                                    display: 'inline-block',
                                    marginTop: '4px'
                                  }}
                                >
                                  🔗 Preview Link
                                </a>
                              </div>
                            </div>
                          )}
                          
                          {editableFields[identifier]?.band && (
                            <div style={{ 
                              marginBottom: '8px', 
                              padding: '8px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              borderRadius: '4px',
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px' 
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedFields[identifier]?.band || false}
                                onChange={(e) => setSelectedFields(prev => ({
                                  ...prev,
                                  [identifier]: { ...prev[identifier], band: e.target.checked }
                                }))}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Band:</div>
                                <input
                                  type="text"
                                  value={editableFields[identifier]?.band || ''}
                                  onChange={(e) => setEditableFields(prev => ({
                                    ...prev,
                                    [identifier]: { ...prev[identifier], band: e.target.value }
                                  }))}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '3px',
                                    backgroundColor: '#fff',
                                    color: '#333'
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {editableFields[identifier]?.venue && (
                            <div style={{ 
                              marginBottom: '8px', 
                              padding: '8px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              borderRadius: '4px',
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px' 
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedFields[identifier]?.venue || false}
                                onChange={(e) => setSelectedFields(prev => ({
                                  ...prev,
                                  [identifier]: { ...prev[identifier], venue: e.target.checked }
                                }))}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Venue:</div>
                                <input
                                  type="text"
                                  value={editableFields[identifier]?.venue || ''}
                                  onChange={(e) => setEditableFields(prev => ({
                                    ...prev,
                                    [identifier]: { ...prev[identifier], venue: e.target.value }
                                  }))}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '3px',
                                    backgroundColor: '#fff',
                                    color: '#333'
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          
                          {editableFields[identifier]?.date && (
                            <div style={{ 
                              marginBottom: '8px', 
                              padding: '8px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              borderRadius: '4px',
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px' 
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedFields[identifier]?.date || false}
                                onChange={(e) => setSelectedFields(prev => ({
                                  ...prev,
                                  [identifier]: { ...prev[identifier], date: e.target.checked }
                                }))}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Date:</div>
                                <input
                                  type="date"
                                  value={editableFields[identifier]?.date || ''}
                                  onChange={(e) => setEditableFields(prev => ({
                                    ...prev,
                                    [identifier]: { ...prev[identifier], date: e.target.value }
                                  }))}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    fontSize: '12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '3px',
                                    backgroundColor: '#fff',
                                    color: '#333'
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          
                          <button
                            type="button"
                            className="button"
                            onClick={() => applyYoutubeSuggestions(identifier, selectedFields[identifier] || {})}
                            style={{ marginTop: '8px', width: '100%', padding: '5px' }}
                          >
                            Apply Selected Fields
                          </button>
                        </div>
                      ) : (
                        <div style={{ color: '#ff6b6b' }}>
                          {suggestion.message || 'No match found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                // Apply selected metadata individually for each item that has matches
                selectedItems.forEach(identifier => {
                  const editableValues = editableFields[identifier]
                  if (editableValues) {
                    // Check if fields are selected (default to true for YouTube)
                    const fields = selectedFields[identifier] || { youtube: true }
                    
                    // Build updates for this specific item
                    const itemUpdates = []
                    
                    if (fields.youtube && editableValues.youtube) {
                      itemUpdates.push({
                        field: 'youtube',
                        value: editableValues.youtube,
                        operation: 'replace' as const
                      })
                    }
                    
                    if (fields.band && editableValues.band) {
                      itemUpdates.push({
                        field: 'band',
                        value: editableValues.band,
                        operation: 'replace' as const
                      })
                    }
                    
                    if (fields.venue && editableValues.venue) {
                      itemUpdates.push({
                        field: 'venue',
                        value: editableValues.venue,
                        operation: 'replace' as const
                      })
                    }
                    
                    if (fields.date && editableValues.date) {
                      itemUpdates.push({
                        field: 'date',
                        value: editableValues.date,
                        operation: 'replace' as const
                      })
                    }
                    
                    // Apply updates to this specific item only
                    if (itemUpdates.length > 0) {
                      onUpdate({
                        items: [identifier],
                        updates: itemUpdates
                      })
                    }
                  }
                })
              }}
              style={{ padding: '10px 20px' }}
              disabled={!Object.values(editableFields).some(fields => fields?.youtube)}
            >
              ✅ Apply All Selected Fields
            </button>
          </div>
        </div>
      )}

      {selectedItems.length > 0 && (
        <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(255, 140, 0, 0.1)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '15px' }}>🖼️ Batch Image Upload</h4>
          <p style={{ marginBottom: '15px', fontSize: '14px', opacity: 0.9 }}>
            Upload a flyer or cover image to apply to all selected items as their thumbnail/cover image:
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    // Validate file type
                    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
                    if (!validTypes.includes(file.type)) {
                      alert(`Unsupported file type: ${file.type}. Please select a JPEG, PNG, GIF, or WebP image.`)
                      e.target.value = '' // Clear the input
                      return
                    }
                    
                    // Validate file size (10MB limit)
                    const maxSize = 10 * 1024 * 1024 // 10MB in bytes
                    if (file.size > maxSize) {
                      alert(`File is too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 10MB.`)
                      e.target.value = '' // Clear the input
                      return
                    }
                    
                    setSelectedImageFile(file)
                    console.log('Selected image file:', file.name, `${(file.size / 1024 / 1024).toFixed(1)}MB`, `Type: ${file.type}`)
                  }
                }}
                style={{
                  padding: '8px 12px',
                  border: '2px dashed rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'white',
                  cursor: 'pointer'
                }}
              />
              
              <button
                type="button"
                className="button"
                onClick={async () => {
                  if (!selectedImageFile) {
                    alert('Please select an image file first')
                    return
                  }
                  
                  if (!confirm(`Upload "${selectedImageFile.name}" as cover image to all ${selectedItems.length} selected items?`)) {
                    return
                  }
                  
                  setUploadingImages(true)
                  
                  try {
                    const formData = new FormData()
                    formData.append('image', selectedImageFile)
                    formData.append('items', JSON.stringify(selectedItems))
                    
                    // Log start of batch upload to both console and activity log
                    const uploadStartMessage = `🖼️ Starting image upload "${selectedImageFile.name}" for ${selectedItems.length} items...`
                    console.log(uploadStartMessage)
                    addLog({
                      type: 'info',
                      message: uploadStartMessage
                    })
                    
                    // Use the streaming endpoint to get real-time progress
                    const response = await fetch('/api/batch-upload-image-stream', {
                      method: 'POST',
                      body: formData
                    })
                    
                    if (!response.ok) {
                      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
                    }
                    
                    // Handle streaming response
                    const reader = response.body?.getReader()
                    if (!reader) {
                      throw new Error('Stream reader not available')
                    }
                    
                    const decoder = new TextDecoder()
                    let buffer = ''
                    
                    try {
                      while (true) {
                        const { done, value } = await reader.read()
                        if (done) break
                        
                        buffer += decoder.decode(value, { stream: true })
                        
                        // Process complete SSE messages
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || '' // Keep incomplete line in buffer
                        
                        for (const line of lines) {
                          if (line.startsWith('data: ')) {
                            try {
                              const data = JSON.parse(line.substring(6))
                              
                              // Handle individual item results
                              if (data.identifier && data.error) {
                                const errorMsg = `Image upload failed: ${data.error}`
                                console.error(`📷 ❌ ${data.identifier}: ${errorMsg}`)
                                addLog({
                                  type: 'error',
                                  message: errorMsg,
                                  identifier: data.identifier
                                })
                              }
                              // Handle server messages (including completion summary)
                              else if (data.message) {
                                console.log(`📷 ${data.message}`)
                                addLog({
                                  type: 'info',
                                  message: data.message
                                })
                              }
                              
                            } catch (parseError) {
                              // Ignore parse errors for incomplete messages
                            }
                          }
                        }
                      }
                    } finally {
                      reader.releaseLock()
                    }
                    
                    // Clear the selected file
                    setSelectedImageFile(null)
                    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
                    if (fileInput) fileInput.value = ''
                    
                  } catch (error) {
                    addLog({
                      type: 'error',
                      message: `Batch image upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    })
                  } finally {
                    setUploadingImages(false)
                  }
                }}
                style={{ padding: '8px 16px' }}
                disabled={!selectedImageFile || uploadingImages || loading}
              >
                {uploadingImages ? (
                  <>🔄 Uploading...</>
                ) : (
                  <>🚀 Upload to All {selectedItems.length} Items</>
                )}
              </button>
            </div>

            {selectedImageFile && (
              <div style={{ 
                padding: '10px', 
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '4px', 
                fontSize: '13px' 
              }}>
                <strong>Selected:</strong> {selectedImageFile.name} ({(selectedImageFile.size / 1024 / 1024).toFixed(1)}MB)
              </div>
            )}
            
            <div style={{ fontSize: '12px', opacity: 0.7 }}>
              <strong>Supported formats:</strong> JPG, PNG, GIF, WebP<br/>
              <strong>Recommended size:</strong> At least 300x300px for good thumbnail quality<br/>
              <strong>What happens:</strong> The image will be uploaded as the cover/thumbnail for each selected item
            </div>
          </div>
        </div>
      )}

      {/* YouTube Recording Date Editor Section */}
      {selectedItems.length > 0 && (
        <div className="section">
          <h3>🎵 YouTube Recording Date Editor</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
              Bulk edit the recording dates for YouTube videos. This requires YouTube authentication.
            </p>

            {/* Authentication Status */}
            <div style={{ 
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: youtubeAuthStatus.loading ? '#f8f9fa' : youtubeAuthStatus.authenticated ? '#d4edda' : '#f8d7da',
              borderRadius: '6px',
              fontSize: '13px',
              border: `1px solid ${youtubeAuthStatus.loading ? '#e9ecef' : youtubeAuthStatus.authenticated ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              {youtubeAuthStatus.loading ? (
                <>⏳ Checking YouTube authentication...</>
              ) : youtubeAuthStatus.authenticated ? (
                <>✅ <strong>Connected to YouTube</strong> - Ready to update recording dates</>
              ) : (
                <>❌ <strong>Not connected to YouTube</strong> - Authentication required</>
              )}
            </div>

            {/* Connect Button */}
            {!youtubeAuthStatus.loading && !youtubeAuthStatus.authenticated && (
              <div style={{ marginBottom: '15px' }}>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/auth/youtube'
                  }}
                  className="button secondary"
                  style={{ marginRight: '10px' }}
                >
                  🔗 Connect to YouTube
                </button>
                <span style={{ fontSize: '12px', opacity: 0.7 }}>
                  Redirects to Google for secure authentication
                </span>
              </div>
            )}
            
            <div style={{ 
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#333'
            }}>
              <strong>📅 Recording Date:</strong> When the video content was actually recorded (not published)<br/>
              <strong>Format:</strong> YYYY-MM-DD (e.g., 2024-01-04)<br/>
              <strong>Note:</strong> This is different from the YouTube publish date, which cannot be changed.<br/>
              <strong>Auto-detect:</strong> Dates will be inferred from titles/metadata when possible
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <input
                type="date"
                value={recordingDate}
                onChange={(e) => setRecordingDate(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
                placeholder="YYYY-MM-DD"
              />
              
              <button
                onClick={handleInferRecordingDate}
                disabled={youtubeDateLoading || selectedItems.length === 0}
                className="button secondary"
                style={{ 
                  opacity: (youtubeDateLoading || selectedItems.length === 0) ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}
              >
                🔍 Auto-Detect Date
              </button>
              
              <button
                onClick={handleUpdateRecordingDates}
                disabled={youtubeDateLoading || !recordingDate || !youtubeAuthStatus.authenticated}
                className="button primary"
                style={{ 
                  opacity: (!recordingDate || youtubeDateLoading || !youtubeAuthStatus.authenticated) ? 0.6 : 1 
                }}
              >
                {youtubeDateLoading ? 'Updating...' : `Update Recording Dates for ${selectedItems.length} Items`}
              </button>
            </div>

            <div style={{ 
              fontSize: '12px', 
              opacity: 0.7,
              marginBottom: '10px',
              color: '#666'
            }}>
              <strong>⚠️ Important:</strong> Only items with YouTube URLs will be processed<br/>
              <strong>What this does:</strong> Sets the recording date metadata for YouTube videos<br/>
              <strong>Rate limits:</strong> Updates are processed one at a time to respect API limits<br/>
              <strong>Safety:</strong> You'll see a preview of which videos will be updated before proceeding
            </div>

            {/* Individual Video Date Editor */}
            {showVideoDateEditor && videoDateMappings.length > 0 && (
              <div style={{
                marginBottom: '15px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #ddd',
                color: '#333'
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: 0 }}>
                    📋 Individual Video Dates ({videoDateMappings.length} videos)
                  </h4>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        // Apply individual dates
                        handleUpdateIndividualRecordingDates()
                      }}
                      disabled={youtubeDateLoading || !youtubeAuthStatus.authenticated}
                      className="button primary"
                      style={{ 
                        opacity: (youtubeDateLoading || !youtubeAuthStatus.authenticated) ? 0.6 : 1 
                      }}
                    >
                      {youtubeDateLoading ? 'Updating...' : `Update ${videoDateMappings.length} Videos`}
                    </button>
                    <button
                      onClick={() => setShowVideoDateEditor(false)}
                      className="button secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {videoDateMappings.map((mapping, index) => (
                    <div key={mapping.videoId} style={{
                      marginBottom: '10px',
                      padding: '10px',
                      backgroundColor: '#fff',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'bold', 
                        marginBottom: '5px',
                        color: '#666'
                      }}>
                        {mapping.archiveId} → {mapping.title}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="date"
                          value={mapping.finalDate}
                          onChange={(e) => {
                            const newMappings = [...videoDateMappings]
                            newMappings[index].finalDate = e.target.value
                            setVideoDateMappings(newMappings)
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '12px'
                          }}
                        />
                        
                        <span style={{ fontSize: '11px', color: '#666' }}>
                          {mapping.detectedDate ? 
                            `Auto-detected: ${mapping.detectedDate}` : 
                            'No date found - using today'
                          }
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {selectedItems.length > 50 && (
              <div style={{
                padding: '10px',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '6px',
                marginBottom: '10px',
                fontSize: '13px',
                color: '#856404'
              }}>
                ⚠️ <strong>Large batch warning:</strong> You have {selectedItems.length} items selected. Only items with YouTube metadata will be processed. The operation will show a preview first.
              </div>
            )}
          </div>
        </div>
      )}

      {/* YouTube Description Standardizer Section */}
      {selectedItems.length > 0 && (
        <div className="section">
          <h3>📝 YouTube Description Standardizer</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
              Standardize YouTube video descriptions with consistent formatting and links.
            </p>
            
            <div style={{ 
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#333'
            }}>
              <strong>📋 What this does:</strong><br/>
              • Standardizes download links to: <code>"| download @ https://archive.org/details/..."</code><br/>
              • Fixes bandcamp URLs from <code>http://</code> to <code>https://</code><br/>
              • Only updates descriptions with existing download/bandcamp patterns<br/>
              • Preserves original content, just standardizes the ending format<br/>
              • Skips very long descriptions (500+ chars) to avoid overwriting custom content
            </div>

            {youtubeAuthStatus.authenticated ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
                <input
                  type="text"
                  value={bandcampUrl}
                  onChange={(e) => setBandcampUrl(e.target.value)}
                  placeholder="Band's Bandcamp URL (optional)"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontSize: '14px'
                  }}
                />
                
                <button
                  onClick={handlePreviewDescriptions}
                  disabled={loading}
                  className="button secondary"
                  style={{ opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? 'Analyzing...' : `Preview Changes for ${selectedItems.length} Videos`}
                </button>
              </div>
            ) : (
              <div style={{ 
                marginBottom: '15px',
                padding: '15px',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                border: '1px solid #ffeaa7',
                textAlign: 'center'
              }}>
                <p style={{ margin: '0 0 10px 0', color: '#856404' }}>
                  ❌ <strong>YouTube authentication required</strong>
                </p>
                <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#856404' }}>
                  Connect to YouTube to standardize video descriptions
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/auth/youtube'
                  }}
                  className="button secondary"
                >
                  🔗 Connect to YouTube
                </button>
              </div>
            )}

            {showDescriptionPreview && descriptionPreviews.length > 0 && (
              <div style={{ 
                marginBottom: '15px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #ddd',
                color: '#333'
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: 0 }}>
                    📋 Description Preview ({descriptionPreviews.filter(p => p.needsUpdate).length} need updates)
                  </h4>
                  <button
                    onClick={handleApplyDescriptionUpdates}
                    disabled={loading || descriptionPreviews.filter(p => p.needsUpdate).length === 0}
                    className="button primary"
                    style={{ 
                      opacity: (loading || descriptionPreviews.filter(p => p.needsUpdate).length === 0) ? 0.6 : 1 
                    }}
                  >
                    {loading ? 'Updating...' : `Apply ${descriptionPreviews.filter(p => p.needsUpdate).length} Updates`}
                  </button>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {descriptionPreviews.map((preview, _index) => (
                    <div key={preview.videoId} style={{
                      marginBottom: '15px',
                      padding: '10px',
                      backgroundColor: preview.needsUpdate ? '#fff3cd' : '#d4edda',
                      borderRadius: '6px',
                      border: `1px solid ${preview.needsUpdate ? '#ffeaa7' : '#c3e6cb'}`
                    }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: 'bold', 
                        marginBottom: '8px',
                        color: preview.needsUpdate ? '#856404' : '#155724'
                      }}>
                        {preview.needsUpdate ? '⚠️ WILL UPDATE' : '✅ NO CHANGE NEEDED'}: {preview.archiveId}
                      </div>
                      
                      {preview.needsUpdate && (
                        <>
                          <div style={{ fontSize: '11px', marginBottom: '5px' }}>
                            <strong>Current:</strong>
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            fontFamily: 'monospace',
                            backgroundColor: '#fff',
                            padding: '8px',
                            borderRadius: '4px',
                            marginBottom: '8px',
                            maxHeight: '60px',
                            overflow: 'auto'
                          }}>
                            {preview.currentDescription || '(empty)'}
                          </div>
                          
                          <div style={{ fontSize: '11px', marginBottom: '5px' }}>
                            <strong>New:</strong>
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            fontFamily: 'monospace',
                            backgroundColor: '#fff',
                            padding: '8px',
                            borderRadius: '4px',
                            maxHeight: '60px',
                            overflow: 'auto'
                          }}>
                            {preview.newDescription}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: '12px', opacity: 0.7, color: '#666' }}>
              <strong>Safe to use:</strong> Only updates descriptions with download/bandcamp patterns<br/>
              <strong>Preserves content:</strong> Keeps original text, standardizes ending format<br/>
              <strong>Rate limited:</strong> 2-second delays between updates to respect API limits
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '15px', fontSize: '14px', opacity: 0.8 }}>
        <strong>How it works:</strong>
        <ul style={{ textAlign: 'left', marginTop: '5px' }}>
          <li><strong>Replace existing values:</strong> Any value you enter will completely replace the existing metadata for that field</li>
          <li><strong>Example:</strong> If "venue" is currently "Old Venue Name", entering "New Venue Name" will replace it entirely</li>
          <li><strong>Empty fields:</strong> If a field doesn't exist yet, your value will be added as new metadata</li>
        </ul>
      </div>
    </div>
  )
}
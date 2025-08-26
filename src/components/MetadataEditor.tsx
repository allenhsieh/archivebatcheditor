import React, { useState } from 'react'
import { MetadataUpdate, UpdateRequest, ArchiveItem, YouTubeSuggestionResponse } from '../types'

interface MetadataEditorProps {
  selectedItems: string[]
  items: ArchiveItem[]
  onUpdate: (updateData: UpdateRequest) => void
  loading: boolean
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
  loading
}) => {
  const [updates, setUpdates] = useState<MetadataUpdate[]>([
    { field: 'city', value: '', operation: 'replace' }
  ])
  const [youtubeSuggestions, setYoutubeSuggestions] = useState<Record<string, YouTubeSuggestionResponse>>({})
  const [loadingYoutube, setLoadingYoutube] = useState<Record<string, boolean>>({})
  const [selectedFields, setSelectedFields] = useState<Record<string, Record<string, boolean>>>({})

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
          identifier,
          title: item.title,
          date: item.date
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data: YouTubeSuggestionResponse = await response.json()
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
    const suggestion = youtubeSuggestions[identifier]
    if (!suggestion?.suggestions) return

    const newUpdates = [...updates]
    
    // Add YouTube URL if selected and found
    if (selectedFields.youtube && suggestion.suggestions.youtube) {
      newUpdates.push({
        field: 'youtube',
        value: suggestion.suggestions.youtube,
        operation: 'replace'
      })
    }
    
    // Add band if selected and found
    if (selectedFields.band && suggestion.suggestions.band) {
      newUpdates.push({
        field: 'band',
        value: suggestion.suggestions.band,
        operation: 'replace'
      })
    }
    
    // Add venue if selected and found  
    if (selectedFields.venue && suggestion.suggestions.venue) {
      newUpdates.push({
        field: 'venue',
        value: suggestion.suggestions.venue,
        operation: 'replace'
      })
    }
    
    // Add date if selected and found
    if (selectedFields.date && suggestion.suggestions.date) {
      newUpdates.push({
        field: 'date',
        value: suggestion.suggestions.date,
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

  if (selectedItems.length === 0) {
    return (
      <div className="section">
        <h3>Metadata Editor</h3>
        <p style={{ opacity: 0.7 }}>Select items above to edit their metadata</p>
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
                  
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => getYoutubeSuggestion(identifier)}
                    disabled={isLoading}
                    style={{ marginBottom: '10px', width: '100%' }}
                  >
                    {isLoading ? 'Searching...' : 'Get YouTube Match'}
                  </button>
                  
                  {suggestion && (
                    <div style={{ fontSize: '13px' }}>
                      {suggestion.success && suggestion.suggestions ? (
                        <div>
                          <div style={{ color: '#4CAF50', marginBottom: '8px' }}>✓ Match found!</div>
                          
                          <div style={{ marginBottom: '10px', fontSize: '12px', opacity: 0.8 }}>
                            Select fields to apply:
                          </div>
                          
                          {suggestion.suggestions.youtube && (
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
                                <a 
                                  href={suggestion.suggestions.youtube} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ 
                                    color: '#007bff', 
                                    textDecoration: 'none',
                                    fontSize: '12px',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  {suggestion.suggestions.youtube} 🔗
                                </a>
                              </div>
                            </div>
                          )}
                          
                          {suggestion.suggestions.band && (
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
                              <div>
                                <strong>Band:</strong> {suggestion.suggestions.band}
                              </div>
                            </div>
                          )}
                          
                          {suggestion.suggestions.venue && (
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
                              <div>
                                <strong>Venue:</strong> {suggestion.suggestions.venue}
                              </div>
                            </div>
                          )}
                          
                          {suggestion.suggestions.date && (
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
                              <div>
                                <strong>Date:</strong> {suggestion.suggestions.date}
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
          
          <div style={{ marginTop: '20px', textAlign: 'center', display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                // Add delays between requests to avoid rate limiting
                for (let i = 0; i < selectedItems.length; i++) {
                  const identifier = selectedItems[i]
                  if (!youtubeSuggestions[identifier] && !loadingYoutube[identifier]) {
                    getYoutubeSuggestion(identifier)
                    // Add 1 second delay between requests to respect rate limits
                    if (i < selectedItems.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 1000))
                    }
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
                // Build YouTube-only updates
                const youtubeUpdates: any[] = []
                let addedCount = 0
                
                selectedItems.forEach(identifier => {
                  const suggestion = youtubeSuggestions[identifier]
                  if (suggestion?.success && suggestion.suggestions?.youtube) {
                    youtubeUpdates.push({
                      field: 'youtube',
                      value: suggestion.suggestions.youtube,
                      operation: 'replace'
                    })
                    addedCount++
                  }
                })
                
                if (addedCount > 0) {
                  // Immediately execute the YouTube updates
                  onUpdate({
                    items: selectedItems,
                    updates: youtubeUpdates
                  })
                } else {
                  alert('❌ No YouTube matches found. Click "Get YouTube Matches for All" first.')
                }
              }}
              style={{ padding: '10px 20px' }}
              disabled={!Object.values(youtubeSuggestions).some(s => s?.success)}
            >
              🔗 Add YouTube Links
            </button>
            
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                // Apply ALL selected metadata for items that have matches
                const newUpdates = [...updates]
                
                selectedItems.forEach(identifier => {
                  const suggestion = youtubeSuggestions[identifier]
                  if (suggestion?.success && suggestion.suggestions?.youtube) {
                    // Check if fields are selected (default to true for YouTube)
                    const fields = selectedFields[identifier] || { youtube: true }
                    
                    if (fields.youtube) {
                      newUpdates.push({
                        field: 'youtube',
                        value: suggestion.suggestions.youtube,
                        operation: 'replace'
                      })
                    }
                    
                    if (fields.band && suggestion.suggestions.band) {
                      newUpdates.push({
                        field: 'band',
                        value: suggestion.suggestions.band,
                        operation: 'replace'
                      })
                    }
                    
                    if (fields.venue && suggestion.suggestions.venue) {
                      newUpdates.push({
                        field: 'venue',
                        value: suggestion.suggestions.venue,
                        operation: 'replace'
                      })
                    }
                    
                    if (fields.date && suggestion.suggestions.date) {
                      newUpdates.push({
                        field: 'date',
                        value: suggestion.suggestions.date,
                        operation: 'replace'
                      })
                    }
                  }
                })
                
                setUpdates(newUpdates)
              }}
              style={{ padding: '10px 20px' }}
              disabled={!Object.values(youtubeSuggestions).some(s => s?.success)}
            >
              ✅ Apply All Selected Fields
            </button>
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
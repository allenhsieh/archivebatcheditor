import React, { useState, useMemo } from 'react'
import { ArchiveItem } from '../types'

// Define the possible status states for each item during processing
type ItemStatus = 'idle' | 'processing' | 'success' | 'error' | 'skipped'

interface ItemSelectorProps {
  items: ArchiveItem[]
  selectedItems: string[]
  itemStatuses: Record<string, ItemStatus>  // New prop for item processing statuses
  onToggleItem: (identifier: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
}

export const ItemSelector: React.FC<ItemSelectorProps> = ({
  items,
  selectedItems,
  itemStatuses,  // New prop
  onToggleItem,
  onSelectAll,
  onClearSelection
}) => {
  // State for UI controls
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [compactView, setCompactView] = useState(false)
  const [filterSelected, setFilterSelected] = useState<'all' | 'selected' | 'unselected'>('all')

  // Helper function to get status indicator for an item
  const getStatusIndicator = (identifier: string) => {
    const status = itemStatuses[identifier] || 'idle'
    switch (status) {
      case 'processing':
        return <span style={{ color: '#007bff', fontSize: '16px', marginLeft: '8px' }} title="Processing...">🔄</span>
      case 'success':
        return <span style={{ color: '#28a745', fontSize: '16px', marginLeft: '8px' }} title="Successfully updated">✅</span>
      case 'error':
        return <span style={{ color: '#dc3545', fontSize: '16px', marginLeft: '8px' }} title="Update failed">❌</span>
      case 'skipped':
        return <span style={{ color: '#6c757d', fontSize: '16px', marginLeft: '8px' }} title="Skipped (already up-to-date)">⏭️</span>
      default:
        return null
    }
  }

  // Filter and search logic
  const filteredItems = useMemo(() => {
    let filtered = items

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(query) ||
        item.identifier.toLowerCase().includes(query) ||
        item.creator?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )
    }

    // Apply selection filter
    if (filterSelected === 'selected') {
      filtered = filtered.filter(item => selectedItems.includes(item.identifier))
    } else if (filterSelected === 'unselected') {
      filtered = filtered.filter(item => !selectedItems.includes(item.identifier))
    }

    return filtered
  }, [items, searchQuery, filterSelected, selectedItems])

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage)

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterSelected, itemsPerPage])
  if (items.length === 0) {
    return null
  }

  // Helper functions for bulk selection
  const selectFiltered = () => {
    filteredItems.forEach(item => {
      if (!selectedItems.includes(item.identifier)) {
        onToggleItem(item.identifier)
      }
    })
  }

  const unselectFiltered = () => {
    filteredItems.forEach(item => {
      if (selectedItems.includes(item.identifier)) {
        onToggleItem(item.identifier)
      }
    })
  }

  return (
    <div className="section">
      {/* Header with stats and main controls */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Items ({items.length})</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', opacity: 0.8 }}>
              Selected: <strong>{selectedItems.length}</strong> | 
              Showing: <strong>{paginatedItems.length}</strong> of <strong>{filteredItems.length}</strong>
            </span>
            <button className="button secondary" onClick={onSelectAll}>
              Select All ({items.length})
            </button>
            <button className="button secondary" onClick={onClearSelection}>
              Clear Selection
            </button>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          alignItems: 'center', 
          padding: '15px', 
          background: 'rgba(255, 255, 255, 0.05)', 
          borderRadius: '8px',
          marginBottom: '15px',
          flexWrap: 'wrap'
        }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search items (title, ID, creator, description)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white'
              }}
            />
          </div>

          {/* Filter Selection */}
          <select 
            value={filterSelected} 
            onChange={(e) => setFilterSelected(e.target.value as any)}
            style={{
              padding: '8px 12px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white'
            }}
          >
            <option value="all">All Items</option>
            <option value="selected">Selected Only</option>
            <option value="unselected">Unselected Only</option>
          </select>

          {/* Items per page */}
          <select 
            value={itemsPerPage} 
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white'
            }}
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
            <option value={200}>200 per page</option>
          </select>

          {/* View Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={compactView}
              onChange={(e) => setCompactView(e.target.checked)}
            />
            Compact View
          </label>

          {/* Bulk actions for filtered items */}
          {filteredItems.length > 0 && (
            <div style={{ display: 'flex', gap: '5px' }}>
              <button 
                className="button secondary" 
                onClick={selectFiltered}
                style={{ padding: '6px 10px', fontSize: '12px' }}
              >
                Select Filtered ({filteredItems.length})
              </button>
              <button 
                className="button secondary" 
                onClick={unselectFiltered}
                style={{ padding: '6px 10px', fontSize: '12px' }}
              >
                Unselect Filtered
              </button>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '10px',
            marginBottom: '15px'
          }}>
            <button 
              className="button secondary" 
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              style={{ padding: '6px 12px' }}
            >
              ← Previous
            </button>
            
            <span style={{ fontSize: '14px' }}>
              Page {currentPage} of {totalPages}
            </span>
            
            <button 
              className="button secondary" 
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '6px 12px' }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Items Grid */}
      <div className={compactView ? "item-grid-compact" : "item-grid"}>
        {paginatedItems.map(item => (
          <div
            key={item.identifier}
            className={`${compactView ? 'item-card-compact' : 'item-card'} ${selectedItems.includes(item.identifier) ? 'selected' : ''}`}
            onClick={() => onToggleItem(item.identifier)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: compactView ? '8px' : '10px' }}>
              <input
                type="checkbox"
                checked={selectedItems.includes(item.identifier)}
                onChange={() => onToggleItem(item.identifier)}
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, flex: 1, fontSize: compactView ? '14px' : '16px' }}>
                    {item.title || item.identifier}
                  </h4>
                  {getStatusIndicator(item.identifier)}
                </div>
                <div style={{ fontSize: compactView ? '11px' : '12px', opacity: 0.8, marginBottom: compactView ? '4px' : '8px' }}>
                  <a 
                    href={`https://archive.org/details/${item.identifier}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#007bff', textDecoration: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.identifier}
                  </a>
                </div>
                {!compactView && (
                  <>
                    {item.creator && (
                      <div style={{ fontSize: '14px', marginBottom: '5px' }}>
                        Creator: {item.creator}
                      </div>
                    )}
                    {item.date && (
                      <div style={{ fontSize: '14px', marginBottom: '5px' }}>
                        Date: {item.date}
                      </div>
                    )}
                    {item.mediatype && (
                      <div style={{ fontSize: '14px', marginBottom: '5px' }}>
                        Type: {item.mediatype}
                      </div>
                    )}
                    {item.description && (
                      <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px' }}>
                        {item.description.length > 100 
                          ? `${item.description.substring(0, 100)}...`
                          : item.description
                        }
                      </div>
                    )}
                  </>
                )}
                {compactView && (item.creator || item.date) && (
                  <div style={{ fontSize: '12px', opacity: 0.7 }}>
                    {item.creator && `${item.creator}`}
                    {item.creator && item.date && ' • '}
                    {item.date && `${item.date}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '10px',
          marginTop: '20px'
        }}>
          <button 
            className="button secondary" 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{ padding: '6px 12px' }}
          >
            ← Previous
          </button>
          
          <span style={{ fontSize: '14px' }}>
            Page {currentPage} of {totalPages}
          </span>
          
          <button 
            className="button secondary" 
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: '6px 12px' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
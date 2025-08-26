import React from 'react'
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
  if (items.length === 0) {
    return null
  }

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>Items ({items.length})</h3>
        <div>
          <span style={{ marginRight: '15px' }}>
            Selected: {selectedItems.length}
          </span>
          <button className="button secondary" onClick={onSelectAll}>
            Select All
          </button>
          <button className="button secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        </div>
      </div>

      <div className="item-grid">
        {items.map(item => (
          <div
            key={item.identifier}
            className={`item-card ${selectedItems.includes(item.identifier) ? 'selected' : ''}`}
            onClick={() => onToggleItem(item.identifier)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <input
                type="checkbox"
                checked={selectedItems.includes(item.identifier)}
                onChange={() => onToggleItem(item.identifier)}
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, flex: 1 }}>{item.title || item.identifier}</h4>
                  {getStatusIndicator(item.identifier)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
                  ID: <a 
                    href={`https://archive.org/details/${item.identifier}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: '#007bff', textDecoration: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.identifier}
                  </a>
                </div>
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
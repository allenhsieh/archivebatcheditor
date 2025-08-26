import React from 'react'
import { ArchiveItem } from '../types'

interface ItemSelectorProps {
  items: ArchiveItem[]
  selectedItems: string[]
  onToggleItem: (identifier: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
}

export const ItemSelector: React.FC<ItemSelectorProps> = ({
  items,
  selectedItems,
  onToggleItem,
  onSelectAll,
  onClearSelection
}) => {
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
                <h4>{item.title || item.identifier}</h4>
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
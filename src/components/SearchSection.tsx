import React, { useState } from 'react'

interface SearchSectionProps {
  onSearch: (query: string) => void
  onLoadUserItems: () => void
  onRefreshUserItems: () => void
  loading: boolean
}

export const SearchSection: React.FC<SearchSectionProps> = ({
  onSearch,
  onLoadUserItems,
  onRefreshUserItems,
  loading
}) => {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <div className="section">
      <h2>Search Archive.org Items</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="search-query">Search Query</label>
          <input
            id="search-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter search terms (e.g., collection:etree creator:myband)"
          />
        </div>
        
        <button type="submit" className="button" disabled={loading}>
          {loading ? <span className="loading" /> : 'Search'}
        </button>
        
        <button 
          type="button" 
          className="button secondary" 
          onClick={onLoadUserItems}
          disabled={loading}
        >
          Load My Items
        </button>
        
        <button 
          type="button" 
          className="button secondary" 
          onClick={onRefreshUserItems}
          disabled={loading}
          title="Refresh items from Archive.org (fetches fresh data)"
        >
          🔄 Refresh
        </button>
      </form>
      
      <div style={{ marginTop: '10px', fontSize: '14px', opacity: 0.8 }}>
        <strong>Search tips:</strong>
        <ul style={{ textAlign: 'left', marginTop: '5px' }}>
          <li><code>collection:etree</code> - Items in etree collection</li>
          <li><code>creator:"Band Name"</code> - Items by specific creator</li>
          <li><code>date:2023</code> - Items from specific year</li>
          <li><code>mediatype:audio</code> - Audio items only</li>
        </ul>
      </div>
    </div>
  )
}
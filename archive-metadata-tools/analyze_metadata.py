#!/usr/bin/env python3
"""
Archive.org Metadata Analyzer - The Original Data Discovery Script

This is the ORIGINAL ANALYSIS SCRIPT that discovers all metadata issues in your
Archive.org collection and generates the metadata_issues.json file.

This script:
1. Fetches all items from your Archive.org account using the search API
2. Analyzes each item for missing or incorrect metadata (band, venue, date)
3. Parses band names, venues, and dates from item titles using regex patterns
4. Creates suggestions for fixing the metadata based on title parsing
5. Generates a comprehensive metadata_issues.json file with all findings

For beginners:
- This is like a "metadata detective" that finds all the problems in your collection
- It creates the "todo list" (metadata_issues.json) that other scripts use
- You run this script FIRST to analyze your entire Archive.org collection
- The output file is then used by apply_metadata_fixes.py to make actual changes
- It's designed to be run periodically to find new issues as you add more items

Note: This script was created first and generates the data that all other
scripts in this folder depend on. It's the foundation of the metadata management system.

Usage: python3 analyze_metadata.py
Output: Creates metadata_issues.json with all suggested fixes
"""

import requests
import json
import re
import time
from datetime import datetime
from urllib.parse import quote
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class MetadataAnalyzer:
    def __init__(self):
        self.access_key = os.getenv('ARCHIVE_ACCESS_KEY')
        self.secret_key = os.getenv('ARCHIVE_SECRET_KEY') 
        self.email = os.getenv('ARCHIVE_EMAIL')
        self.items = []
        self.issues = []
        
    def fetch_all_items(self):
        """Fetch all items from Archive.org"""
        print("🔍 Fetching all Archive.org items...")
        
        # Build search query for user's items
        query = f'uploader:{self.email}'
        encoded_query = quote(query)
        
        fields = [
            'identifier', 'title', 'creator', 'description', 'date', 
            'publicdate', 'mediatype', 'collection', 'subject', 'venue', 'band'
        ]
        
        url = f'https://archive.org/advancedsearch.php?q={encoded_query}&fl={",".join(fields)}&rows=1000&output=json&sort=addeddate+desc'
        
        # Use authentication for uploader field access
        auth = (self.access_key, self.secret_key)
        response = requests.get(url, auth=auth)
        
        if response.status_code == 200:
            data = response.json()
            self.items = data['response']['docs']
            print(f"✅ Found {len(self.items)} items")
            return True
        else:
            print(f"❌ Failed to fetch items: {response.status_code}")
            return False
    
    def extract_band_from_title(self, title):
        """Extract band name from title - your titles follow specific patterns"""
        if not title:
            return None
        
        # Your titles follow these specific patterns:
        # "Band Name @ Venue on Date", "Band Name on Date", or "Band Name in DATE at VENUE"
        patterns = [
            r'^([^@]+?)\s*@',                    # "Band Name @ Venue" (most common)
            r'^(.+?)\s+on\s+\d',                 # "Band Name on DATE" (when no venue)
            r'^(.+?)\s+in\s+\d',                 # "Band Name in DATE at VENUE" (alternative format)
        ]
        
        for pattern in patterns:
            match = re.search(pattern, title)
            if match and match.group(1):
                band_name = match.group(1).strip()
                # Filter out common non-band patterns and ensure minimum length
                if len(band_name) > 2 and not band_name.lower() in ['live', 'show', 'concert', 'performance']:
                    return band_name
        
        return None
    
    def extract_venue_from_title(self, title):
        """Extract venue from title using your exact patterns from server/utils.ts"""
        if not title:
            return None
        
        # Look for venue patterns (from your utils.ts)
        # Updated to stop at common date/time separators like "on" and event info like "["
        # Order matters: @ pattern should come first, then more specific patterns
        # Fixed: stop at first opening parenthesis to avoid capturing event details
        venue_patterns = [
            r'@\s+([^(]+?)\s*\(',                               # "@ Venue (event details)" - stop at first (
            r'@\s+(.+?)(?:\s+on\s|\s+\[|\s+\d{4}|$)',           # "@ Venue on..." or "@ Venue" (fallback)
            r'\bat\s+([^(]+?)\s*\(',                            # "at Venue (event details)" - stop at first (
            r'\bat\s+(.+?)(?:\s+on\s|\s+\[|\s+\d{4}|$)',        # "at Venue Name on..." (fallback)
            r'live\s+at\s+([^(]+?)\s*\(',                       # "Live at Venue (event details)" - stop at first (
            r'live\s+at\s+(.+?)(?:\s+on\s|\s+\[|\s+\d{4}|$)'    # "Live at Venue on..." (fallback)
        ]
        
        for pattern in venue_patterns:
            match = re.search(pattern, title, re.I)
            if match and match.group(1):
                venue = match.group(1).strip()
                # Remove parentheses and everything inside them (e.g., city/state info)
                venue = re.sub(r'\s*\([^)]*\)', '', venue).strip()
                if len(venue) > 2:
                    return venue
        
        return None
    
    def extract_date_from_title(self, title):
        """Extract date from title using common patterns"""
        if not title:
            return None
        
        # Order matters: more specific patterns first
        patterns = [
            (r'(\d{4}-\d{2}-\d{2})', '%Y-%m-%d'),                    # YYYY-MM-DD
            (r'(\d{1,2}/\d{1,2}/\d{4})', '%m/%d/%Y'),                # MM/DD/YYYY (4-digit year)
            (r'(\d{1,2}\.\d{1,2}\.\d{4})', '%m.%d.%Y'),              # MM.DD.YYYY (4-digit year)
            (r'(\d{1,2}/\d{1,2}/\d{2})', '%m/%d/%y'),                # MM/DD/YY (2-digit year)
            (r'(\d{1,2}\.\d{1,2}\.\d{2})', '%m.%d.%y'),              # MM.DD.YY (2-digit year)
            (r'(\d{4})', '%Y'),                                      # Just year
        ]
        
        for pattern, date_format in patterns:
            match = re.search(pattern, title)
            if match:
                date_str = match.group(1)
                try:
                    if date_format == '%Y':
                        return f'{date_str}-01-01'  # Default to Jan 1 for year-only
                    elif date_format.endswith('%y'):  # 2-digit year formats
                        parsed = datetime.strptime(date_str, date_format)
                        # Python's %y already handles 2-digit year conversion (00-68 -> 2000-2068, 69-99 -> 1969-1999)
                        return f'{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}'
                    else:  # 4-digit year formats
                        parsed = datetime.strptime(date_str, date_format)
                        return f'{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}'
                except ValueError:
                    continue
        
        return None
    
    def standardize_date(self, date_str):
        """Standardize date format using your exact logic from server/utils.ts"""
        if not date_str:
            return date_str
        
        # Handle MM/DD/YY format (e.g., "03/12/14" -> "2014-03-12")
        mmddyy_match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2})$', date_str)
        if mmddyy_match:
            month, day, year = mmddyy_match.groups()
            full_year = f"20{year}"  # Assuming 21st century
            return f"{full_year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # Handle MM/DD/YYYY format (e.g., "03/12/2014" -> "2014-03-12")
        mmddyyyy_match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', date_str)
        if mmddyyyy_match:
            month, day, year = mmddyyyy_match.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # Handle DD.MM.YY format (e.g., "12.03.14" -> "2014-03-12")
        ddmmyy_match = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{2})$', date_str)
        if ddmmyy_match:
            day, month, year = ddmmyy_match.groups()
            full_year = f"20{year}"  # Assuming 21st century
            return f"{full_year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # Handle DD.MM.YYYY format (e.g., "12.03.2014" -> "2014-03-12")
        ddmmyyyy_match = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', date_str)
        if ddmmyyyy_match:
            day, month, year = ddmmyyyy_match.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # Handle ISO date format (e.g., "2016-02-28T00:00:00Z" -> "2016-02-28")
        iso_date_match = re.match(r'^(\d{4}-\d{2}-\d{2})T', date_str)
        if iso_date_match:
            return iso_date_match.group(1)
        
        # Handle YYYY-MM-DD format (already correct)
        yyyymmdd_match = re.match(r'^\d{4}-\d{2}-\d{2}$', date_str)
        if yyyymmdd_match:
            return date_str
        
        # Handle YYYY format (add 01-01)
        yyyy_match = re.match(r'^\d{4}$', date_str)
        if yyyy_match:
            return f"{date_str}-01-01"
        
        print(f"Unrecognized date format: \"{date_str}\", returning as-is")
        return date_str
    
    def analyze_items(self):
        """Analyze all items for missing metadata"""
        print("\n🔍 Analyzing metadata gaps...")
        
        for item in self.items:
            identifier = item.get('identifier', '')
            title = item.get('title', '')
            creator = item.get('creator')
            band = item.get('band')  # Check band field instead of creator for band info
            date = item.get('date') 
            publicdate = item.get('publicdate')
            venue = item.get('venue')
            
            issues = []
            suggestions = {}
            
            # Check for missing band (write to 'band' field, not 'creator')
            band = item.get('band')  # Check if band field exists
            if not band:
                suggested_band = self.extract_band_from_title(title)
                if suggested_band:
                    issues.append('missing_band')
                    suggestions['band'] = suggested_band
            
            # Check for missing venue
            if not venue:
                suggested_venue = self.extract_venue_from_title(title)
                if suggested_venue:
                    issues.append('missing_venue')
                    suggestions['venue'] = suggested_venue
            
            # Check date issues
            date_to_check = date or publicdate
            if not date_to_check:
                # Missing date entirely
                suggested_date = self.extract_date_from_title(title)
                if suggested_date:
                    issues.append('missing_date')
                    suggestions['date'] = suggested_date
            else:
                # First, standardize the current date (remove time component)
                standardized_date = self.standardize_date(date_to_check)
                
                # Then check if title has a more precise date than current metadata
                title_date = self.extract_date_from_title(title)
                
                # If title has a precise date and current is just year (ends with -01-01), prefer title date
                if title_date and standardized_date.endswith('-01-01') and not title_date.endswith('-01-01'):
                    if standardized_date != title_date:
                        issues.append('bad_date_format')
                        suggestions['date'] = title_date
                elif standardized_date != date_to_check:
                    # Just standardize format (remove time component)
                    issues.append('bad_date_format')
                    suggestions['date'] = standardized_date
            
            # Add to issues if there are problems to fix
            # Now including all date fixes (user wants all 499 items to have proper date format)
            if issues:
                self.issues.append({
                    'identifier': identifier,
                    'title': title,
                    'current': {
                        'band': band,
                        'venue': venue,
                        'date': date_to_check
                    },
                    'issues': issues,
                    'suggestions': suggestions
                })
    
    def print_summary(self):
        """Print summary of found issues"""
        print(f"\n📊 Analysis Summary:")
        print(f"Total items analyzed: {len(self.items)}")
        print(f"Items with metadata issues: {len(self.issues)}")
        
        issue_counts = {}
        for issue_item in self.issues:
            for issue_type in issue_item['issues']:
                issue_counts[issue_type] = issue_counts.get(issue_type, 0) + 1
        
        print(f"\nIssue breakdown:")
        for issue_type, count in issue_counts.items():
            issue_name = {
                'missing_band': 'Missing band/creator',
                'missing_venue': 'Missing venue', 
                'missing_date': 'Missing date',
                'bad_date_format': 'Bad date format (has time component)'
            }.get(issue_type, issue_type)
            print(f"  {issue_name}: {count} items")
    
    def sort_issues_by_type(self):
        """Sort issues by type for easier review"""
        def get_sort_key(issue):
            issues = set(issue['issues'])
            
            # Priority order for sorting:
            # 1. Date-only fixes (just bad_date_format)
            # 2. Missing band + venue + date issues
            # 3. Missing band + date issues  
            # 4. Missing venue + date issues
            # 5. Missing band only
            # 6. Missing venue only
            # 7. Other combinations
            
            if issues == {'bad_date_format'}:
                return (1, issue['identifier'])
            elif 'missing_band' in issues and 'missing_venue' in issues:
                return (2, issue['identifier'])
            elif 'missing_band' in issues and 'bad_date_format' in issues:
                return (3, issue['identifier'])
            elif 'missing_venue' in issues and 'bad_date_format' in issues:
                return (4, issue['identifier'])
            elif issues == {'missing_band'}:
                return (5, issue['identifier'])
            elif issues == {'missing_venue'}:
                return (6, issue['identifier'])
            else:
                return (7, issue['identifier'])
        
        self.issues.sort(key=get_sort_key)

    def save_issues_report(self, filename='metadata_issues.json'):
        """Save issues report to JSON file"""
        # Sort issues before saving
        self.sort_issues_by_type()
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(self.issues, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Detailed report saved to {filename} (sorted by issue type)")
    
    def fix_metadata_issues(self):
        """Apply metadata fixes to Archive.org items after user approval"""
        if not self.issues:
            print("❌ No issues loaded. Run analyze_items() first.")
            return
        
        print(f"\n🔧 Found {len(self.issues)} items with metadata issues")
        print("This will update Archive.org metadata for these items.")
        
        # Confirm with user
        confirm = input("\nDo you want to proceed with applying these fixes? (y/N): ").strip().lower()
        if confirm not in ['y', 'yes']:
            print("❌ Cancelled by user")
            return
        
        success_count = 0
        error_count = 0
        
        for i, issue_item in enumerate(self.issues, 1):
            identifier = issue_item['identifier']
            suggestions = issue_item['suggestions']
            
            print(f"\n[{i}/{len(self.issues)}] Updating {identifier}...")
            
            try:
                # Build metadata update payload
                metadata_updates = {}
                
                if 'band' in suggestions:
                    metadata_updates['band'] = suggestions['band']
                    print(f"  ✓ Adding band: {suggestions['band']}")
                
                if 'venue' in suggestions:
                    metadata_updates['venue'] = suggestions['venue']  
                    print(f"  ✓ Adding venue: {suggestions['venue']}")
                
                if 'date' in suggestions:
                    metadata_updates['date'] = suggestions['date']
                    print(f"  ✓ Fixing date: {suggestions['date']}")
                
                # Update Archive.org metadata
                if metadata_updates:
                    success = self.update_archive_metadata(identifier, metadata_updates)
                    if success:
                        success_count += 1
                        print(f"  ✅ Successfully updated {identifier}")
                    else:
                        error_count += 1
                        print(f"  ❌ Failed to update {identifier}")
                else:
                    print(f"  ⚠️  No updates needed for {identifier}")
                    
            except Exception as e:
                error_count += 1
                print(f"  ❌ Error updating {identifier}: {e}")
            
            # Rate limiting
            time.sleep(2)  # 2 second delay between requests
        
        print(f"\n📊 Update Summary:")
        print(f"✅ Successfully updated: {success_count} items")
        print(f"❌ Failed to update: {error_count} items")
        print(f"📝 Total processed: {len(self.issues)} items")
    
    def update_archive_metadata(self, identifier, metadata_updates):
        """Update metadata for a single Archive.org item"""
        url = f'https://archive.org/metadata/{identifier}'
        
        # Use authentication
        auth = (self.access_key, self.secret_key)
        
        # Build the update payload
        payload = {
            'target': 'metadata',
            '-target': 'metadata'
        }
        
        # Add metadata fields
        for field, value in metadata_updates.items():
            payload[f'-patch-{field}'] = value
        
        try:
            response = requests.post(url, data=payload, auth=auth)
            
            if response.status_code == 200:
                result = response.json()
                return result.get('success', False)
            else:
                print(f"    HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            print(f"    Request error: {e}")
            return False
        
    def print_sample_issues(self, limit=20):
        """Print sample issues for review, grouped by category"""
        print(f"\n🔍 Sample issues (showing first {limit}, sorted by type):")
        print("=" * 80)
        
        # Group by issue type for display
        current_category = None
        shown = 0
        
        for issue in self.issues:
            if shown >= limit:
                break
                
            issues = set(issue['issues'])
            
            # Determine category
            if issues == {'bad_date_format'}:
                category = "📅 DATE FORMAT FIXES ONLY"
            elif 'missing_band' in issues and 'missing_venue' in issues:
                category = "🎵 MISSING BAND + VENUE (+ date fixes)"
            elif 'missing_band' in issues and 'bad_date_format' in issues:
                category = "🎸 MISSING BAND (+ date fixes)"
            elif 'missing_venue' in issues and 'bad_date_format' in issues:
                category = "🏢 MISSING VENUE (+ date fixes)"
            elif issues == {'missing_band'}:
                category = "🎸 MISSING BAND ONLY"
            elif issues == {'missing_venue'}:
                category = "🏢 MISSING VENUE ONLY"
            else:
                category = "🔧 OTHER COMBINATIONS"
            
            # Print category header if changed
            if current_category != category:
                current_category = category
                print(f"\n{category}")
                print("-" * 60)
            
            shown += 1
            print(f"\n{shown}. {issue['identifier']}")
            print(f"   Title: {issue['title']}")
            print(f"   Issues: {', '.join(issue['issues'])}")
            
            if issue['suggestions']:
                print("   Suggestions:")
                for field, value in issue['suggestions'].items():
                    current = issue['current'].get(field, 'None')
                    print(f"     {field}: '{current}' → '{value}'")
        
        if len(self.issues) > limit:
            print(f"\n... and {len(self.issues) - limit} more issues")

def main():
    analyzer = MetadataAnalyzer()
    
    # Fetch items
    if not analyzer.fetch_all_items():
        return
    
    # Analyze for issues
    analyzer.analyze_items()
    
    # Show results
    analyzer.print_summary()
    analyzer.save_issues_report()
    analyzer.print_sample_issues()
    
    print(f"\n💡 Next steps:")
    print(f"1. Review the sample issues above")
    print(f"2. Check metadata_issues.json for full details")
    
    # Ask if user wants to apply fixes
    apply_fixes = input("\nDo you want to apply these metadata fixes to Archive.org? (y/N): ").strip().lower()
    if apply_fixes in ['y', 'yes']:
        analyzer.fix_metadata_issues()
    else:
        print("✅ Analysis complete. You can apply fixes later by running the script again.")

if __name__ == '__main__':
    main()
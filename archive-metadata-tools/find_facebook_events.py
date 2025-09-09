#!/usr/bin/env python3
"""
Find Archive.org items with Facebook event links.

This script searches through your Archive.org items looking for Facebook event links
in descriptions and metadata fields. It's designed to help find items that might
have associated flyers that could be uploaded.

The script looks for:
- Facebook event links in description fields
- Facebook links in 'fb' or 'facebook' metadata fields
- Various Facebook URL formats (facebook.com/events/, fb.me/, m.facebook.com/events/)

For beginners:
- Archive.org is a digital library where we store music recordings
- Metadata is information ABOUT the files (like band name, date, venue, description)
- This script connects to Archive.org's API to search through your uploaded items
- JSON is a text format for storing structured data (like a Python dictionary)
- Regular expressions (regex) are patterns used to find specific text formats
"""

# Import statements - these bring in code libraries we need
import json  # For reading/writing JSON files (JavaScript Object Notation)
import re    # For regular expressions (pattern matching in text)
import time  # For adding delays between API requests (rate limiting)
import requests  # For making HTTP requests to Archive.org's API
from datetime import datetime  # For working with dates and timestamps
from dotenv import load_dotenv  # For loading .env file with secret keys
import os    # For accessing environment variables (like passwords)

# Load environment variables from .env file
# This reads our Archive.org credentials without putting them in code
load_dotenv()

class FacebookEventFinder:
    """
    A class that searches Archive.org items for Facebook event links.
    
    Think of a class like a blueprint for creating objects that can do specific tasks.
    This class knows how to:
    1. Connect to Archive.org's API
    2. Search through your uploaded items
    3. Look for Facebook links in descriptions and metadata
    4. Save results to a JSON file
    
    For beginners:
    - __init__ is a special method that runs when you create a new instance
    - self refers to the specific instance of this class
    - We store credentials and API settings as instance variables
    """
    
    def __init__(self):
        """
        Initialize the Facebook event finder with Archive.org credentials and settings.
        
        This sets up everything we need to search Archive.org:
        - Gets credentials from environment variables
        - Sets API request delays to be nice to Archive.org's servers
        - Prepares regex patterns to match Facebook URLs
        """
        # Get Archive.org credentials from environment variables
        # These should be set in your .env file
        self.access_key = os.getenv('ARCHIVE_ACCESS_KEY')
        self.secret_key = os.getenv('ARCHIVE_SECRET_KEY')
        
        if not self.access_key or not self.secret_key:
            raise ValueError("Missing Archive.org credentials. Please set ARCHIVE_ACCESS_KEY and ARCHIVE_SECRET_KEY in your .env file")
        
        # API settings - be nice to Archive.org's servers
        self.api_delay = 1.0  # Wait 1 second between requests
        self.max_items_per_request = 1000  # How many items to fetch at once
        
        # Regular expression patterns to match Facebook event URLs
        # These patterns will find various formats of Facebook event links
        self.facebook_patterns = [
            # Standard Facebook event URLs
            r'https?://(?:www\.)?facebook\.com/events/(\d+)',
            r'https?://(?:www\.)?facebook\.com/events/(\d+)/?\?.*',
            
            # Mobile Facebook URLs  
            r'https?://(?:m\.)?facebook\.com/events/(\d+)',
            r'https?://(?:m\.)?facebook\.com/events/(\d+)/?\?.*',
            
            # Shortened Facebook URLs
            r'https?://fb\.me/e/(\w+)',
            
            # Facebook URLs with additional paths
            r'https?://(?:www\.)?facebook\.com/events/(\d+)/permalink/(\d+)',
            
            # General facebook.com/events/ pattern (catches variations)
            r'https?://[^/]*facebook\.com/[^/]*/events/[^/\s<>"\']+',
        ]
        
        # Compile regex patterns for better performance
        # Compiling once is faster than compiling on every search
        self.compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in self.facebook_patterns]
        
    def get_user_items(self, username=None):
        """
        Get all items uploaded by the user from Archive.org.
        
        Args:
            username: Archive.org username (if None, tries to get from credentials)
            
        Returns:
            list: List of item identifiers belonging to the user
            
        For beginners:
        - This method queries Archive.org's search API
        - It finds all items uploaded by your account
        - The API returns data in JSON format which we convert to Python objects
        - We use pagination to get all results (Archive.org limits results per request)
        """
        if not username:
            # If no username provided, try to extract from access key
            # Archive.org access keys often contain the username
            username = self.access_key.split('@')[0] if '@' in self.access_key else None
            if not username:
                raise ValueError("Could not determine username from credentials. Please provide username parameter.")
        
        print(f"🔍 Searching for items uploaded by user: {username}")
        
        all_items = []
        start = 0
        
        # Keep requesting items until we get all of them
        # Archive.org uses pagination - we get chunks of results at a time
        while True:
            # Build the search URL for Archive.org's API
            # This searches for all items where uploader matches the username
            search_url = f"https://archive.org/advancedsearch.php"
            params = {
                'q': f'uploader:{username}',  # Search for items uploaded by this user
                'output': 'json',             # We want JSON format results
                'rows': self.max_items_per_request,  # How many results per request
                'start': start,               # Offset for pagination
                'fl': 'identifier,title,description,date,venue,band,fb,facebook'  # Fields to return
            }
            
            try:
                print(f"  📡 Requesting items {start}-{start + self.max_items_per_request}...")
                
                # Make the HTTP request to Archive.org
                response = requests.get(search_url, params=params, timeout=30)
                response.raise_for_status()  # Raise an exception if request failed
                
                data = response.json()  # Convert JSON response to Python objects
                items = data.get('response', {}).get('docs', [])
                
                if not items:
                    break  # No more items found, we're done
                
                all_items.extend(items)  # Add these items to our collection
                print(f"    ✅ Found {len(items)} items (total so far: {len(all_items)})")
                
                # If we got fewer items than requested, we've reached the end
                if len(items) < self.max_items_per_request:
                    break
                
                start += self.max_items_per_request  # Move to next page
                time.sleep(self.api_delay)  # Be nice to Archive.org's servers
                
            except requests.RequestException as e:
                print(f"    ❌ Error fetching items: {e}")
                break
        
        print(f"📊 Total items found: {len(all_items)}")
        return all_items
    
    def find_facebook_links(self, text):
        """
        Find Facebook event links in a text string using regex patterns.
        
        Args:
            text: String to search for Facebook links
            
        Returns:
            list: List of Facebook URLs found in the text
            
        For beginners:
        - This method takes any text (description, metadata value, etc.)
        - It uses regular expressions to find Facebook URL patterns
        - Regular expressions are like "find and replace" but for complex patterns
        - We search for multiple patterns to catch different URL formats
        """
        if not text or not isinstance(text, str):
            return []  # Return empty list if no text to search
        
        found_links = []
        
        # Try each compiled regex pattern against the text
        for pattern in self.compiled_patterns:
            matches = pattern.findall(text)  # Find all matches in the text
            if matches:
                # Add the full matched URLs to our results
                full_matches = pattern.finditer(text)  # Get full match objects
                for match in full_matches:
                    found_links.append(match.group(0))  # group(0) is the full matched text
        
        # Remove duplicates while preserving order
        # dict.fromkeys() is a neat trick to remove duplicates from a list
        return list(dict.fromkeys(found_links))
    
    def search_items_for_facebook_events(self, items):
        """
        Search through a list of Archive.org items for Facebook event links.
        
        Args:
            items: List of item dictionaries from Archive.org API
            
        Returns:
            list: List of items that contain Facebook event links
            
        For beginners:
        - This method examines each item's metadata
        - It looks in description fields and specific metadata fields
        - It builds a detailed report of where Facebook links were found
        - The results include the original item data plus our findings
        """
        print(f"🔍 Searching {len(items)} items for Facebook event links...")
        
        items_with_facebook = []
        
        for i, item in enumerate(items):
            if i % 100 == 0:  # Progress update every 100 items
                print(f"  📝 Processed {i}/{len(items)} items...")
            
            facebook_info = {
                'item': item,  # Include the original item data
                'facebook_links_found': [],  # List of Facebook URLs we found
                'found_in_fields': [],  # Which metadata fields contained Facebook links
                'summary': ''  # Human-readable summary of findings
            }
            
            # Search in description field
            description = item.get('description', '')
            if description:
                desc_links = self.find_facebook_links(description)
                if desc_links:
                    facebook_info['facebook_links_found'].extend(desc_links)
                    facebook_info['found_in_fields'].append('description')
            
            # Search in 'fb' metadata field  
            fb_field = item.get('fb', '')
            if fb_field:
                fb_links = self.find_facebook_links(fb_field)
                if fb_links:
                    facebook_info['facebook_links_found'].extend(fb_links)
                    facebook_info['found_in_fields'].append('fb')
            
            # Search in 'facebook' metadata field
            facebook_field = item.get('facebook', '')
            if facebook_field:
                facebook_links = self.find_facebook_links(facebook_field)
                if facebook_links:
                    facebook_info['facebook_links_found'].extend(facebook_links)
                    facebook_info['found_in_fields'].append('facebook')
            
            # Remove duplicate links while preserving order
            facebook_info['facebook_links_found'] = list(dict.fromkeys(facebook_info['facebook_links_found']))
            
            # Only include items that actually have Facebook links
            if facebook_info['facebook_links_found']:
                # Create a human-readable summary
                fields_str = ', '.join(facebook_info['found_in_fields'])
                links_count = len(facebook_info['facebook_links_found'])
                facebook_info['summary'] = f"Found {links_count} Facebook link(s) in: {fields_str}"
                
                items_with_facebook.append(facebook_info)
                print(f"    🎯 {item.get('identifier', 'Unknown')}: {facebook_info['summary']}")
        
        print(f"✅ Search complete! Found {len(items_with_facebook)} items with Facebook event links")
        return items_with_facebook
    
    def save_results_to_json(self, results, filename='facebook_events_found.json'):
        """
        Save the search results to a pretty-printed JSON file.
        
        Args:
            results: List of items with Facebook links found
            filename: Name of the output file
            
        For beginners:
        - This method saves our results to a JSON file for review
        - JSON is a text format that's easy for humans to read
        - indent=2 makes the JSON "pretty-printed" with nice formatting  
        - We include metadata about when the search was run
        """
        output_data = {
            'search_metadata': {
                'total_items_found': len(results),
                'search_timestamp': datetime.now().isoformat(),
                'search_description': 'Archive.org items containing Facebook event links'
            },
            'items_with_facebook_events': results
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            # indent=2 makes the JSON file readable with nice formatting
            # ensure_ascii=False allows Unicode characters (for international text)
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Results saved to: {filename}")
        print(f"📄 File contains {len(results)} items with Facebook event links")
    
    def run_search(self, username=None, output_filename='facebook_events_found.json'):
        """
        Run the complete Facebook event search process.
        
        Args:
            username: Archive.org username (optional)
            output_filename: Name for the output JSON file
            
        This is the main method that orchestrates the entire search:
        1. Gets all user's items from Archive.org
        2. Searches each item for Facebook event links  
        3. Saves results to a JSON file for review
        
        For beginners:
        - This is the "main" method that does everything
        - It calls other methods in the right order
        - It handles errors gracefully so the program doesn't crash
        - It provides progress updates so you know what's happening
        """
        try:
            print("🚀 Starting Facebook event link search...")
            print(f"📊 Will save results to: {output_filename}")
            print()
            
            # Step 1: Get all user's items from Archive.org
            items = self.get_user_items(username)
            
            if not items:
                print("⚠️  No items found for this user")
                return
            
            print()
            
            # Step 2: Search items for Facebook event links
            results = self.search_items_for_facebook_events(items)
            
            print()
            
            # Step 3: Save results to JSON file
            self.save_results_to_json(results, output_filename)
            
            print()
            print("✅ Facebook event search completed successfully!")
            print(f"🎯 Found Facebook event links in {len(results)} out of {len(items)} total items")
            
            if results:
                print(f"📖 Review the results in: {output_filename}")
                print("💡 Items with Facebook events might have associated flyers you can upload!")
            else:
                print("😔 No Facebook event links found in your Archive.org items")
            
        except Exception as e:
            print(f"❌ Error during search: {e}")
            import traceback
            traceback.print_exc()  # Print full error details for debugging

def main():
    """
    Main function that runs when the script is executed.
    
    This function:
    1. Creates a FacebookEventFinder object
    2. Runs the search process
    3. Handles any errors that occur
    
    For beginners:
    - Functions are reusable blocks of code that do specific tasks
    - main() is a common pattern - it's the "entry point" of the program
    - You can modify the parameters below to customize the search
    """
    try:
        # Create an instance of our FacebookEventFinder class
        finder = FacebookEventFinder()
        
        # Run the search
        # You can customize these parameters:
        # - username: your Archive.org username (will try to auto-detect if not provided)
        # - output_filename: name of the JSON file to create
        finder.run_search(
            username='allenpunkarchives@gmail.com',  # Your Archive.org username
            output_filename='facebook_events_found.json'
        )
        
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        print("💡 Make sure your .env file has ARCHIVE_ACCESS_KEY and ARCHIVE_SECRET_KEY set")

# This is a Python idiom - only run main() if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    main()
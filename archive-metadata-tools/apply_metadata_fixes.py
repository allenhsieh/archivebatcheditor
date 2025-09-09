#!/usr/bin/env python3
"""
Apply metadata fixes from metadata_issues.json to Archive.org using internetarchive library

This is the MAIN SCRIPT that applies all metadata changes to Archive.org items.
It reads the metadata_issues.json file and updates each item with:
- Missing band names
- Missing venue names  
- Corrected date formats (YYYY-MM-DD)

For beginners:
- Archive.org is a digital library where we store music recordings
- Metadata is information ABOUT the files (like band name, date, venue)
- This script connects to Archive.org's API to update that information
- JSON is a text format for storing structured data (like a Python dictionary)
"""

# Import statements - these bring in code libraries we need
import json  # For reading/writing JSON files (JavaScript Object Notation)
import time  # For adding delays between API requests (rate limiting)
import os   # For accessing environment variables (like passwords)
from dotenv import load_dotenv  # For loading .env file with secret keys
import internetarchive as ia    # The official Archive.org Python library

# Load environment variables from .env file
# This reads our Archive.org credentials without putting them in code
load_dotenv()

class MetadataFixerIA:
    """
    A class that handles updating metadata on Archive.org items.
    
    Think of a class like a blueprint for creating objects that can do specific tasks.
    This class knows how to:
    1. Connect to Archive.org 
    2. Update metadata for multiple items
    3. Handle errors gracefully
    
    For beginners:
    - __init__ is a special method that runs when you create a new instance
    - self refers to the specific instance of this class
    - session stores our connection to Archive.org
    """
    def __init__(self):
        """
        Initialize the metadata fixer by creating an Archive.org session.
        
        A session is like logging into Archive.org - it stores our credentials
        and lets us make authenticated requests to update metadata.
        """
        # Create a connection to Archive.org using our credentials
        self.session = ia.get_session()
        
    def apply_all_fixes(self, issues):
        """
        Apply metadata fixes to Archive.org items using internetarchive library.
        
        Args:
            issues: A list of dictionaries, each containing:
                   - 'identifier': The Archive.org item ID (like '01.20.12_Thou')
                   - 'suggestions': Dictionary with 'band', 'venue', 'date' fields to update
        
        For beginners:
        - This method loops through each item that needs fixing
        - It calls update_archive_metadata_ia() for each item
        - It keeps track of successes and failures
        - flush=True makes sure text appears immediately (not buffered)
        """
        print(f"🔧 Applying metadata fixes to {len(issues)} items...", flush=True)
        print("This will update Archive.org metadata with band, venue, and date information.", flush=True)
        print("✅ Auto-proceeding as requested...", flush=True)
        print()  # Empty line for better readability
        
        # Keep track of how many items we successfully update vs. fail
        success_count = 0
        error_count = 0
        
        # Loop through each item that needs metadata fixes
        # enumerate(issues, 1) gives us both the item AND a counter starting at 1
        for i, issue_item in enumerate(issues, 1):
            # Extract the Archive.org identifier (like "01.20.12_Thou")
            identifier = issue_item['identifier']
            # Extract the suggested changes (band, venue, date)
            suggestions = issue_item['suggestions']
            
            print(f"[{i}/{len(issues)}] Updating {identifier}...", flush=True)
            
            try:  # try/except handles errors gracefully without crashing
                # Build a dictionary of metadata fields we want to update
                # Start with empty dict, add fields only if they exist in suggestions
                metadata_updates = {}
                
                # Check if we have a band name to add/fix
                if 'band' in suggestions:
                    metadata_updates['band'] = suggestions['band']
                    print(f"  ✓ Adding band: {suggestions['band']}")
                
                # Check if we have a venue name to add/fix
                if 'venue' in suggestions:
                    metadata_updates['venue'] = suggestions['venue']  
                    print(f"  ✓ Adding venue: {suggestions['venue']}")
                
                # Check if we have a date to fix (should always be in YYYY-MM-DD format)
                if 'date' in suggestions:
                    metadata_updates['date'] = suggestions['date']
                    print(f"  ✓ Fixing date: {suggestions['date']}")
                
                # Only try to update if we actually have changes to make
                if metadata_updates:
                    # Call our method that does the actual Archive.org API update
                    success = self.update_archive_metadata_ia(identifier, metadata_updates)
                    if success:
                        success_count += 1  # Increment our success counter
                        print(f"  ✅ Successfully updated {identifier}")
                    else:
                        error_count += 1    # Increment our error counter
                        print(f"  ❌ Failed to update {identifier}")
                else:
                    print(f"  ⚠️  No updates needed for {identifier}")
                    
            except Exception as e:
                # If anything goes wrong, catch the error and keep going
                error_count += 1
                print(f"  ❌ Error updating {identifier}: {e}")
            
            # Rate limiting - be nice to Archive.org's servers
            # Wait 1 second between requests so we don't overwhelm their API
            time.sleep(1)
        
        # Print a final summary of what happened
        print(f"\n📊 Update Summary:")
        print(f"✅ Successfully updated: {success_count} items")
        print(f"❌ Failed to update: {error_count} items")
        print(f"📝 Total processed: {len(issues)} items")
        
    def update_archive_metadata_ia(self, identifier, metadata_updates):
        """
        Update metadata for a single Archive.org item using internetarchive library.
        
        This method does the actual work of updating one item's metadata.
        It's smart about only updating fields that actually need changing.
        
        Args:
            identifier: Archive.org item ID (like "01.20.12_Thou")
            metadata_updates: Dictionary of fields to update (like {'band': 'Thou', 'date': '2012-01-20'})
            
        Returns:
            bool: True if update succeeded, False if it failed
            
        For beginners:
        - This method first gets the current metadata from Archive.org
        - It compares what we want to change with what's already there
        - It only sends updates for fields that are actually different
        - This prevents unnecessary API calls and reduces errors
        """
        try:
            # Get the Archive.org item object - this contains all current metadata
            item = ia.get_item(identifier)
            
            # Filter out fields that already have the correct value
            # This prevents unnecessary updates and reduces API calls
            filtered_updates = {}
            
            # Loop through each field we want to update
            for field, new_value in metadata_updates.items():
                # Get the current value from Archive.org (or None if field doesn't exist)
                current_value = item.metadata.get(field)
                
                # Only update if the values are different
                if current_value != new_value:
                    filtered_updates[field] = new_value
                    print(f"    📝 Updating {field}: '{current_value}' → '{new_value}'")
                else:
                    # Field already has the correct value, skip it
                    print(f"    ⚪ Skipping {field}: already correct ({current_value})")
            
            # If no fields need updating, we're done!
            if not filtered_updates:
                print(f"    ✅ No updates needed - all fields already correct")
                return True
            
            # Apply metadata updates using the internetarchive library
            # modify_metadata() sends the changes to Archive.org
            result = item.modify_metadata(filtered_updates)
            
            # Check if the update was successful
            if result:
                # Print confirmation for each field that was updated
                for field, value in filtered_updates.items():
                    print(f"    ✅ Updated {field}: {value}")
                return True  # Success!
            else:
                print(f"    ❌ Failed to update metadata")
                return False  # Something went wrong
                
        except Exception as e:
            # If any error occurs during the update process, catch it and report
            print(f"    ❌ Error updating metadata: {e}")
            return False  # Return False to indicate failure

def main():
    """
    Main function that runs when the script is executed.
    
    This function:
    1. Loads the metadata issues from the JSON file
    2. Creates a MetadataFixerIA object
    3. Applies all the fixes
    
    For beginners:
    - Functions are reusable blocks of code that do specific tasks
    - main() is a common pattern - it's the "entry point" of the program
    - with open() is a safe way to read files (automatically closes them)
    - json.load() converts JSON text into Python data structures
    """
    # Load the metadata issues from the JSON file
    # The 'with' statement automatically closes the file when done
    with open('metadata_issues.json', 'r') as f:
        issues = json.load(f)  # Convert JSON text to Python list/dict
    
    print(f"🚀 Loading {len(issues)} metadata fixes from metadata_issues.json")
    
    # Create an instance of our MetadataFixerIA class
    fixer = MetadataFixerIA()
    # Apply all the fixes to Archive.org
    fixer.apply_all_fixes(issues)

# This is a Python idiom - only run main() if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    main()
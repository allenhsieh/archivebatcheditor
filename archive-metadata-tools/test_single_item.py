#!/usr/bin/env python3
"""
Test metadata fix for a single item using internetarchive library.

This is a TESTING AND DEBUGGING tool for trying metadata updates on individual items
before running the full batch process on all 499 items.

Use this script when you want to:
- Test if a metadata update works on a specific item
- Debug issues with metadata updates
- Verify that changes are applied correctly
- See detailed output about what's happening

For beginners:
- This is like a "practice run" before doing the real thing
- It's much safer to test on one item than to break 499 items
- You can modify the test data at the bottom of this file
- The output shows exactly what changes are being made
"""

# Import statements - these bring in code libraries we need
import internetarchive as ia  # The official Archive.org Python library
import os                     # For accessing environment variables
from dotenv import load_dotenv  # For loading .env file with secret keys

# Load environment variables from .env file
# This reads our Archive.org credentials without putting them in code
load_dotenv()

class MetadataFixerTest:
    """
    A class that handles testing metadata updates on individual Archive.org items.
    
    Think of a class like a blueprint for creating objects that can do specific tasks.
    This class is designed for testing and debugging - it provides detailed output
    about what's happening during metadata updates.
    
    For beginners:
    - This is essentially the same as the main MetadataFixerIA class
    - But with extra debugging output to help understand what's happening
    - __init__ is a special method that runs when you create a new instance
    - self refers to the specific instance of this class
    """
    def __init__(self):
        """
        Initialize the metadata fixer test by creating an Archive.org session.
        
        A session is like logging into Archive.org - it stores our credentials
        and lets us make authenticated requests to update metadata.
        """
        # Create a connection to Archive.org using our credentials from .env
        self.session = ia.get_session()
        
    def update_archive_metadata(self, identifier, metadata_updates):
        """
        Update metadata for a single Archive.org item using internetarchive library.
        
        This method does the actual work of updating one item's metadata.
        It provides detailed debugging output to help understand what's happening.
        
        Args:
            identifier: Archive.org item ID (like "06.14.14_DressCode")
            metadata_updates: Dictionary of fields to update (like {'date': '2014-06-14'})
            
        Returns:
            bool: True if update succeeded, False if it failed
            
        For beginners:
        - This method is almost identical to the one in apply_metadata_fixes.py
        - But it has extra print statements to show debugging information
        - This helps you understand exactly what's happening during an update
        - It's perfect for testing before running on hundreds of items
        """
        try:  # try/except handles errors gracefully
            print(f"🔧 Updating {identifier} with {len(metadata_updates)} fields...")
            
            # Get the Archive.org item object - this contains all current metadata
            item = ia.get_item(identifier)
            
            # Show all current metadata fields for debugging
            print(f"  📄 Current metadata keys: {list(item.metadata.keys())}")
            
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
            
            # Show the result from the API call (True/False or more detailed info)
            print(f"  📊 Result: {result}")
            
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
    1. Creates a MetadataFixerTest object
    2. Defines test data (item identifier and metadata changes)
    3. Runs the test update
    4. Reports the results
    
    For beginners:
    - This is where you can modify the test data
    - Change the identifier to test different Archive.org items
    - Change the metadata_updates to test different field updates
    - The script will show detailed output about what happens
    """
    # Create an instance of our test class
    fixer = MetadataFixerTest()
    
    # Test data - modify these values to test different scenarios
    # CHANGE THESE VALUES to test different items and updates
    identifier = "06.14.14_DressCode"  # Archive.org item to test on
    metadata_updates = {
        "date": "2014-06-14"  # Field to update and its new value
        # You can add more fields here, like:
        # "band": "Dress Code",
        # "venue": "The Che Cafe"
    }
    
    print(f"Testing metadata update for {identifier}")
    print(f"Updates to apply: {metadata_updates}")
    print()
    
    # Run the test update
    result = fixer.update_archive_metadata(identifier, metadata_updates)
    
    # Show the final result
    print(f"\n🎯 Overall result: {'SUCCESS' if result else 'FAILED'}")

# This is a Python idiom - only run main() if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""
Delete bad flyer filenames with timestamp suffixes from Archive.org items.

This script removes files like '2016-02-27T00:00:00Z-flyer_itemimage.jpg'
while keeping the clean versions like '2016-02-27-flyer_itemimage.jpg'.

The problem:
- Archive.org sometimes creates duplicate flyer files with timestamp suffixes
- These bad files have 'T00:00:00Z' in their names (ISO 8601 timestamp format)
- We want to keep only the clean versions without timestamps
- This clutters the archive and confuses users

For beginners:
- Archive.org is a digital library where we store music recordings
- Files are stored in 'items' (like folders) with unique identifiers
- This script uses the Archive.org command-line interface (CLI) to delete files
- subprocess lets Python run command-line programs
"""

# Import statements - these bring in code libraries we need
import requests  # For making HTTP requests to Archive.org API
import time      # For adding delays between API requests (rate limiting)
import os        # For accessing environment variables (like passwords)
from dotenv import load_dotenv        # For loading .env file with secret keys
from internetarchive import delete, configure  # Archive.org Python library

# Load environment variables from .env file
# This reads our Archive.org credentials without putting them in code
load_dotenv()

class FlyerCleaner:
    """
    A class that handles deleting bad flyer files from specific Archive.org items.
    
    Think of a class like a blueprint for creating objects that can do specific tasks.
    This class knows how to:
    1. Load Archive.org credentials from environment variables
    2. Find files with bad timestamp suffixes in Archive.org items
    3. Delete those files using the internetarchive CLI
    4. Keep track of which items were processed successfully
    
    For beginners:
    - __init__ is a special method that runs when you create a new instance
    - self refers to the specific instance of this class
    - Environment variables are a secure way to store passwords and API keys
    - os.getenv() reads environment variables from the system
    """
    def __init__(self):
        """
        Initialize the flyer cleaner by loading Archive.org credentials.
        
        This method:
        1. Loads credentials from environment variables (.env file)
        2. Sets up the internetarchive library to use these credentials
        
        For beginners:
        - These credentials allow us to authenticate with Archive.org
        - Without proper credentials, we can't delete files
        - Environment variables keep secrets out of the code
        """
        # Load Archive.org credentials from environment variables
        self.access_key = os.getenv('ARCHIVE_ACCESS_KEY')
        self.secret_key = os.getenv('ARCHIVE_SECRET_KEY')
        self.email = os.getenv('ARCHIVE_EMAIL')
        
        # Set environment variables for internetarchive library
        # The library looks for these specific variable names
        os.environ['IA_ACCESS_KEY'] = self.access_key
        os.environ['IA_SECRET_KEY'] = self.secret_key
        
    def delete_bad_flyer_files(self, identifiers):
        """
        Delete files with timestamp suffixes from Archive.org items.
        
        Args:
            identifiers: List of Archive.org item IDs to process
            
        This is the main method that:
        1. Goes through each item in our list
        2. Gets all files in that item from Archive.org
        3. Finds files with bad timestamp suffixes
        4. Deletes those bad files using the CLI
        5. Keeps track of successes and failures
        
        For beginners:
        - This method coordinates the entire deletion process
        - It processes items one by one to avoid overwhelming Archive.org
        - It provides detailed progress reporting so you can see what's happening
        - It counts successes and failures for a final summary
        """
        print(f"🔍 Processing {len(identifiers)} items to clean up flyer files...")
        
        # Keep track of overall statistics
        success_count = 0  # Count of items successfully processed
        error_count = 0    # Count of items that had errors
        
        # Process each item in our list
        # enumerate(list, 1) gives us both the item AND a counter starting at 1
        for i, identifier in enumerate(identifiers, 1):
            print(f"\n[{i}/{len(identifiers)}] Processing {identifier}...")
            
            try:  # try/except handles errors gracefully
                # Check what files exist in the item using Archive.org's files API
                files_url = f'https://archive.org/metadata/{identifier}/files'
                # Make an HTTP GET request to get the list of files
                response = requests.get(files_url)
                
                # Check if the API request was successful (status code 200 means OK)
                if response.status_code == 200:
                    files_response = response.json()  # Convert JSON response to Python dict
                    files_data = files_response.get('result', [])  # Get the 'result' list, or empty list if missing
                    
                    # Find flyer files with bad timestamp suffixes
                    bad_flyer_files = []  # List to store filenames of bad flyer files
                    
                    # Loop through each file in the item
                    for file_info in files_data:
                        filename = file_info.get('name', '')  # Get filename, or empty string if missing
                        
                        # Look for flyer files with timestamp suffixes
                        # Check two conditions:
                        # 1. File contains '-flyer_itemimage.' (it's a flyer file)
                        # 2. File contains 'T00:00:00Z-flyer_itemimage.' (it has the bad timestamp)
                        if '-flyer_itemimage.' in filename and 'T00:00:00Z-flyer_itemimage.' in filename:
                            bad_flyer_files.append(filename)  # Add to our list of files to delete
                    
                    # If we found any bad flyer files, delete them
                    if bad_flyer_files:
                        print(f"  🗑️  Found {len(bad_flyer_files)} bad flyer files to delete:")
                        
                        # Process each bad flyer file
                        for filename in bad_flyer_files:
                            print(f"    - {filename}")
                            
                            # Delete the file using internetarchive CLI
                            try:
                                import subprocess  # For running command-line programs
                                
                                # Run the 'ia delete' command
                                # This is equivalent to typing: ia delete [identifier] [filename]
                                result = subprocess.run([
                                    '/Users/allenhsieh/Library/Python/3.9/bin/ia',  # Path to ia command
                                    'delete',      # The delete subcommand
                                    identifier,    # Archive.org item ID
                                    filename       # File to delete
                                ], capture_output=True, text=True, timeout=30)  # Capture output, 30 second timeout
                                
                                # Check if the command was successful (return code 0 means success)
                                if result.returncode == 0:
                                    print(f"    ✅ Deleted {filename}")
                                else:
                                    print(f"    ❌ Failed to delete {filename}: {result.stderr}")
                                    error_count += 1  # Count this as an error
                            except Exception as e:
                                # If anything goes wrong with the subprocess call, catch it
                                print(f"    ❌ Failed to delete {filename}: {e}")
                                error_count += 1  # Count this as an error
                    else:
                        print(f"  ✅ No bad flyer files found (already clean)")
                        
                    success_count += 1  # Count this item as successfully processed
                else:
                    print(f"  ❌ Failed to get file list: HTTP {response.status_code}")
                    error_count += 1  # Count this as an error
                    
            except Exception as e:
                # If any error occurs during processing, catch it and keep going
                print(f"  ❌ Error processing {identifier}: {e}")
                error_count += 1  # Count this as an error
            
            # Rate limiting - be nice to Archive.org's servers
            # Wait 2 seconds between requests so we don't overwhelm their API
            time.sleep(2)
        
        # Print final summary of the cleanup operation
        print(f"\n📊 Cleanup Summary:")
        print(f"✅ Successfully processed: {success_count} items")
        print(f"❌ Failed to process: {error_count} items")
        

def main():
    """
    Main function that runs when the script is executed.
    
    This function:
    1. Defines the list of Archive.org items that need flyer cleanup
    2. Creates a FlyerCleaner object
    3. Runs the cleanup process for all items
    
    For beginners:
    - Functions are reusable blocks of code that do specific tasks
    - main() is a common pattern - it's the "entry point" of the program
    - This list contains 10 specific identifiers that were identified as having bad flyer files
    - Each identifier represents a punk/hardcore show recording from 2016
    """
    # The 10 Archive.org item identifiers that have bad flyer files
    # These were identified manually and contain files with timestamp suffixes
    identifiers = [
        "02.27.16_AtaqueDeRabia",      # Ataque De Rabia show from Feb 27, 2016
        "02.27.16_AssholeParade",      # Asshole Parade show from Feb 27, 2016
        "02.27.16_ANNEX",              # ANNEX show from Feb 27, 2016
        "02.27.16_GeneracionSuicida",  # Generacion Suicida show from Feb 27, 2016
        "02.27.16_Coaccion",           # Coaccion show from Feb 27, 2016
        "02.28.16_GAG",                # GAG show from Feb 28, 2016
        "02.28.16_ACRYLICS",           # ACRYLICS show from Feb 28, 2016
        "02.28.16_CommonIgnorance",    # Common Ignorance show from Feb 28, 2016
        "02.28.16_BetaBoys",           # Beta Boys show from Feb 28, 2016
        "02.26.16_ExitDust"            # Exit Dust show from Feb 26, 2016
    ]
    
    # Create an instance of our FlyerCleaner class
    cleaner = FlyerCleaner()
    
    # Print information about what this script will do
    print(f"🚀 Starting flyer file cleanup for {len(identifiers)} items...")
    print("This will delete flyer files with timestamp suffixes (e.g., 2016-02-27T00:00:00Z-flyer_itemimage.jpg)")
    print("and keep the clean versions (e.g., 2016-02-27-flyer_itemimage.jpg)")
    
    # Auto-proceed since this cleanup was specifically requested
    print("\n✅ Proceeding with cleanup as requested...")
    
    # Start the cleanup process for all items
    cleaner.delete_bad_flyer_files(identifiers)

# This is a Python idiom - only run main() if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    main()
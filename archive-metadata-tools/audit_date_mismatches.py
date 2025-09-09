#!/usr/bin/env python3
"""
Audit for date mismatches between identifiers and titles in Archive.org items.
This helps catch user errors where the identifier date doesn't match the title date.

This script is a QUALITY CONTROL tool that finds inconsistencies in dates.
It compares:
- The date extracted from the Archive.org identifier (like "01.20.12_Thou")
- The date found in the item's title (like "Thou @ The Che Cafe on 01.12.12")

When these don't match, it usually means there was a data entry error.

For beginners:
- Archive.org identifiers are like file names (unique IDs for each item)
- Titles are human-readable descriptions of the content
- Regular expressions (regex) are patterns used to find text in strings
- JSON is a text format for storing structured data
"""

# Import statements - these bring in code libraries we need
import json      # For reading JSON files and handling structured data
import re        # For regular expressions (pattern matching in text)
import requests  # For making HTTP requests to Archive.org API
from datetime import datetime  # For working with dates (not used in current version)

def parse_date_from_identifier(identifier):
    """
    Parse date from Archive.org identifier patterns like MM.DD.YY_BandName.
    
    Args:
        identifier: Archive.org item ID (like "01.20.12_Thou")
        
    Returns:
        str: Standardized date in YYYY-MM-DD format, or None if no date found
        
    For beginners:
    - This function looks for date patterns in the identifier string
    - It uses regular expressions (regex) to find common date formats
    - The r'' syntax means "raw string" - backslashes are treated literally
    - \d means "any digit", {2} means "exactly 2 digits"
    - The ^ symbol means "start of string"
    """
    # List of regex patterns to match different date formats in identifiers
    patterns = [
        r'^(\d{2})\.(\d{2})\.(\d{2})_',      # MM.DD.YY_BandName (like "01.20.12_Thou")
        r'^(\d{1,2})\.(\d{1,2})\.(\d{2})_',  # M.DD.YY_BandName (like "1.5.12_Band")
        r'^(\d{4}-\d{2}-\d{2})-',           # YYYY-MM-DD-bandname (like "2012-01-20-thou")
    ]
    
    # Try each pattern to see if it matches the identifier
    for pattern in patterns:
        match = re.match(pattern, identifier)  # Check if pattern matches start of string
        if match:
            # If we found a match, extract the date parts
            if len(match.groups()) == 3:  # Three groups means month, day, year
                month, day, year = match.groups()
                # Convert 2-digit years to 4-digit (assume 2000s)
                if len(year) == 2:
                    year = '20' + year
                # zfill(2) adds leading zeros if needed ("1" becomes "01")
                return f'{year}-{month.zfill(2)}-{day.zfill(2)}'
            else:
                # Single group means already in YYYY-MM-DD format
                return match.group(1)
    return None  # No date pattern found

def parse_date_from_title(title):
    """
    Parse date from title text patterns.
    
    Args:
        title: The title text from Archive.org (like "Thou @ The Che Cafe on 01.12.12")
        
    Returns:
        str: Standardized date in YYYY-MM-DD format, or None if no date found
        
    For beginners:
    - This function looks for date patterns within the title text
    - Unlike identifiers, titles can have dates anywhere in the text
    - re.search() finds patterns anywhere in the string (not just the start)
    - Common patterns include "on MM.DD.YY" or "on MM/DD/YY"
    """
    # List of regex patterns to match different date formats in titles
    patterns = [
        r'on (\d{2})\.(\d{2})\.(\d{2})',       # "on MM.DD.YY" (like "on 01.12.12")
        r'on (\d{1,2})/(\d{1,2})/(\d{2,4})',  # "on MM/DD/YY" (like "on 1/12/12")
        r'(\d{4}-\d{2}-\d{2})',               # "YYYY-MM-DD" (like "2012-01-12")
        r'on (\d{2})-(\d{2})-(\d{2})',        # "on MM-DD-YY" (like "on 01-12-12")
    ]
    
    # Try each pattern to see if it matches anywhere in the title
    for pattern in patterns:
        match = re.search(pattern, title)  # Search anywhere in the string
        if match:
            # If we found a match, extract the date parts
            if len(match.groups()) == 3:  # Three groups means month, day, year
                month, day, year = match.groups()
                # Convert 2-digit years to 4-digit (assume 2000s)
                if len(year) == 2:
                    year = '20' + year
                # zfill(2) adds leading zeros if needed ("1" becomes "01")
                return f'{year}-{month.zfill(2)}-{day.zfill(2)}'
            else:
                # Single group means already in YYYY-MM-DD format
                return match.group(1)
    return None  # No date pattern found

def get_archive_metadata(identifier):
    """
    Get current metadata from Archive.org for an item.
    
    Args:
        identifier: Archive.org item ID (like "01.20.12_Thou")
        
    Returns:
        dict: The metadata dictionary from Archive.org, or None if error
        
    For beginners:
    - This function makes an HTTP request to Archive.org's API
    - The API returns JSON data containing all metadata for the item
    - requests.get() fetches data from a URL
    - response.status_code 200 means "success"
    - .json() converts the response text into a Python dictionary
    """
    try:  # try/except handles errors gracefully
        # Build the API URL for this specific item
        url = f'https://archive.org/metadata/{identifier}'
        # Make an HTTP GET request to fetch the metadata
        response = requests.get(url)
        # Check if the request was successful
        if response.status_code == 200:
            data = response.json()  # Convert JSON response to Python dict
            return data.get('metadata', {})  # Return just the metadata part
        return None  # Request failed
    except Exception as e:
        # If any error occurs, print it and return None
        print(f"Error fetching {identifier}: {e}")
        return None

def audit_date_mismatches():
    """
    Audit all items for date mismatches between identifier and title.
    
    This is the main function that:
    1. Loads the metadata issues from the JSON file
    2. Checks each item for date mismatches between identifier and title
    3. Fetches current Archive.org metadata for comparison
    4. Saves any mismatches found to a separate JSON file
    
    For beginners:
    - This function processes all items in our metadata_issues.json file
    - It compares dates from two sources: identifier vs title
    - When they don't match, it's usually a data entry error
    - The results help us fix incorrect dates before applying metadata changes
    """
    print("🔍 Auditing date mismatches between identifiers and titles...")
    print("This checks for user errors where the identifier date doesn't match the title date\n")
    
    # Load existing metadata issues to get the full item list
    # We'll check these items for date mismatches
    try:
        # Try to load from current directory first, then parent directory
        try:
            with open('metadata_issues.json', 'r') as f:
                issues = json.load(f)
        except FileNotFoundError:
            with open('../metadata_issues.json', 'r') as f:
                issues = json.load(f)
    except FileNotFoundError:
        print("❌ metadata_issues.json not found. Please run from the correct directory.")
        return
    
    # Initialize tracking variables
    mismatches = []      # List to store items with date mismatches
    checked_count = 0    # Counter for progress reporting
    
    # Loop through each item in our metadata issues list
    for issue_item in issues:
        identifier = issue_item['identifier']           # Archive.org item ID
        title = issue_item.get('title', '')            # Item title (use empty string if missing)
        
        # Parse dates from both the identifier and title using our helper functions
        id_date = parse_date_from_identifier(identifier)
        title_date = parse_date_from_title(title)
        
        # Check if we found dates in both places AND they don't match
        if id_date and title_date and id_date != title_date:
            # Get current Archive.org metadata to see what's actually stored
            metadata = get_archive_metadata(identifier)
            current_date = metadata.get('date', 'Not set') if metadata else 'Error fetching'
            
            # Create a dictionary with all the mismatch information
            mismatch = {
                'identifier': identifier,
                'title': title,
                'identifier_date': id_date,      # Date parsed from identifier
                'title_date': title_date,        # Date parsed from title
                'current_archive_date': current_date  # Current date in Archive.org
            }
            mismatches.append(mismatch)  # Add to our list of problematic items
            
            # Print details about this mismatch for immediate review
            print(f"🚨 MISMATCH: {identifier}")
            print(f"   Identifier suggests: {id_date}")
            print(f"   Title suggests: {title_date}")
            print(f"   Current Archive.org date: {current_date}")
            print(f"   Title: {title}")
            print()  # Empty line for readability
        
        # Update our progress counter and show periodic updates
        checked_count += 1
        # Every 50 items, print a progress update
        if checked_count % 50 == 0:
            print(f"✅ Checked {checked_count}/{len(issues)} items...")
    
    # Print final summary of the audit
    print(f"\n📊 Audit Results:")
    print(f"   Checked: {checked_count} items")
    print(f"   Mismatches found: {len(mismatches)} items")
    
    # If we found any mismatches, save them to a file for review
    if mismatches:
        # Save mismatches to a JSON file for later review/fixing
        with open('date_mismatches.json', 'w') as f:
            json.dump(mismatches, f, indent=2)  # indent=2 makes it readable
        
        print(f"\n💾 Saved mismatches to date_mismatches.json")
        print("\n🔍 Summary of mismatches:")
        # Print a quick summary of each mismatch
        for mismatch in mismatches:
            print(f"   {mismatch['identifier']}: {mismatch['identifier_date']} vs {mismatch['title_date']}")
    else:
        print("\n✅ No date mismatches found!")

# This is a Python idiom - only run the audit if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    audit_date_mismatches()
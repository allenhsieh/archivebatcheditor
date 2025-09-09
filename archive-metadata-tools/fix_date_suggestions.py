#!/usr/bin/env python3
"""
Fix incorrect date suggestions in metadata_issues.json.

This script corrects date parsing errors where the system used existing
(wrong) Archive.org dates instead of parsing correct dates from titles.

The problem:
- The original metadata analysis sometimes used existing wrong dates from Archive.org
- Instead, it should have parsed dates from the item titles which are more accurate
- This script re-parses all titles and fixes any incorrect date suggestions

For beginners:
- JSON is a text format for storing structured data (like Python dictionaries)
- Regular expressions (regex) are patterns used to find dates in text
- This script modifies the metadata_issues.json file in-place
- It's a data correction tool that runs before applying metadata changes
"""

# Import statements - these bring in code libraries we need
import json  # For reading/writing JSON files and handling structured data
import re    # For regular expressions (pattern matching in text)
from datetime import datetime  # For working with dates (not used in current version)

def parse_date_from_title(title):
    """
    Parse date from title text, prioritizing title over existing metadata.
    
    Args:
        title: The title text from Archive.org (like "Thou @ The Che Cafe on 01.12.12")
        
    Returns:
        str: Standardized date in YYYY-MM-DD format, or None if no date found
        
    For beginners:
    - This function looks for date patterns within the title text
    - It uses regular expressions (regex) to find common date formats
    - The r'' syntax means "raw string" - backslashes are treated literally
    - \d means "any digit", {2} means "exactly 2 digits"
    - We prefer title dates because they're usually more accurate than existing metadata
    """
    # List of regex patterns to match different date formats in titles
    patterns = [
        r'(\d{2})\.(\d{2})\.(\d{2})',      # MM.DD.YY (like "01.12.12")
        r'(\d{1,2})/(\d{1,2})/(\d{2,4})',  # MM/DD/YY or MM/DD/YYYY (like "1/12/12")
        r'(\d{4}-\d{2}-\d{2})',           # YYYY-MM-DD (like "2012-01-12")
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

def main():
    """
    Main function that runs when the script is executed.
    
    This function:
    1. Loads the metadata issues from the JSON file
    2. Goes through each item and re-parses the date from its title
    3. Compares the title date with the current suggested date
    4. Fixes any mismatches by updating the suggestion
    5. Saves the corrected file back to disk
    
    For beginners:
    - Functions are reusable blocks of code that do specific tasks
    - main() is a common pattern - it's the "entry point" of the program
    - The 'with' statement automatically closes files when done
    - json.load() converts JSON text into Python data structures
    """
    # Load the metadata issues from the JSON file
    # The 'with' statement automatically closes the file when done
    with open('metadata_issues.json', 'r') as f:
        issues = json.load(f)  # Convert JSON text to Python list/dict
    
    # Keep track of how many fixes we make
    fixes_made = 0
    
    print("🔍 Checking for date parsing errors...")
    
    # Go through each item in our metadata issues list
    for item in issues:
        # Only check items that have date suggestions
        if 'date' in item.get('suggestions', {}):
            # Parse the date from the title using our helper function
            title_date = parse_date_from_title(item['title'])
            # Get the currently suggested date (which might be wrong)
            current_suggested_date = item['suggestions']['date']
            
            # If we found a title date AND it's different from the suggestion
            if title_date and title_date != current_suggested_date:
                print(f"📅 Fixing {item['identifier']}:")
                print(f"   Title: {item['title']}")
                print(f"   Wrong: {current_suggested_date} → Correct: {title_date}")
                
                # Update the suggestion with the correct date from the title
                item['suggestions']['date'] = title_date
                fixes_made += 1  # Count this as a fix
    
    # If we made any fixes, save the corrected file
    if fixes_made > 0:
        # Save the corrected data back to the JSON file
        with open('metadata_issues.json', 'w') as f:
            json.dump(issues, f, indent=2)  # indent=2 makes it readable
        
        print(f"\n✅ Fixed {fixes_made} date suggestions in metadata_issues.json")
    else:
        print("\n✅ No date fixes needed")

# This is a Python idiom - only run main() if this file is executed directly
# (not if it's imported as a module by another script)
if __name__ == '__main__':
    main()
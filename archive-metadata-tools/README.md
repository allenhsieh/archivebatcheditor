# Archive.org Metadata Tools

A collection of Python scripts for managing and fixing metadata in Archive.org items, particularly for punk/hardcore show archives.

## Prerequisites

```bash
pip3 install internetarchive requests python-dotenv
```

## Environment Setup

Create a `.env` file in the parent directory with:
```
ARCHIVE_ACCESS_KEY=your_access_key
ARCHIVE_SECRET_KEY=your_secret_key
ARCHIVE_EMAIL=your_email
ARCHIVE_PASSWORD=your_password
```

Configure the internetarchive CLI:
```bash
ia configure --username="$ARCHIVE_EMAIL" --password="$ARCHIVE_PASSWORD"
```

## Scripts Overview

### Core Scripts (Use These)

#### 🔧 `apply_metadata_fixes.py` - **Main Script**
Applies comprehensive metadata fixes from a JSON file to Archive.org items.

**Usage:**
```bash
python3 apply_metadata_fixes.py
```

**Features:**
- Adds missing band names, venue names, and dates
- Standardizes date formats (YYYY-MM-DD)
- Intelligently skips fields that are already correct
- Individual field updates to avoid batch failures
- Proper rate limiting (1 second between requests)

#### 🔍 `audit_date_mismatches.py` - **Quality Control**
Audits for date mismatches between identifiers and titles to catch user errors.

**Usage:**
```bash
python3 audit_date_mismatches.py
```

**Output:** Creates `date_mismatches.json` with items that have conflicting dates

#### 🛠️ `fix_date_suggestions.py` - **Date Correction**
Fixes incorrect date suggestions in metadata_issues.json by prioritizing title parsing.

**Usage:**
```bash
python3 fix_date_suggestions.py
```

#### 🗑️ `delete_bad_flyers.py` - **File Cleanup**
Deletes incorrectly named flyer files with timestamp suffixes.

**Usage:**
```bash
python3 delete_bad_flyers.py
```

#### 🧪 `test_single_item.py` - **Testing Tool**
Tests metadata updates on a single Archive.org item for debugging.

**Usage:** Edit the script to specify the item and metadata, then:
```bash
python3 test_single_item.py
```

## Recommended Workflow

1. **Generate metadata issues** (using main application)
2. **Audit for date mismatches:**
   ```bash
   python3 audit_date_mismatches.py
   ```
3. **Fix any date parsing errors:**
   ```bash
   python3 fix_date_suggestions.py
   ```
4. **Test individual items** (if needed):
   ```bash
   python3 test_single_item.py
   ```
5. **Delete bad flyer files** (if needed):
   ```bash
   python3 delete_bad_flyers.py
   ```
6. **Apply all metadata fixes:**
   ```bash
   python3 apply_metadata_fixes.py
   ```

## Date Parsing Patterns

**In Identifiers:**
- `MM.DD.YY_BandName` → `YYYY-MM-DD`
- `YYYY-MM-DD-bandname` → `YYYY-MM-DD`

**In Titles:**
- `"@ Venue on MM.DD.YY"` → `YYYY-MM-DD`
- `"@ Venue on MM/DD/YY"` → `YYYY-MM-DD` 
- `"@ Venue on YYYY-MM-DD"` → `YYYY-MM-DD`

## Output Examples

### Successful Update
```
[12/499] Updating 01.20.12_Thou...
  ✓ Fixing date: 2012-01-12
    📝 Updating date: '2012-01-20' → '2012-01-12'
    ✅ Updated date: 2012-01-12
  ✅ Successfully updated 01.20.12_Thou
```

### Date Mismatch Detection
```
🚨 MISMATCH: 01.20.12_Thou
   Identifier suggests: 2012-01-20
   Title suggests: 2012-01-12
   Current Archive.org date: 2012-01-20
   Title: Thou @ The Che Cafe on 01.12.12
```

## Recent Success

Last batch run (499 items):
- ✅ **100% success rate** (exit code 0)
- ✅ **34 date corrections** applied
- ✅ **4 date mismatches** identified for review
- ✅ **Multiple missing field additions** (band, venue, date)

---

*These tools maintain the punk/hardcore show archive with proper metadata organization.*
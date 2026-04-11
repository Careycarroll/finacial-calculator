#!/bin/zsh
# set -x  # Enable verbose/debug mode

# ============================================================
# project_export.zsh
# Exports file structure and codebase contents for a project
# Usage:./project_export.zsh
# Usage Alt: zsh ~/Github\ Projects/financial-calculator/scripts/project_export.zsh
# ============================================================

SCRIPT_DIR="${0:A:h}"
TARGET_DIR="${1:-$HOME/Github Projects/financial-calculator}"
STRUCTURE_FILE="$SCRIPT_DIR/file_structure.txt"
CODEBASE_FILE="$SCRIPT_DIR/codebase.txt"

echo "📁 Target: $TARGET_DIR"
echo "⏳ Generating outputs...\n"

# ============================================================
# 1. FILE STRUCTURE → file_structure.txt
# ============================================================

echo "Generating $STRUCTURE_FILE..."
# Clear/create the file
: > "$STRUCTURE_FILE"
{
  echo "============================================================"
  echo " FILE STRUCTURE"
  echo " Generated: $(date)"
  echo " Directory: $(realpath $TARGET_DIR)"
  echo "============================================================"
  echo ""
  find "$TARGET_DIR" \
    -not -path "*/.git/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.next/*" \
    -not -name ".DS_Store" \
    | sort \
    | sed "s|$TARGET_DIR||" \
    | sed '/^$/d'
} > "$STRUCTURE_FILE"

echo "✅ $STRUCTURE_FILE done\n"


# ============================================================
# 2. DETAILED LISTING → file_structure.txt (appended)
# ============================================================

echo "Appending detailed listing to $STRUCTURE_FILE..."

{
  echo ""
  echo "============================================================"
  echo " DETAILED LISTING (ls -lR)"
  echo "============================================================"
  echo ""
  ls -lR "$TARGET_DIR" \
    | grep -v "^.*\.git" \
    | grep -v "^.*node_modules" \
    | grep -v "^.*\.next"
} >> "$STRUCTURE_FILE"

echo "✅ Detailed listing done\n"


# ============================================================
# 2. CODEBASE CONTENTS → codebase.txt
# ============================================================

echo "Generating $CODEBASE_FILE..."

# Clear/create the file
: > "$CODEBASE_FILE"

{
  echo "============================================================"
  echo " CODEBASE EXPORT"
  echo " Generated: $(date)"
  echo " Directory: $(realpath $TARGET_DIR)"
  echo "============================================================"
  echo ""
} >> "$CODEBASE_FILE"

# Find all.js,.html,.css files and dump contents
find "$TARGET_DIR" \
  -not -path "*/.git/*" \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -name ".DS_Store" \
  \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
  | sort \
  | while IFS= read -r file; do
      echo "" >> "$CODEBASE_FILE"
      echo "============================================================" >> "$CODEBASE_FILE"
      echo " FILE: $file" >> "$CODEBASE_FILE"
      echo "============================================================" >> "$CODEBASE_FILE"
      echo "" >> "$CODEBASE_FILE"
      cat "$file" >> "$CODEBASE_FILE"
      echo "" >> "$CODEBASE_FILE"
    done

echo "✅ $CODEBASE_FILE done\n"

# ============================================================
# SPLIT CODEBASE.TXT → chunks under 500KB
# ============================================================

echo "⏳ Splitting $CODEBASE_FILE into 500KB chunks...\n"

CODEBASE_BASENAME="${CODEBASE_FILE:r}"

split -b 500k "$CODEBASE_FILE" "${CODEBASE_BASENAME}_part_"

# Rename chunks to have.txt extension
for f in "${CODEBASE_BASENAME}_part_"*; do
  mv "$f" "$f.txt"
done

PART_COUNT=$(ls "${CODEBASE_BASENAME}_part_"*.txt | wc -l | tr -d ' ')

echo "------------------------------------------------------------"
echo " CODEBASE SPLIT SUMMARY"
echo "------------------------------------------------------------"
echo " Source file  : $CODEBASE_FILE"
echo " Total parts  : $PART_COUNT"
echo ""
ls -lh "${CODEBASE_BASENAME}_part_"*.txt
echo "------------------------------------------------------------"
echo "🎉 All done!"


# ============================================================
# SUMMARY
# ============================================================

STRUCTURE_COUNT=$(find "$TARGET_DIR" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" | wc -l | tr -d ' ')
JS_COUNT=$(find "$TARGET_DIR" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" -name "*.js" | wc -l | tr -d ' ')
HTML_COUNT=$(find "$TARGET_DIR" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" -name "*.html" | wc -l | tr -d ' ')
CSS_COUNT=$(find "$TARGET_DIR" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" -name "*.css" | wc -l | tr -d ' ')

echo "------------------------------------------------------------"
echo " SUMMARY"
echo "------------------------------------------------------------"
echo " Total files/dirs scanned : $STRUCTURE_COUNT"
echo " JS files exported        : $JS_COUNT"
echo " HTML files exported      : $HTML_COUNT"
echo " CSS files exported       : $CSS_COUNT"
echo "------------------------------------------------------------"
echo "🎉 All done!"
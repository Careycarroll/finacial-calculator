#!/bin/zsh

# ============================================================
# split_audit.zsh
# Finds audit.txt one level up and splits into <500KB chunks
# Usage:./split_audit.zsh
# Usage Alt: zsh ~/Github\ Projects/financial-calculator/scripts/split_audit.zsh
# ============================================================

SCRIPT_DIR="${0:A:h}"
AUDIT_FILE="$SCRIPT_DIR/../audit.txt"
OUTPUT_DIR="$SCRIPT_DIR/.."

# ============================================================
# VALIDATE
# ============================================================

if [[ ! -f "$AUDIT_FILE" ]]; then
  echo "❌ audit.txt not found at $AUDIT_FILE"
  exit 1
fi

echo "✅ Found: $AUDIT_FILE"
echo "📦 Size: $(du -sh "$AUDIT_FILE" | cut -f1)"

# ============================================================
# PREP OUTPUT DIR
# ============================================================

mkdir -p "$OUTPUT_DIR"
: > "$OUTPUT_DIR"  # clear if exists... just the dir check
echo "📁 Output directory: $OUTPUT_DIR"

# ============================================================
# SPLIT
# ============================================================

echo "⏳ Splitting into 500KB chunks...\n"

split -b 500k "$AUDIT_FILE" "$OUTPUT_DIR/audit_part_"

# Rename chunks to have.txt extension
for f in "$OUTPUT_DIR"/audit_part_*; do
  mv "$f" "$f.txt"
done

# ============================================================
# SUMMARY
# ============================================================

PART_COUNT=$(ls "$OUTPUT_DIR"/audit_part_*.txt | wc -l | tr -d ' ')

echo "------------------------------------------------------------"
echo " SUMMARY"
echo "------------------------------------------------------------"
echo " Source file  : $AUDIT_FILE"
echo " Output dir   : $OUTPUT_DIR"
echo " Total parts  : $PART_COUNT"
echo ""
ls -lh "$OUTPUT_DIR"/audit_part_*.txt
echo "------------------------------------------------------------"
echo "🎉 Done! Files saved to $OUTPUT_DIR"
# Script to remove all console.log statements from production code
# This will be run manually to clean up the codebase

# Files to clean (keeping only critical error logging):
# - Remove all console.log statements
# - Keep console.error for critical errors only
# - Remove console.warn except for important warnings

# Run this PowerShell script:
# Get-ChildItem -Path . -Include *.ts,*.tsx -Recurse | ForEach-Object {
#     (Get-Content $_.FullName) -replace '^\s*console\.log\(.*\);?\s*$', '' | Set-Content $_.FullName
# }

# Manual review needed for:
# - lib/auth.ts (lines 77, 92, 96)
# - app/post-property/page.tsx (lines 299-301, 357, 362)
# - app/dashboard/owner/page.tsx (lines 89, 93)
# - app/dashboard/admin/page.tsx (lines 53, 57, 109)
# - And many more...

# RECOMMENDATION: Remove these manually or use find-replace in IDE

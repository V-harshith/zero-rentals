# Debug Session: Bulk Import Image Upload Issue
**Date:** 2026-02-18
**Status:** ONGOING - Still debugging

## Problem Statement
Bulk import image upload shows:
- 71 images uploaded successfully
- Only 1 property (1040 - SURYA ROYAL HOMES PG) gets 1 image
- 9 properties have no images

## Commits Made During Session

### 1. 0fa7c4b - fix: critical PSN matching bug in bulk import image upload
- Initial fix for webkitRelativePath not being transmitted via FormData
- Changed client to send paths as separate FormData fields (path_0, path_1, etc.)
- Server builds pathMap from these fields

### 2. 0dabe76 - fix: array filtering broke file-to-path index alignment in bulk import
- Fixed issue where filtering files array compressed indices
- Changed to use sparse array with validIndices tracking
- Client uses `image_${index}` keys instead of generic "images"

### 3. cd8b65e - fix: use global index across batches to prevent index collision
- Fixed batch-local indices causing collisions between batches
- Added globalFileIndex counter across all batches
- Each file now has unique global index

## Root Causes Discovered

1. **webkitRelativePath browser limitation** - Not transmitted via FormData
2. **Async validation order** - Files pushed to array in completion order, not original order
3. **Array filtering misalignment** - Filter() compressed array, breaking index-to-path mapping
4. **Batch index collision** - Each batch used indices 0-4, causing collisions

## Root Cause Found (FINAL)

**Batch overwrites in database!** Each batch is a separate HTTP POST request, and each request overwrote the `images_by_psn` column in the database with only its own data.

**Flow:**
1. Batch 1: Uploads images for PSNs 84, 155 → DB has these
2. Batch 2: Uploads images for PSNs 257, 599 → **Overwrites** DB
3. ...
4. Last Batch 15: Has only 1040 → DB ends up with only 1040

## Fix Applied

**Commit:** f6fc8ac - fix: merge batch uploads instead of overwriting previous batches

**Changes:**
- Fetch existing `images_by_psn` and `orphaned_images` from DB
- Merge new batch data with existing data
- Calculate cumulative `total_images` across all batches
- Update audit log to track both batch and cumulative counts

## Files Modified

- `components/dashboard/admin/bulk-import/ImageUploadStep.tsx`
- `app/api/admin/bulk-import/jobs/[id]/images/route.ts`

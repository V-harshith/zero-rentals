-- ============================================================================
-- ZERO RENTALS - DATABASE OBJECTS VERIFICATION SCRIPT
-- Run this to verify all required database objects exist
-- ============================================================================
-- Version: 2026-02-18
-- Usage: Run in Supabase SQL Editor to verify production database state
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
    v_total_checks INTEGER := 0;
    v_passed_checks INTEGER := 0;
    v_failed_objects TEXT := '';
BEGIN
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '           ZERO RENTALS DATABASE VERIFICATION REPORT';
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '';

    -- =============================================
    -- TABLES VERIFICATION
    -- =============================================
    RAISE NOTICE '--- TABLES ---';

    -- property_locks table
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_locks';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] property_locks table exists';
    ELSE
        RAISE NOTICE '[FAIL] property_locks table MISSING';
        v_failed_objects := v_failed_objects || 'property_locks table, ';
    END IF;

    -- bulk_import_idempotency table
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_idempotency';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] bulk_import_idempotency table exists';
    ELSE
        RAISE NOTICE '[FAIL] bulk_import_idempotency table MISSING';
        v_failed_objects := v_failed_objects || 'bulk_import_idempotency table, ';
    END IF;

    -- bulk_import_staged_images table
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'bulk_import_staged_images';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] bulk_import_staged_images table exists';
    ELSE
        RAISE NOTICE '[FAIL] bulk_import_staged_images table MISSING';
        v_failed_objects := v_failed_objects || 'bulk_import_staged_images table, ';
    END IF;

    -- property_image_uploads table
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_image_uploads';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] property_image_uploads table exists';
    ELSE
        RAISE NOTICE '[FAIL] property_image_uploads table MISSING';
        v_failed_objects := v_failed_objects || 'property_image_uploads table, ';
    END IF;

    -- property_status_transitions table
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.tables WHERE table_name = 'property_status_transitions';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] property_status_transitions table exists';
    ELSE
        RAISE NOTICE '[FAIL] property_status_transitions table MISSING';
        v_failed_objects := v_failed_objects || 'property_status_transitions table, ';
    END IF;

    RAISE NOTICE '';

    -- =============================================
    -- COLUMNS VERIFICATION
    -- =============================================
    RAISE NOTICE '--- COLUMNS ---';

    -- payment_logs.order_id column
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'payment_logs' AND column_name = 'order_id';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] payment_logs.order_id column exists';
    ELSE
        RAISE NOTICE '[FAIL] payment_logs.order_id column MISSING';
        v_failed_objects := v_failed_objects || 'payment_logs.order_id column, ';
    END IF;

    -- properties.bulk_import_job_id column
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'bulk_import_job_id';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] properties.bulk_import_job_id column exists';
    ELSE
        RAISE NOTICE '[FAIL] properties.bulk_import_job_id column MISSING';
        v_failed_objects := v_failed_objects || 'properties.bulk_import_job_id column, ';
    END IF;

    -- properties.bulk_import_psn column
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'bulk_import_psn';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] properties.bulk_import_psn column exists';
    ELSE
        RAISE NOTICE '[FAIL] properties.bulk_import_psn column MISSING';
        v_failed_objects := v_failed_objects || 'properties.bulk_import_psn column, ';
    END IF;

    RAISE NOTICE '';

    -- =============================================
    -- FUNCTIONS VERIFICATION
    -- =============================================
    RAISE NOTICE '--- FUNCTIONS ---';

    -- acquire_property_lock function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'acquire_property_lock';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] acquire_property_lock function exists';
    ELSE
        RAISE NOTICE '[FAIL] acquire_property_lock function MISSING';
        v_failed_objects := v_failed_objects || 'acquire_property_lock function, ';
    END IF;

    -- release_property_lock function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'release_property_lock';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] release_property_lock function exists';
    ELSE
        RAISE NOTICE '[FAIL] release_property_lock function MISSING';
        v_failed_objects := v_failed_objects || 'release_property_lock function, ';
    END IF;

    -- extend_property_lock function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'extend_property_lock';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] extend_property_lock function exists';
    ELSE
        RAISE NOTICE '[FAIL] extend_property_lock function MISSING';
        v_failed_objects := v_failed_objects || 'extend_property_lock function, ';
    END IF;

    -- cleanup_expired_locks function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'cleanup_expired_locks';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] cleanup_expired_locks function exists';
    ELSE
        RAISE NOTICE '[FAIL] cleanup_expired_locks function MISSING';
        v_failed_objects := v_failed_objects || 'cleanup_expired_locks function, ';
    END IF;

    -- get_property_lock_status function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_lock_status';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] get_property_lock_status function exists';
    ELSE
        RAISE NOTICE '[FAIL] get_property_lock_status function MISSING';
        v_failed_objects := v_failed_objects || 'get_property_lock_status function, ';
    END IF;

    -- transition_property_status function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'transition_property_status';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] transition_property_status function exists';
    ELSE
        RAISE NOTICE '[FAIL] transition_property_status function MISSING';
        v_failed_objects := v_failed_objects || 'transition_property_status function, ';
    END IF;

    -- set_property_featured function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'set_property_featured';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] set_property_featured function exists';
    ELSE
        RAISE NOTICE '[FAIL] set_property_featured function MISSING';
        v_failed_objects := v_failed_objects || 'set_property_featured function, ';
    END IF;

    -- bulk_transition_property_status function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'bulk_transition_property_status';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] bulk_transition_property_status function exists';
    ELSE
        RAISE NOTICE '[FAIL] bulk_transition_property_status function MISSING';
        v_failed_objects := v_failed_objects || 'bulk_transition_property_status function, ';
    END IF;

    -- get_property_status_history function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'get_property_status_history';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] get_property_status_history function exists';
    ELSE
        RAISE NOTICE '[FAIL] get_property_status_history function MISSING';
        v_failed_objects := v_failed_objects || 'get_property_status_history function, ';
    END IF;

    -- rollback_bulk_import_properties function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'rollback_bulk_import_properties';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] rollback_bulk_import_properties function exists';
    ELSE
        RAISE NOTICE '[FAIL] rollback_bulk_import_properties function MISSING';
        v_failed_objects := v_failed_objects || 'rollback_bulk_import_properties function, ';
    END IF;

    -- mark_image_upload_failed function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'mark_image_upload_failed';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] mark_image_upload_failed function exists';
    ELSE
        RAISE NOTICE '[FAIL] mark_image_upload_failed function MISSING';
        v_failed_objects := v_failed_objects || 'mark_image_upload_failed function, ';
    END IF;

    -- mark_orphaned_uploads function
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'mark_orphaned_uploads';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] mark_orphaned_uploads function exists';
    ELSE
        RAISE NOTICE '[FAIL] mark_orphaned_uploads function MISSING';
        v_failed_objects := v_failed_objects || 'mark_orphaned_uploads function, ';
    END IF;

    RAISE NOTICE '';

    -- =============================================
    -- INDEXES VERIFICATION
    -- =============================================
    RAISE NOTICE '--- INDEXES ---';

    -- idx_property_locks_property_id
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_indexes WHERE indexname = 'idx_property_locks_property_id';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] idx_property_locks_property_id index exists';
    ELSE
        RAISE NOTICE '[FAIL] idx_property_locks_property_id index MISSING';
        v_failed_objects := v_failed_objects || 'idx_property_locks_property_id index, ';
    END IF;

    -- idx_property_locks_active
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_indexes WHERE indexname = 'idx_property_locks_active';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] idx_property_locks_active index exists';
    ELSE
        RAISE NOTICE '[FAIL] idx_property_locks_active index MISSING';
        v_failed_objects := v_failed_objects || 'idx_property_locks_active index, ';
    END IF;

    -- idx_bulk_import_jobs_admin_status
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_indexes WHERE indexname = 'idx_bulk_import_jobs_admin_status';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] idx_bulk_import_jobs_admin_status index exists';
    ELSE
        RAISE NOTICE '[FAIL] idx_bulk_import_jobs_admin_status index MISSING';
        v_failed_objects := v_failed_objects || 'idx_bulk_import_jobs_admin_status index, ';
    END IF;

    -- idx_properties_psn
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM pg_indexes WHERE indexname = 'idx_properties_psn';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] idx_properties_psn index exists';
    ELSE
        RAISE NOTICE '[FAIL] idx_properties_psn index MISSING';
        v_failed_objects := v_failed_objects || 'idx_properties_psn index, ';
    END IF;

    RAISE NOTICE '';

    -- =============================================
    -- CONSTRAINTS VERIFICATION
    -- =============================================
    RAISE NOTICE '--- CONSTRAINTS ---';

    -- properties_preferred_tenant_check
    v_total_checks := v_total_checks + 1;
    SELECT COUNT(*) INTO v_count FROM information_schema.table_constraints
    WHERE constraint_name = 'properties_preferred_tenant_check';
    IF v_count > 0 THEN
        v_passed_checks := v_passed_checks + 1;
        RAISE NOTICE '[PASS] properties_preferred_tenant_check constraint exists';
    ELSE
        RAISE NOTICE '[FAIL] properties_preferred_tenant_check constraint MISSING';
        v_failed_objects := v_failed_objects || 'properties_preferred_tenant_check constraint, ';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '========================================================================';
    RAISE NOTICE '                      VERIFICATION SUMMARY';
    RAISE NOTICE '========================================================================';
    RAISE NOTICE 'Total checks: %', v_total_checks;
    RAISE NOTICE 'Passed: %', v_passed_checks;
    RAISE NOTICE 'Failed: %', (v_total_checks - v_passed_checks);
    RAISE NOTICE 'Success rate: %', ROUND((v_passed_checks::NUMERIC / v_total_checks::NUMERIC) * 100, 1) || '%';
    RAISE NOTICE '';

    IF v_failed_objects = '' THEN
        RAISE NOTICE 'STATUS: ALL CHECKS PASSED - Database is fully configured!';
    ELSE
        RAISE NOTICE 'STATUS: SOME CHECKS FAILED';
        RAISE NOTICE 'Missing objects: %', v_failed_objects;
        RAISE NOTICE '';
        RAISE NOTICE 'ACTION: Run supabase/production_fix_complete.sql to fix missing objects.';
    END IF;

    RAISE NOTICE '========================================================================';
END $$;

-- ============================================================================
-- OPTIONAL: Test function execution (uncomment to run)
-- ============================================================================

-- Test transition_property_status with invalid data (should return error, not crash)
-- SELECT transition_property_status(NULL, 'active', NULL, 'test');

-- Test get_property_lock_status with invalid data (should return error, not crash)
-- SELECT get_property_lock_status(NULL, 'edit');

-- ============================================================================
-- OPTIONAL: Show table row counts (uncomment to run)
-- ============================================================================

-- SELECT 'property_locks' as table_name, COUNT(*) as row_count FROM property_locks
-- UNION ALL
-- SELECT 'property_status_transitions', COUNT(*) FROM property_status_transitions
-- UNION ALL
-- SELECT 'bulk_import_idempotency', COUNT(*) FROM bulk_import_idempotency
-- UNION ALL
-- SELECT 'bulk_import_staged_images', COUNT(*) FROM bulk_import_staged_images
-- UNION ALL
-- SELECT 'property_image_uploads', COUNT(*) FROM property_image_uploads;

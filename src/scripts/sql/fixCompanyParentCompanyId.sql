-- Fix company_masters.parent_company_id values that hold the OWNER'S LOGIN ID instead of a company id.
--
-- Run against the MASTER database. Review each step; nothing is changed until the final COMMIT.
--
-- Why: tenantMiddleware (and getCompanyByLoginId) treat parent_company_id as a company id and give
-- anyone mapped to that "parent" company access to the child company's tenant DB. Companies
-- 22, 146, 216, 287, 483, 542 have parent_company_id = their own owner's login id
-- (43, 282, 447, 659, 2651, 2889), which are ids of unrelated companies.

-- ---------------------------------------------------------------------------
-- STEP 1 (read-only): the six known rows, with what their "parent" really is.
-- parent_exists = 0 or a different parent_owner means this is not a real parent link.
-- ---------------------------------------------------------------------------
SELECT c.id                       AS company_id,
       c.a_application_login_id   AS company_owner_login,
       c.parent_company_id,
       p.id                       AS parent_exists,
       p.a_application_login_id   AS parent_owner_login,
       (SELECT COUNT(*) FROM company_vs_application_logins m
         WHERE m.company_masters_id = c.parent_company_id AND m.isDelete = 0) AS logins_mapped_to_that_parent
FROM company_masters c
LEFT JOIN company_masters p ON p.id = c.parent_company_id
WHERE c.id IN (22, 146, 216, 287, 483, 542);

-- ---------------------------------------------------------------------------
-- STEP 2 (read-only): every company that has the same pattern, for review.
-- Rows here that are NOT in the list above are NOT changed by this script.
-- Decide for each whether it is a real parent/child workspace.
-- ---------------------------------------------------------------------------
SELECT c.id AS company_id,
       c.a_application_login_id AS company_owner_login,
       c.parent_company_id,
       p.a_application_login_id AS parent_owner_login
FROM company_masters c
LEFT JOIN company_masters p ON p.id = c.parent_company_id
WHERE c.parent_company_id IS NOT NULL
  AND c.parent_company_id = c.a_application_login_id
ORDER BY c.id;

-- ---------------------------------------------------------------------------
-- STEP 3: backup of the rows about to change (keep this table until you are sure).
-- ---------------------------------------------------------------------------
CREATE TABLE company_masters_parent_fix_backup_20261002 AS
SELECT id, a_application_login_id, parent_company_id
FROM company_masters
WHERE id IN (22, 146, 216, 287, 483, 542)
  AND parent_company_id = a_application_login_id;

SELECT * FROM company_masters_parent_fix_backup_20261002;   -- expect up to 6 rows

-- ---------------------------------------------------------------------------
-- STEP 4: the fix. Ends in ROLLBACK so a first run changes nothing.
-- Check "Rows matched" / "Changed" is what you expect (6), then change ROLLBACK to COMMIT and re-run
-- this step.
-- ---------------------------------------------------------------------------
START TRANSACTION;

UPDATE company_masters
SET parent_company_id = NULL
WHERE id IN (22, 146, 216, 287, 483, 542)
  AND parent_company_id = a_application_login_id;

SELECT id, a_application_login_id, parent_company_id
FROM company_masters
WHERE id IN (22, 146, 216, 287, 483, 542);                  -- parent_company_id should now be NULL

ROLLBACK;   -- change to COMMIT; once the result above is correct

-- ---------------------------------------------------------------------------
-- UNDO (only if needed after a COMMIT):
--   UPDATE company_masters c
--   JOIN company_masters_parent_fix_backup_20261002 b ON b.id = c.id
--   SET c.parent_company_id = b.parent_company_id;
-- ---------------------------------------------------------------------------

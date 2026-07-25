import ProcessLockModel from "../models/hr/ProcessLockModel.js";

/**
 * Attempts to acquire a per-company, per-process lock atomically.
 * Returns true if the lock was acquired, false if already locked by someone else.
 *
 * Uses an UPDATE ... WHERE is_locked = 0 as a compare-and-set: only one
 * concurrent request can successfully flip is_locked 0 -> 1, because MySQL
 * serializes the row-level UPDATE. The other request's UPDATE affects 0 rows.
 */
export async function acquireProcessLock(companyMastersId, processType, lockedBy) {
    // Ensure a row exists for this company+process (idempotent, runs once ever per pair)
    await ProcessLockModel.findOrCreate({
        where: { company_masters_id: companyMastersId, process_type: processType, isDelete: 0 },
        defaults: { is_locked: 0 },
    });

    const [affectedRows] = await ProcessLockModel.update(
        {
            is_locked: 1,
            locked_by: lockedBy,
            locked_at: new Date(),
        },
        {
            where: {
                company_masters_id: companyMastersId,
                process_type: processType,
                isDelete: 0,
                is_locked: 0, // <-- the atomic compare-and-set condition
            },
        }
    );

    return affectedRows > 0;
}

/**
 * Releases the lock. Always call this in a finally block so a crash or
 * thrown error never leaves the lock stuck forever.
 */
export async function releaseProcessLock(companyMastersId, processType) {
    await ProcessLockModel.update(
        { is_locked: 0, locked_by: null, locked_at: null },
        { where: { company_masters_id: companyMastersId, process_type: processType, isDelete: 0 } }
    );
}
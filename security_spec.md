# Security Specification — Manajemen Klub Renang (Tirta Aquatics)

## Data Invariants
1. Every document in `clubs`, `athletes`, `swimTimes`, `transactions`, `schedules`, `invoices`, `attendance`, `announcements`, `coaches`, `pools`, `equipment`, and `competitions` belongs strictly to a single authenticated club owner (`ownerId == request.auth.uid`) or verified bootstrapped admin (`anashrulyusuf@gmail.com`).
2. `athletes`, `swimTimes`, `transactions`, `schedules`, `invoices`, `attendance`, `announcements`, `coaches`, `pools`, `equipment`, and `competitions` cannot exist without a valid existing parent `clubId` owned by the creator.
3. `swimTimes`, `invoices`, and `attendance` cannot be created without a valid existing `athleteId` owned by the creator.
4. `attendance` cannot be created without a valid existing `scheduleId` owned by the creator.
5. `ownerId`, `clubId`, and `createdAt` are immutable once created.
6. All writes require verified email authentication (`request.auth.token.email_verified == true`), strict field key allowlisting (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update), strict string `.size()` bounds, numeric range bounds, and server timestamps (`request.time`).
7. Terminal invoice states (`Lunas`, `Dibatalkan`) cannot be downgraded back to `Belum Lunas` or altered arbitrarily by non-admin updates; only valid transitions or admin overrides are allowed.
9. Multi-role RBAC (`admin` / pemilik klub, `coach` / pelatih, `parent` / wali murid) enforces strict separation:
   - `clubMembers` invitations can only be created/updated/deleted by the verified club owner or bootstrapped admin; invited users can only list their own verified email (`memberEmail == request.auth.token.email.lower()`).
   - **Pelatih (`coach`)** can only read/write coaching & training records (`schedules`, `attendance`, `swimTimes`, plus technical `notes` on `athletes` and `condition`/`lastCheckedDate`/`notes` on `equipment`), and can NEVER read `transactions`, `invoices`, `paymentRequests`, or `coaches` (honorarium PII).
   - **Wali Murid (`parent`)** can only read `athletes`, `swimTimes`, `attendance`, `invoices`, and `paymentRequests` belonging strictly to their linked email (`parentEmail == request.auth.token.email.lower()`), plus club `schedules`, `announcements`, and `competitions`. Parents can NEVER read `transactions`, `coaches`, `pools`, `equipment`, or another family's athlete/invoice documents.
10. All `allow list` rules evaluate solely against `resource.data` and `request.auth` without `get()` or `exists()` calls to prevent O(n) read amplification.

## The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read or write to `/athletes/ath-1` or `/coaches/coach-1` with `request.auth == null`.
2. **Unverified Email Write**: Create coach or athlete with `email_verified: false`.
3. **Identity Spoofing**: Create `/clubs/club-1` or `/coaches/coach-1` with `ownerId: "victim-uid"` when `request.auth.uid == "attacker-uid"`.
4. **Shadow/Ghost Field Injection**: Create `/coaches/coach-1` or `/clubMembers/m-1` with all valid fields plus `"isSuperAdmin": true`.
5. **Orphaned Record Creation**: Create `/coaches/coach-1`, `/pools/pool-1`, `/equipment/eq-1`, or `/clubMembers/m-1` referencing a non-existent `clubId: "missing-club-999"`.
6. **Cross-Tenant Club Hijack**: Create `/swimTimes/t-1` or `/competitions/comp-1` referencing a `clubId` owned by another user.
7. **ID Poisoning**: Create `/invoices/<1500-char-invalid-id!@#>` or `/coaches/<invalid!id>` violating `isValidId()`.
8. **Value/Type Poisoning**: Create `/transactions/tx-1` with `amount: -500000`, `/pools/pool-1` with `laneCount: 0`, or `/equipment/eq-1` with `quantity: -5`.
9. **Oversized String DoS**: Create `/announcements/ann-1` with `content` exceeding 2000 characters or `/coaches/coach-1` with `notes` exceeding 300 characters.
10. **Immutable Field Mutation**: Update `/coaches/coach-1` or `/athletes/ath-1` attempting to change `ownerId`, `clubId`, or `createdAt`.
11. **Terminal State Violation**: Update an invoice with `existing().status == "Lunas"` back to `"Belum Lunas"` as non-admin.
12. **Cross-Role Privilege Escalation & Snooping**: A `parent` attempting to list `/transactions`, `/coaches`, or another parent's `/athletes` / `/invoices`; a `coach` attempting to list `/invoices` or `/transactions`, or a user creating a self-assigned `/clubMembers` document.

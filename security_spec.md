# Security Specification — Manajemen Klub Renang (Tirta Aquatics)

## Data Invariants
1. Every document in `clubs`, `athletes`, `swimTimes`, `transactions`, `schedules`, `invoices`, `attendance`, and `announcements` belongs strictly to a single authenticated club owner (`ownerId == request.auth.uid`) or verified bootstrapped admin (`anashrulyusuf@gmail.com`).
2. `athletes`, `swimTimes`, `transactions`, `schedules`, `invoices`, `attendance`, and `announcements` cannot exist without a valid existing parent `clubId` owned by the creator.
3. `swimTimes`, `invoices`, and `attendance` cannot be created without a valid existing `athleteId` owned by the creator.
4. `attendance` cannot be created without a valid existing `scheduleId` owned by the creator.
5. `ownerId`, `clubId`, and `createdAt` are immutable once created.
6. All writes require verified email authentication (`request.auth.token.email_verified == true`), strict field key allowlisting (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update), strict string `.size()` bounds, and server timestamps (`request.time`).
7. Terminal invoice states (`Lunas`, `Dibatalkan`) cannot be downgraded back to `Belum Lunas` or altered arbitrarily by non-admin updates; only valid transitions or admin overrides are allowed.
8. All `allow list` rules check `resource.data.ownerId == request.auth.uid` (plus verified admin email) without `get()` or `exists()` calls to prevent O(n) read amplification.

## The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read or write to `/athletes/ath-1` with `request.auth == null`.
2. **Unverified Email Write**: Create athlete with `email_verified: false`.
3. **Identity Spoofing**: Create `/clubs/club-1` with `ownerId: "victim-uid"` when `request.auth.uid == "attacker-uid"`.
4. **Shadow/Ghost Field Injection**: Create `/athletes/ath-1` with all valid fields plus `"isSuperAdmin": true`.
5. **Orphaned Record Creation**: Create `/athletes/ath-1` referencing a non-existent `clubId: "missing-club-999"`.
6. **Cross-Tenant Club Hijack**: Create `/swimTimes/t-1` referencing a `clubId` owned by another user.
7. **ID Poisoning**: Create `/invoices/<1500-char-invalid-id!@#>` violating `isValidId()`.
8. **Value/Type Poisoning**: Create `/transactions/tx-1` with `amount: -500000` or `amount: "100000"`.
9. **Oversized String DoS**: Create `/announcements/ann-1` with `content` exceeding 2000 characters.
10. **Immutable Field Mutation**: Update `/athletes/ath-1` attempting to change `ownerId`, `clubId`, or `createdAt`.
11. **Terminal State Violation**: Update an invoice with `existing().status == "Lunas"` back to `"Belum Lunas"` as non-admin.
12. **Blanket List Scraping**: Execute `list` on `/athletes` without `where('ownerId', '==', auth.uid)` as a regular user attempting to read another club's PII (`parentPhone`).

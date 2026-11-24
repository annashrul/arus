import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ClubMember, ClubProfile, CoachStatus, UserRole } from '../types/club';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin / Pengurus Klub',
  coach: 'Pelatih',
  parent: 'Wali Murid',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  admin: 'Admin Klub',
  coach: 'Pelatih',
  parent: 'Wali Murid',
};

export function normalizeEmail(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase();
}

export function arraysEqualUnordered(a?: string[], b?: string[]): boolean {
  const sa = Array.from(new Set((a || []).map((x) => x.trim().toLowerCase()).filter(Boolean))).sort();
  const sb = Array.from(new Set((b || []).map((x) => x.trim().toLowerCase()).filter(Boolean))).sort();
  if (sa.length !== sb.length) return false;
  return sa.every((v, idx) => v === sb[idx]);
}

interface SyncWriteOp {
  collectionName: string;
  id: string;
  payload: Record<string, unknown>;
}

async function commitBatchedUpdates(ops: SyncWriteOp[]): Promise<void> {
  const CHUNK_SIZE = 420;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.update(doc(db, op.collectionName, op.id), {
        ...op.payload,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${chunk[0]?.collectionName || 'sync'}`);
    }
  }
}

/**
 * Synchronizes `coachEmails`, `parentEmails`, and per-athlete `parentEmail`
 * across Firestore club records so Coach and Parent users can securely query
 * only their authorized documents without `get()` calls in `allow list` rules.
 */
export async function syncClubRoleAccess(params: {
  club: ClubProfile;
  ownerId: string;
  members?: ClubMember[];
}): Promise<{ coachCount: number; parentCount: number; updatedDocs: number }> {
  const { club, ownerId } = params;
  const cid = club.id;

  let members = params.members;
  if (!members) {
    try {
      const snap = await getDocs(
        query(collection(db, 'clubMembers'), where('ownerId', '==', ownerId), where('clubId', '==', cid))
      );
      members = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMember, 'id'>) }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'clubMembers');
    }
  }

  const activeMembers = (members || []).filter((m) => m.status === 'Aktif');
  const coachEmailSet = new Set<string>();
  const parentEmailSet = new Set<string>();
  const athleteToParentEmail = new Map<string, string>();

  for (const m of activeMembers) {
    const email = normalizeEmail(m.memberEmail);
    if (!email) continue;
    if (m.role === 'coach') {
      if (coachEmailSet.size < 25) coachEmailSet.add(email);
    } else if (m.role === 'parent') {
      if (parentEmailSet.size < 100) parentEmailSet.add(email);
      for (const athId of m.linkedAthleteIds || []) {
        if (!athleteToParentEmail.has(athId)) {
          athleteToParentEmail.set(athId, email);
        }
      }
    }
  }

  // Fetch current club-scoped collections owned by ownerId
  const fetchOwned = async (colName: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, colName), where('ownerId', '==', ownerId), where('clubId', '==', cid))
      );
      return snap.docs;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, colName);
    }
  };

  const [
    athleteDocs,
    swimTimeDocs,
    scheduleDocs,
    attendanceDocs,
    invoiceDocs,
    paymentReqDocs,
    announcementDocs,
    poolDocs,
    equipmentDocs,
    competitionDocs,
  ] = await Promise.all([
    fetchOwned('athletes'),
    fetchOwned('swimTimes'),
    fetchOwned('schedules'),
    fetchOwned('attendance'),
    fetchOwned('invoices'),
    fetchOwned('paymentRequests'),
    fetchOwned('announcements'),
    fetchOwned('pools'),
    fetchOwned('equipment'),
    fetchOwned('competitions'),
  ]);

  // Also include athlete.parentEmail directly if an active parent member hasn't linked via clubMembers yet,
  // while keeping clubMembers as authoritative when linked.
  const finalAthleteParentEmail = new Map<string, string>();
  for (const docSnap of athleteDocs) {
    const data = docSnap.data() as { parentEmail?: string };
    const fromMember = athleteToParentEmail.get(docSnap.id);
    const existingEmail = normalizeEmail(data.parentEmail);
    const resolved = fromMember !== undefined ? fromMember : existingEmail;
    // Only preserve existing parentEmail if there's an active parent member or if explicitly set on athlete
    if (resolved) {
      finalAthleteParentEmail.set(docSnap.id, resolved);
      if (parentEmailSet.size < 100) parentEmailSet.add(resolved);
    } else {
      finalAthleteParentEmail.set(docSnap.id, '');
    }
  }

  const coachEmails = Array.from(coachEmailSet).sort();
  const parentEmails = Array.from(parentEmailSet).sort();

  const ops: SyncWriteOp[] = [];

  if (
    !arraysEqualUnordered(club.coachEmails, coachEmails) ||
    !arraysEqualUnordered(club.parentEmails, parentEmails)
  ) {
    ops.push({
      collectionName: 'clubs',
      id: cid,
      payload: { coachEmails, parentEmails },
    });
  }

  for (const d of athleteDocs) {
    const data = d.data() as { parentEmail?: string; coachEmails?: string[] };
    const targetParent = finalAthleteParentEmail.get(d.id) || '';
    if (
      normalizeEmail(data.parentEmail) !== targetParent ||
      !arraysEqualUnordered(data.coachEmails, coachEmails)
    ) {
      ops.push({
        collectionName: 'athletes',
        id: d.id,
        payload: { parentEmail: targetParent, coachEmails },
      });
    }
  }

  for (const d of swimTimeDocs) {
    const data = d.data() as { athleteId?: string; parentEmail?: string; coachEmails?: string[] };
    const targetParent = (data.athleteId && finalAthleteParentEmail.get(data.athleteId)) || '';
    if (
      normalizeEmail(data.parentEmail) !== targetParent ||
      !arraysEqualUnordered(data.coachEmails, coachEmails)
    ) {
      ops.push({
        collectionName: 'swimTimes',
        id: d.id,
        payload: { parentEmail: targetParent, coachEmails },
      });
    }
  }

  for (const d of attendanceDocs) {
    const data = d.data() as { athleteId?: string; parentEmail?: string; coachEmails?: string[] };
    const targetParent = (data.athleteId && finalAthleteParentEmail.get(data.athleteId)) || '';
    if (
      normalizeEmail(data.parentEmail) !== targetParent ||
      !arraysEqualUnordered(data.coachEmails, coachEmails)
    ) {
      ops.push({
        collectionName: 'attendance',
        id: d.id,
        payload: { parentEmail: targetParent, coachEmails },
      });
    }
  }

  const invoiceToParent = new Map<string, string>();
  for (const d of invoiceDocs) {
    const data = d.data() as { athleteId?: string; parentEmail?: string };
    const targetParent = (data.athleteId && finalAthleteParentEmail.get(data.athleteId)) || '';
    invoiceToParent.set(d.id, targetParent);
    if (normalizeEmail(data.parentEmail) !== targetParent) {
      ops.push({
        collectionName: 'invoices',
        id: d.id,
        payload: { parentEmail: targetParent },
      });
    }
  }

  for (const d of paymentReqDocs) {
    const data = d.data() as { invoiceId?: string; parentEmail?: string };
    const targetParent = (data.invoiceId && invoiceToParent.get(data.invoiceId)) || '';
    if (normalizeEmail(data.parentEmail) !== targetParent) {
      ops.push({
        collectionName: 'paymentRequests',
        id: d.id,
        payload: { parentEmail: targetParent },
      });
    }
  }

  for (const d of scheduleDocs) {
    const data = d.data() as { coachEmails?: string[]; parentEmails?: string[] };
    if (
      !arraysEqualUnordered(data.coachEmails, coachEmails) ||
      !arraysEqualUnordered(data.parentEmails, parentEmails)
    ) {
      ops.push({
        collectionName: 'schedules',
        id: d.id,
        payload: { coachEmails, parentEmails },
      });
    }
  }

  for (const d of announcementDocs) {
    const data = d.data() as { coachEmails?: string[]; parentEmails?: string[] };
    if (
      !arraysEqualUnordered(data.coachEmails, coachEmails) ||
      !arraysEqualUnordered(data.parentEmails, parentEmails)
    ) {
      ops.push({
        collectionName: 'announcements',
        id: d.id,
        payload: { coachEmails, parentEmails },
      });
    }
  }

  for (const d of competitionDocs) {
    const data = d.data() as { coachEmails?: string[]; parentEmails?: string[] };
    if (
      !arraysEqualUnordered(data.coachEmails, coachEmails) ||
      !arraysEqualUnordered(data.parentEmails, parentEmails)
    ) {
      ops.push({
        collectionName: 'competitions',
        id: d.id,
        payload: { coachEmails, parentEmails },
      });
    }
  }

  for (const d of poolDocs) {
    const data = d.data() as { coachEmails?: string[] };
    if (!arraysEqualUnordered(data.coachEmails, coachEmails)) {
      ops.push({
        collectionName: 'pools',
        id: d.id,
        payload: { coachEmails },
      });
    }
  }

  for (const d of equipmentDocs) {
    const data = d.data() as { coachEmails?: string[] };
    if (!arraysEqualUnordered(data.coachEmails, coachEmails)) {
      ops.push({
        collectionName: 'equipment',
        id: d.id,
        payload: { coachEmails },
      });
    }
  }

  if (ops.length > 0) {
    await commitBatchedUpdates(ops);
  }

  return {
    coachCount: coachEmails.length,
    parentCount: parentEmails.length,
    updatedDocs: ops.length,
  };
}

/**
 * Automatically updates or creates a `clubMembers` parent link when an athlete's
 * `parentEmail` is added or changed, then syncs all club documents so the parent
 * can immediately sign in and view their child's records.
 */
export async function syncAthleteParentAccess(params: {
  club: ClubProfile;
  ownerId: string;
  athleteId: string;
  athleteName: string;
  parentName?: string;
  nextParentEmail?: string;
  prevParentEmail?: string;
}): Promise<void> {
  const { club, ownerId, athleteId, athleteName, parentName } = params;
  const nextEmail = normalizeEmail(params.nextParentEmail);
  const prevEmail = normalizeEmail(params.prevParentEmail);
  if (!nextEmail && !prevEmail) return;

  let members: ClubMember[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'clubMembers'), where('ownerId', '==', ownerId), where('clubId', '==', club.id))
    );
    members = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMember, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'clubMembers');
  }

  // 1. Detach athleteId from any other parent clubMembers entry (including prevEmail)
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (m.role !== 'parent') continue;
    const mEmail = normalizeEmail(m.memberEmail);
    if (mEmail === nextEmail) continue;
    const currentLinked = m.linkedAthleteIds || [];
    if (!currentLinked.includes(athleteId)) continue;

    const remaining = currentLinked.filter((id) => id !== athleteId);
    const nextStatus = remaining.length === 0 ? 'Nonaktif' : m.status;
    try {
      await updateDoc(doc(db, 'clubMembers', m.id), {
        linkedAthleteIds: remaining,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      members[i] = { ...m, linkedAthleteIds: remaining, status: nextStatus };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${m.id}`);
    }
  }

  // 2. Attach athleteId to nextEmail (update existing parent member or create one)
  if (nextEmail) {
    const cleanParentName = (parentName || '').trim();
    const rawDisplay = cleanParentName.length >= 2 ? cleanParentName : `Wali ${athleteName}`;
    const safeDisplayName = rawDisplay.trim().slice(0, 100);
    const existingIdx = members.findIndex((m) => normalizeEmail(m.memberEmail) === nextEmail);

    if (existingIdx >= 0) {
      const existing = members[existingIdx];
      if (existing.role === 'parent') {
        const nextLinked = Array.from(new Set([...(existing.linkedAthleteIds || []), athleteId])).slice(0, 20);
        const nextDisplay =
          cleanParentName.length >= 2 ? cleanParentName.slice(0, 100) : existing.displayName;
        const needsUpdate =
          !arraysEqualUnordered(existing.linkedAthleteIds, nextLinked) ||
          existing.status !== 'Aktif' ||
          existing.displayName !== nextDisplay;

        if (needsUpdate) {
          try {
            await updateDoc(doc(db, 'clubMembers', existing.id), {
              linkedAthleteIds: nextLinked,
              displayName: nextDisplay,
              status: 'Aktif',
              updatedAt: serverTimestamp(),
            });
            members[existingIdx] = {
              ...existing,
              linkedAthleteIds: nextLinked,
              displayName: nextDisplay,
              status: 'Aktif',
            };
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${existing.id}`);
          }
        }
      }
    } else {
      try {
        const ref = await addDoc(collection(db, 'clubMembers'), {
          clubId: club.id,
          ownerId,
          memberEmail: nextEmail,
          displayName: safeDisplayName.length >= 2 ? safeDisplayName : 'Wali Murid',
          role: 'parent',
          linkedAthleteIds: [athleteId],
          status: 'Aktif',
          notes: 'Tertaut otomatis dari profil atlet',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        members.push({
          id: ref.id,
          clubId: club.id,
          ownerId,
          memberEmail: nextEmail,
          displayName: safeDisplayName.length >= 2 ? safeDisplayName : 'Wali Murid',
          role: 'parent',
          linkedAthleteIds: [athleteId],
          status: 'Aktif',
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'clubMembers');
      }
    }
  }

  await syncClubRoleAccess({ club, ownerId, members });
}

/**
 * Automatically updates or creates a `clubMembers` coach account entry when a
 * coach's Google email or active status is saved, then syncs club permissions.
 */
export async function syncCoachMemberAccess(params: {
  club: ClubProfile;
  ownerId: string;
  coachName: string;
  nextEmail?: string;
  prevEmail?: string;
  coachStatus?: CoachStatus;
}): Promise<void> {
  const { club, ownerId, coachName, coachStatus = 'Aktif' } = params;
  const nextEmail = normalizeEmail(params.nextEmail);
  const prevEmail = normalizeEmail(params.prevEmail);
  if (!nextEmail && !prevEmail) return;

  let members: ClubMember[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'clubMembers'), where('ownerId', '==', ownerId), where('clubId', '==', club.id))
    );
    members = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClubMember, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'clubMembers');
  }

  // 1. Deactivate old coach email entry if coach email was changed or cleared
  if (prevEmail && prevEmail !== nextEmail) {
    const prevIdx = members.findIndex(
      (m) => m.role === 'coach' && normalizeEmail(m.memberEmail) === prevEmail
    );
    if (prevIdx >= 0 && members[prevIdx].status !== 'Nonaktif') {
      try {
        await updateDoc(doc(db, 'clubMembers', members[prevIdx].id), {
          status: 'Nonaktif',
          updatedAt: serverTimestamp(),
        });
        members[prevIdx] = { ...members[prevIdx], status: 'Nonaktif' };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${members[prevIdx].id}`);
      }
    }
  }

  // 2. Activate/create nextEmail coach entry
  if (nextEmail) {
    const safeCoachName = (coachName || 'Pelatih Klub').trim().slice(0, 80);
    const safeDisplayName = safeCoachName.length >= 2 ? safeCoachName : 'Pelatih Klub';
    const targetStatus = coachStatus === 'Aktif' ? 'Aktif' : 'Nonaktif';
    const existingIdx = members.findIndex((m) => normalizeEmail(m.memberEmail) === nextEmail);

    if (existingIdx >= 0) {
      const existing = members[existingIdx];
      if (existing.role === 'coach') {
        const nextDisplay = existing.displayName?.trim().length >= 2 ? existing.displayName : safeDisplayName;
        if (
          existing.coachName !== safeCoachName ||
          existing.status !== targetStatus ||
          existing.displayName !== nextDisplay
        ) {
          try {
            await updateDoc(doc(db, 'clubMembers', existing.id), {
              coachName: safeCoachName,
              displayName: nextDisplay,
              status: targetStatus,
              updatedAt: serverTimestamp(),
            });
            members[existingIdx] = {
              ...existing,
              coachName: safeCoachName,
              displayName: nextDisplay,
              status: targetStatus,
            };
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `clubMembers/${existing.id}`);
          }
        }
      }
    } else {
      try {
        const ref = await addDoc(collection(db, 'clubMembers'), {
          clubId: club.id,
          ownerId,
          memberEmail: nextEmail,
          displayName: safeDisplayName,
          role: 'coach',
          coachName: safeCoachName,
          linkedAthleteIds: [],
          status: targetStatus,
          notes: 'Tertaut otomatis dari profil pelatih',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        members.push({
          id: ref.id,
          clubId: club.id,
          ownerId,
          memberEmail: nextEmail,
          displayName: safeDisplayName,
          role: 'coach',
          coachName: safeCoachName,
          linkedAthleteIds: [],
          status: targetStatus,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'clubMembers');
      }
    }
  }

  await syncClubRoleAccess({ club, ownerId, members });
}

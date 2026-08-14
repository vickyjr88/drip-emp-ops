"use client";

/**
 * Tour progress, stored per user in localStorage.
 *
 * Phase 1 only. Phase 2 replaces the body of these four functions with calls
 * to GET/PUT /tours/progress so progress follows a user across devices; the
 * signatures are async already so that swap does not ripple into callers.
 *
 * Keyed by user id: a shared machine must not show one person's progress to
 * the next person who signs in.
 */

export type TourStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type TourProgress = {
  status: TourStatus;
  lastStep: number;
};

type ProgressMap = Record<string, TourProgress>;

const KEY_PREFIX = 'dripemporium.tours.';

function storageKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

function readAll(userId: string): ProgressMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ProgressMap) : {};
  } catch {
    // Corrupt or unavailable storage (private mode, quota) must not break the
    // portal -- onboarding state is not worth an error boundary.
    return {};
  }
}

function writeAll(userId: string, map: ProgressMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // Ignore: the tour still works for this session, it just will not persist.
  }
}

export async function loadProgress(userId: string): Promise<ProgressMap> {
  return readAll(userId);
}

export async function getTourProgress(
  userId: string,
  tourId: string,
): Promise<TourProgress> {
  const all = readAll(userId);
  return all[tourId] || { status: 'NOT_STARTED', lastStep: 0 };
}

export async function saveTourProgress(
  userId: string,
  tourId: string,
  progress: TourProgress,
): Promise<void> {
  const all = readAll(userId);
  all[tourId] = progress;
  writeAll(userId, all);
}

export async function resetTourProgress(userId: string, tourId: string): Promise<void> {
  const all = readAll(userId);
  delete all[tourId];
  writeAll(userId, all);
}

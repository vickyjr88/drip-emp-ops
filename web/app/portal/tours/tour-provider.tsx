"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TOURS, findTour, type Tour } from './catalogue';
import { getTourProgress, saveTourProgress, loadProgress, type TourStatus } from './progress';
import { TourOverlay } from './tour-overlay';

type TourContextValue = {
  activeTour: Tour | null;
  stepIndex: number;
  startTour: (tourId: string) => void;
  endTour: (status: Extract<TourStatus, 'COMPLETED' | 'SKIPPED'>) => void;
  next: () => void;
  previous: () => void;
  /** Tours this user is allowed to see, in catalogue order. */
  availableTours: Tour[];
  progress: Record<string, { status: TourStatus; lastStep: number }>;
  refreshProgress: () => void;
  /** Pages call this via useRegisterTourViewer once the profile has loaded. */
  registerViewer: (viewer: {
    userId: string;
    permissions: string[];
    isAdmin: boolean;
  }) => void;
  /** True once a profile is known; gates the checklist and launchers. */
  hasViewer: boolean;
  /** Whether the Getting Started panel is showing, and how to toggle it. */
  checklistVisible: boolean;
  setChecklistVisible: (visible: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTours() {
  const context = useContext(TourContext);
  if (!context) throw new Error('useTours must be used inside a TourProvider');
  return context;
}

type TourProviderProps = {
  /**
   * Identity may be supplied up-front, but usually is not: this provider lives
   * in portal/layout.tsx, above the router, and the pages below it are what
   * load the profile. They call useRegisterTourViewer once they have it.
   */
  userId?: string;
  permissions?: string[];
  isAdmin?: boolean;
  children: React.ReactNode;
};

/**
 * Hosting note: this provider MUST sit above the router, in portal/layout.tsx.
 *
 * Each portal section (/portal/operations, /portal/finance, ...) is a separate
 * route component that re-exports the same PortalPage. Navigating between them
 * unmounts and remounts the tree, so a provider rendered inside a page loses
 * all its state the moment a tour steps across sections -- the tour simply
 * vanished. A layout persists across those navigations; a page does not.
 */
export function TourProvider({
  userId: initialUserId,
  permissions: initialPermissions,
  isAdmin: initialIsAdmin = false,
  children,
}: TourProviderProps) {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState<
    Record<string, { status: TourStatus; lastStep: number }>
  >({});
  const [viewer, setViewer] = useState<{
    userId: string;
    permissions: string[];
    isAdmin: boolean;
  } | null>(initialUserId ? {
    userId: initialUserId,
    permissions: initialPermissions || [],
    isAdmin: initialIsAdmin,
  } : null);
  const launcherRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const userId = viewer?.userId || '';
  const permissions = useMemo(
    () => (Array.isArray(viewer?.permissions) ? viewer.permissions : []),
    [viewer],
  );
  const isAdmin = viewer?.isAdmin || false;

  const registerViewer = useCallback(
    (next: { userId: string; permissions: string[]; isAdmin: boolean }) => {
      setViewer((current) => {
        const curPerms = Array.isArray(current?.permissions) ? current.permissions : [];
        const nextPerms = Array.isArray(next?.permissions) ? next.permissions : [];
        if (
          current &&
          current.userId === next.userId &&
          current.isAdmin === next.isAdmin &&
          curPerms.length === nextPerms.length
        ) {
          return current;
        }
        return next;
      });
    },
    [],
  );

  // Checklist visibility lives here rather than in the dashboard page, so that
  // hiding it can be undone from the sidebar on any section -- and so the
  // choice survives navigating between sections.
  const [checklistVisible, setChecklistVisibleState] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      setChecklistVisibleState(
        window.localStorage.getItem(`dripemporium.tours.hidden.${userId}`) !== 'true',
      );
    } catch {
      setChecklistVisibleState(true);
    }
  }, [userId]);

  const setChecklistVisible = useCallback(
    (visible: boolean) => {
      setChecklistVisibleState(visible);
      if (!userId) return;
      try {
        if (visible) window.localStorage.removeItem(`dripemporium.tours.hidden.${userId}`);
        else window.localStorage.setItem(`dripemporium.tours.hidden.${userId}`, 'true');
      } catch {
        // Non-fatal: the choice just will not persist.
      }
    },
    [userId],
  );

  const activeTour = activeTourId ? findTour(activeTourId) || null : null;

  /**
   * Steps can span sections, so navigate before the overlay tries to measure.
   * The overlay holds the frame while the anchor is absent, so the tooltip
   * appears once the new route has painted rather than against the old page.
   */
  useEffect(() => {
    if (!activeTour) return;
    const target = activeTour.steps[stepIndex]?.route;
    if (target && pathname !== target) {
      router.push(target);
    }
  }, [activeTour, stepIndex, pathname, router]);

  const availableTours = useMemo(
    () =>
      TOURS.filter((tour) => {
        if (!tour.permission) return true;
        if (isAdmin) return true;
        return Array.isArray(permissions) && permissions.includes(tour.permission);
      }),
    [permissions, isAdmin],
  );

  const refreshProgress = useCallback(() => {
    let cancelled = false;
    loadProgress(userId).then((all) => {
      if (!cancelled) setProgress(all);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const cancel = refreshProgress();
    return cancel;
  }, [refreshProgress]);

  const startTour = useCallback(
    (tourId: string) => {
      const tour = findTour(tourId);
      if (!tour) return;

      // Remember what launched the tour so focus can return there on exit.
      launcherRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      getTourProgress(userId, tourId).then((saved) => {
        // Resume mid-tour, but never resume onto a step that no longer exists.
        const resumeAt =
          saved.status === 'IN_PROGRESS' && saved.lastStep < tour.steps.length
            ? saved.lastStep
            : 0;
        setStepIndex(resumeAt);
        setActiveTourId(tourId);
        saveTourProgress(userId, tourId, { status: 'IN_PROGRESS', lastStep: resumeAt });
      });
    },
    [userId],
  );

  const endTour = useCallback(
    (status: Extract<TourStatus, 'COMPLETED' | 'SKIPPED'>) => {
      const tourId = activeTourId;
      setActiveTourId(null);
      setStepIndex(0);

      if (tourId) {
        saveTourProgress(userId, tourId, { status, lastStep: 0 }).then(() => {
          refreshProgress();
        });
      }

      // Finishing a tour should leave the next one within reach. Completing
      // one and being dropped back into a bare page with no way to continue
      // was the main thing that made tours feel like a dead end.
      //
      // Only reopen for someone who has not explicitly hidden the panel --
      // "Hide" is a standing preference, and quietly undoing it would be worse
      // than the dead end it fixes. They still have the sidebar toggle.
      if (status === 'COMPLETED') {
        let hidden = false;
        try {
          hidden = window.localStorage.getItem(`dripemporium.tours.hidden.${userId}`) === 'true';
        } catch {
          hidden = false;
        }
        if (!hidden) setChecklistVisibleState(true);
      }

      // Return focus to whatever opened the tour, so keyboard users are not
      // dropped back at the top of the document.
      const launcher = launcherRef.current;
      launcherRef.current = null;
      if (launcher && document.contains(launcher)) {
        launcher.focus();
      }
    },
    [activeTourId, userId, refreshProgress],
  );

  const next = useCallback(() => {
    if (!activeTour) return;
    const last = activeTour.steps.length - 1;
    if (stepIndex >= last) {
      endTour('COMPLETED');
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    saveTourProgress(userId, activeTour.id, { status: 'IN_PROGRESS', lastStep: nextIndex });
  }, [activeTour, stepIndex, endTour, userId]);

  const previous = useCallback(() => {
    if (!activeTour || stepIndex === 0) return;
    const prevIndex = stepIndex - 1;
    setStepIndex(prevIndex);
    saveTourProgress(userId, activeTour.id, { status: 'IN_PROGRESS', lastStep: prevIndex });
  }, [activeTour, stepIndex, userId]);

  const value = useMemo(
    () => ({
      activeTour,
      stepIndex,
      startTour,
      endTour,
      next,
      previous,
      availableTours,
      progress,
      refreshProgress,
      registerViewer,
      hasViewer: Boolean(viewer),
      checklistVisible,
      setChecklistVisible,
    }),
    [
      registerViewer,
      viewer,
      checklistVisible,
      setChecklistVisible,
      activeTour,
      stepIndex,
      startTour,
      endTour,
      next,
      previous,
      availableTours,
      progress,
      refreshProgress,
    ],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {activeTour ? <TourOverlay /> : null}
    </TourContext.Provider>
  );
}

/**
 * Registers the signed-in profile with the tour context.
 *
 * The provider lives in portal/layout.tsx, above the router, so it cannot
 * fetch the profile itself -- the pages below it do that. Each page calls this
 * once it has one, and the context gates the checklist and launchers on
 * hasViewer until then.
 *
 * Safe to call from a page that may render before its profile arrives: pass
 * null and it simply does not register.
 */
export function useRegisterTourViewer(
  profile: { id: string; role?: string | null; roles?: Array<{ name: string }>; permissions?: string[] } | null,
) {
  const { registerViewer } = useTours();

  const id = profile?.id;
  const isAdmin =
    profile?.role === 'ADMIN' || (profile?.roles || []).some((role) => role.name === 'ADMIN');
  // Join to a primitive so the effect does not re-run on a fresh array with
  // identical contents, which the profile fetch produces on every refresh.
  const permissionKey = (profile?.permissions || []).join(',');

  useEffect(() => {
    if (!id) return;
    registerViewer({
      userId: id,
      permissions: permissionKey ? permissionKey.split(',') : [],
      isAdmin,
    });
  }, [id, permissionKey, isAdmin, registerViewer]);
}

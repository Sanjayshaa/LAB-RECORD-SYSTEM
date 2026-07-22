import { ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { clearStaleAuthStorage, isInvalidRefreshTokenError } from "@/lib/clientSession";
import {
  getRoleHomePath,
  requiresRoleSetup,
  resolveRoleFromSources,
  type AppRole,
} from "@/lib/authFlow";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRole?: AppRole;
}

/**
 * ProtectedRoute
 * ✅ Auth guard only
 * ✅ No redirect loops
 * ✅ No nested router
 * ✅ Role validation
 * ✅ Vercel safe
 * ✅ Tab-switch safe (debounced session check, no spurious logout)
 * ❌ No role routing logic (handled in AuthCallback)
 */

export default function ProtectedRoute({
  children,
  allowedRole,
}: ProtectedRouteProps) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<AppRole | null>(null);
  const requireAdminDepartment = import.meta.env.VITE_REQUIRE_ADMIN_DEPARTMENT === "true";

  // Track last known valid session so we never log out on a transient null
  const lastKnownValidSession = useRef(false);
  // Debounce timer for session loss detection
  const logoutDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkAccess = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;
        if (sessionError && isInvalidRefreshTokenError(sessionError)) {
          clearStaleAuthStorage();
          setIsLoggedIn(false);
          setAllowed(false);
          setLoading(false);
          return;
        }

        // ❌ No session found — but only treat as logged-out if we never had a valid session
        // or if we wait a debounce to confirm it's not a transient wake state
        if (!session?.user) {
          if (lastKnownValidSession.current) {
            // We HAD a session — wait 2.5 seconds before assuming it's really gone
            // (handles tab-wake token refresh timing gaps)
            if (!logoutDebounceTimer.current) {
              logoutDebounceTimer.current = setTimeout(async () => {
                if (!mounted) return;
                const { data: retry } = await supabase.auth.getSession();
                if (!retry.session?.user) {
                  // Still no session after retry → genuine logout
                  setIsLoggedIn(false);
                  setAllowed(false);
                  setLoading(false);
                }
                logoutDebounceTimer.current = null;
              }, 2500);
            }
            // Keep showing the page while we wait
            return;
          }

          setIsLoggedIn(false);
          setAllowed(false);
          setLoading(false);
          return;
        }

        // Session is valid — clear any pending logout timer
        if (logoutDebounceTimer.current) {
          clearTimeout(logoutDebounceTimer.current);
          logoutDebounceTimer.current = null;
        }
        lastKnownValidSession.current = true;
        setIsLoggedIn(true);

        const userId = session.user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, department, year, semester")
          .eq("id", userId)
          .single();

        if (!mounted) return;

        const resolvedRole = resolveRoleFromSources(
          profile?.role,
          session.user.user_metadata?.role,
          localStorage.getItem("pendingRole")
        );

        if (!resolvedRole) {
          setAllowed(false);
          setNeedsSetup(false);
          setResolvedRole(null);
          setLoading(false);
          return;
        }

        const computedNeedsSetup = requiresRoleSetup(
          resolvedRole,
          {
            department: profile?.department ?? null,
            year: profile?.year ?? null,
            semester: profile?.semester ?? null,
          },
          requireAdminDepartment
        );

        setResolvedRole(resolvedRole);
        setNeedsSetup(computedNeedsSetup);

        // Auth-only mode (used for /setup route)
        if (!allowedRole) {
          setAllowed(true);
        } else {
          if (resolvedRole === allowedRole) {
            setAllowed(true);
          } else {
            setAllowed(false);
            setNeedsSetup(false);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error("ProtectedRoute error:", err);
        // On exception, don't log out if we previously had a valid session
        if (!lastKnownValidSession.current) {
          setAllowed(false);
          setNeedsSetup(false);
          setLoading(false);
        } else {
          // Keep current auth state, just stop loading
          setLoading(false);
        }
      }
    };

    checkAccess();

    return () => {
      mounted = false;
      if (logoutDebounceTimer.current) {
        clearTimeout(logoutDebounceTimer.current);
        logoutDebounceTimer.current = null;
      }
    };
  }, [allowedRole, requireAdminDepartment]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Checking secure access…
      </div>
    );
  }

  // ❌ Not logged in → role-appropriate login (not always student /login)
  if (!isLoggedIn) {
    const loginPath =
      allowedRole === "faculty"
        ? "/faculty/login"
        : allowedRole === "admin"
          ? "/admin/login"
          : "/login";
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  // Missing setup scope for this role.
  if (allowed && needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (allowed && !needsSetup && location.pathname === "/setup") {
    if (resolvedRole) return <Navigate to={getRoleHomePath(resolvedRole)} replace />;
  }

  // ❌ Logged in but wrong role
  if (!allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  // ✅ Allowed
  return <>{children}</>;
}
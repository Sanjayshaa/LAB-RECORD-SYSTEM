import { ReactNode, useEffect, useState } from "react";
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

        // ❌ Not logged in
        if (!session?.user) {
          setIsLoggedIn(false);
          setAllowed(false);
          setLoading(false);
          return;
        }

        setIsLoggedIn(true);

        const userId = session.user.id;
        const { data: profile, error } = await supabase
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
          // Role mismatch goes to a single deny page.
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
        setAllowed(false);
        setNeedsSetup(false);
        setLoading(false);
      }
    };

    checkAccess();

    return () => {
      mounted = false;
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
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  clearAllUserScope,
  clearStaleAuthStorage,
  isInvalidRefreshTokenError,
} from "@/lib/clientSession"
import { clearPendingRole, resolveRoleFromSources } from "@/lib/authFlow"

type Role = "admin" | "faculty" | "student" | null

interface Profile {
  role: Role
  department: string | null
  year: string | null
  semester: string | null
  register_no: string | null
}

interface AuthContextType {
  user: User | null
  role: Role
  loading: boolean
  signOut: () => Promise<void>
  profile: Profile | null
}

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
)

function isNetworkFailure(error: unknown): boolean {
  const blob = JSON.stringify(error || {}).toLowerCase()
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || ""
  const combined = `${blob} ${message}`
  return (
    combined.includes("failed to fetch") ||
    combined.includes("err_network_changed") ||
    combined.includes("err_address_unreachable") ||
    combined.includes("err_internet_disconnected") ||
    combined.includes("err_name_not_resolved") ||
    combined.includes("network")
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    // 1️⃣ Get existing session (page refresh support)
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error && isInvalidRefreshTokenError(error)) {
        clearStaleAuthStorage()
        setUser(null)
        setRole(null)
        setProfile(null)
        setLoading(false)
        window.location.replace("/login")
        return
      }
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)

      if (sessionUser) {
        await fetchUserProfile(sessionUser.id)
      } else {
        setLoading(false)
      }
    })

    // 2️⃣ Listen to auth changes (login/logout)
    // IMPORTANT: Only act on SIGNED_OUT for logout — never on transient null sessions
    // from TOKEN_REFRESHED, INITIAL_SESSION, or tab wake events (prevents spurious logout).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      if (sessionUser) {
        setUser(sessionUser);
        // Only re-fetch profile on meaningful auth events, not every token refresh
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          fetchUserProfile(sessionUser.id);
        } else {
          // For TOKEN_REFRESHED etc., just update the user object quietly
          setUser(sessionUser);
        }
      } else if (event === "SIGNED_OUT") {
        // Only explicit sign-out should clear auth state
        setUser(null);
        setRole(null);
        setProfile(null);
        setLoading(false);
      }
      // All other events with null session (e.g. token refresh gap) are intentionally ignored
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 🔐 Fetch full profile from DB
  async function fetchUserProfile(userId: string) {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from("profiles")
        .select("role, department, year, semester, register_no")
        .eq("id", userId)
        .single()

      if (error) {
        if (isNetworkFailure(error)) {
          const cachedRole = resolveRoleFromSources(
            localStorage.getItem("pendingRole"),
            profile?.role
          )
          if (cachedRole) {
            setRole(cachedRole)
            setProfile({
              role: cachedRole,
              department:
                localStorage.getItem("department") || localStorage.getItem("dept"),
              year: localStorage.getItem("year"),
              semester: localStorage.getItem("semester"),
              register_no: localStorage.getItem("login_register_no"),
            })
          }
          return
        }

        let authUser: User | null = null
        try {
          const userResult = await supabase.auth.getUser()
          authUser = userResult?.data?.user ?? null
        } catch {
          authUser = null
        }

        const fallbackRole = resolveRoleFromSources(
          authUser?.user_metadata?.role,
          localStorage.getItem("pendingRole")
        )

        if (fallbackRole) {
          setUser((prev) =>
            prev
              ? ({
                  ...prev,
                  user_metadata: {
                    ...prev.user_metadata,
                    role: fallbackRole,
                  },
                } as User)
              : prev
          )
          setRole(fallbackRole)
          setProfile({
            role: fallbackRole,
            department:
              localStorage.getItem("department") || localStorage.getItem("dept"),
            year: localStorage.getItem("year"),
            semester: localStorage.getItem("semester"),
            register_no: null,
          })
        } else {
          setRole(null)
          setProfile(null)
        }
      } else {
        const resolvedDbRole = resolveRoleFromSources(data.role)
        clearPendingRole()
        setUser((prev) =>
          prev
            ? ({
                ...prev,
                user_metadata: {
                  ...prev.user_metadata,
                  role: resolvedDbRole,
                },
              } as User)
            : prev
        )
        setRole(resolvedDbRole)
        setProfile({
          role: resolvedDbRole,
          department: data.department || null,
          year: data.year || null,
          semester: data.semester || null,
          register_no: data.register_no || null,
        })
      }
    } catch (exception) {
      if (!isNetworkFailure(exception)) {
        console.error("Auth profile resolution failed:", exception)
      }
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearAllUserScope()
    setUser(null)
    setRole(null)
    setProfile(null)
    setLoading(false)
    window.location.replace("/login")
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        signOut,
        profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}
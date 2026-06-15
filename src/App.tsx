import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Route guard
import ProtectedRoute from "./components/ProtectedRoute";
import { SubjectProvider } from "./context/SubjectContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import LoadingScreen from "./components/ui/LoadingScreen";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const FacultyLogin = lazy(() => import("./pages/FacultyLogin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const RoleSetup = lazy(() => import("./pages/Common/RoleSetup"));
const StudentExam = lazy(() => import("./pages/Exam/StudentExam"));
const ExamLogin = lazy(() => import("./pages/Exam/ExamLogin"));
const ProctorExamPage = lazy(() => import("./components/proctor/ProctorExamPage"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const Student = lazy(() => import("./pages/Student"));
const Faculty = lazy(() => import("./pages/Faculty"));
const Admin = lazy(() => import("./pages/Admin/AdminRoutes.jsx"));

function RouteLoader() {
  return (
    <LoadingScreen
      message="Loading page..."
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center"
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
      {/* ================= PUBLIC ================= */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/faculty/login" element={<FacultyLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/exam" element={<Navigate to="/exam/login" replace />} />
      <Route path="/exam/login" element={<ExamLogin />} />
      <Route path="/exam/session" element={<StudentExam />} />
      <Route path="/exam/:id/proctor" element={<ProctorExamPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* ================= AUTH ================= */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <RoleSetup />
          </ProtectedRoute>
        }
      />

      {/* ================= STUDENT ================= */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRole="student">
            <SubjectProvider>
              <Student />
            </SubjectProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute allowedRole="student">
            <Navigate to="/student" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= FACULTY ================= */}
      <Route
        path="/faculty/*"
        element={
          <ProtectedRoute allowedRole="faculty">
            <Faculty />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/dashboard"
        element={
          <ProtectedRoute allowedRole="faculty">
            <Navigate to="/faculty" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= ADMIN ================= */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRole="admin">
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRole="admin">
            <Navigate to="/admin" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= FALLBACK ================= */}
      <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}

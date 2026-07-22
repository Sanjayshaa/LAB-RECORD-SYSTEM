import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import FacultyLayout from "@/layouts/FacultyLayout";

/* ===== Pages ===== */
import FacultyDashboard from "./FacultyDashboardReal";
import Templates from "./Templates";
import PendingList from "./PendingList";
import Submissions from "./FacultySubmissionsReal";
import FacultySubmissionDetail from "./FacultySubmissionDetailReal";
import FacultySettings from "./FacultySettings";
import FacultySubjectSelect from "./FacultySubjectSelect";
import FacultyExams from "./FacultyExams";
import FacultyExamSubmissions from "./FacultyExamSubmissions";
import FacultyExamActivity from "./FacultyExamActivity";
import FacultyExamMonitor from "./FacultyExamMonitor";
import StudentsList from "./StudentsList.jsx";
import Reports from "./FacultyReportsReal";
import Experiments from "./Experiments";
import AddExperiment from "./AddExperiment";
import FacultyNotifications from "./FacultyNotifications";
import FacultyLeaderboard from "./FacultyLeaderboard";
import FacultyInternalMarks from "./FacultyInternalMarks";

function RedirectToSubmission() {
  const { id } = useParams();
  if (!id) return <Navigate to="/faculty/submissions" replace />;
  return <Navigate to={`/faculty/submission/${id}`} replace />;
}

class FacultyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Faculty section error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <h2 className="mb-2 text-xl font-semibold text-slate-900">Unable to load data</h2>
            <p className="mb-6 text-slate-600">Please refresh the page or try again.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-blue-700 transition hover:bg-blue-100"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Faculty() {
  return (
    <FacultyErrorBoundary>
      <Routes>
        <Route element={<FacultyLayout />}>
          <Route index element={<FacultyDashboard />} />
          <Route path="subjects" element={<FacultySubjectSelect />} />
          <Route path="templates" element={<Templates />} />
          <Route path="pending" element={<PendingList />} />
          <Route path="submission/:id" element={<FacultySubmissionDetail />} />
          <Route path="review/:id" element={<RedirectToSubmission />} />
          <Route path="evaluate/:id" element={<RedirectToSubmission />} />
          <Route path="submissions" element={<Submissions />} />
          <Route path="students" element={<StudentsList />} />
          <Route path="reports" element={<Reports />} />
          <Route path="notifications" element={<FacultyNotifications />} />
          <Route path="experiments" element={<Experiments />} />
          <Route path="add-experiment" element={<AddExperiment />} />
          <Route path="exams" element={<FacultyExams />} />
          <Route path="exams/:examId" element={<FacultyExamSubmissions />} />
          <Route path="exam-monitor/:examId" element={<FacultyExamMonitor />} />
          <Route path="exam-activity/:examId" element={<FacultyExamActivity />} />
          <Route path="settings" element={<FacultySettings />} />
          <Route path="leaderboard" element={<FacultyLeaderboard />} />
          <Route path="internal-marks" element={<FacultyInternalMarks />} />
        </Route>

        <Route path="*" element={<Navigate to="/faculty" replace />} />
      </Routes>
    </FacultyErrorBoundary>
  );
}

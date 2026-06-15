import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="bg-slate-950/80 backdrop-blur p-10 rounded-2xl shadow-2xl text-center max-w-md w-full border border-slate-800">
        <div className="flex justify-center mb-4 text-red-500">
          <ShieldAlert size={48} />
        </div>

        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-6">
          You are not authorized to access this page.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            to="/login"
            className="w-full bg-blue-600 hover:bg-blue-700 transition text-white py-2 rounded-lg font-medium"
          >
            Go to Login
          </Link>

          <Link
            to="/"
            className="w-full bg-slate-700 hover:bg-slate-600 transition text-white py-2 rounded-lg font-medium"
          >
            Go Home
          </Link>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Lab Record System • Secure Access Control
        </div>
      </div>
    </div>
  );
}

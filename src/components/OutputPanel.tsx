import { useRef, useEffect } from "react";
import { Terminal, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface OutputPanelProps {
  output: string;
  error?: string;
  isLoading?: boolean;
  executionTime?: number;
}

export default function OutputPanel({
  output,
  error,
  isLoading = false,
  executionTime,
}: OutputPanelProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-200">Output</span>
        </div>
        {executionTime !== undefined && (
          <span className="text-xs text-slate-500">
            Executed in {executionTime}ms
          </span>
        )}
      </div>

      {/* CONTENT */}
      <div
        ref={outputRef}
        className="h-48 p-4 font-mono text-sm overflow-y-auto bg-slate-950"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Running code...</span>
          </div>
        ) : error ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Error</span>
            </div>
            <pre className="text-red-300 whitespace-pre-wrap break-all bg-red-950/30 p-3 rounded-lg border border-red-900/50">
              {error}
            </pre>
          </div>
        ) : output === "" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">Success</span>
            </div>
            <pre className="text-slate-200 whitespace-pre-wrap break-all">
              Program executed (no output)
            </pre>
          </div>
        ) : output ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">Success</span>
            </div>
            <pre className="text-slate-200 whitespace-pre-wrap break-all">
              {output}
            </pre>
          </div>
        ) : (
          <div className="text-slate-500">
            Click "Run Code" to execute your code and see output here...
          </div>
        )}
      </div>
    </div>
  );
}


import { useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Play, ChevronDown } from "lucide-react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  onRun?: () => void;
  isRunning?: boolean;
}

const LANGUAGES = [
  { id: "python", name: "Python" },
  { id: "javascript", name: "JavaScript" },
  { id: "java", name: "Java" },
  { id: "go", name: "Go" },
  { id: "ruby", name: "Ruby" },
  { id: "php", name: "PHP" },
  { id: "sql", name: "SQL" },
  { id: "cpp", name: "C++" },
  { id: "c", name: "C" },
];

const MONACO_LANGUAGE_MAP: Record<string, string> = {
  javascript: "javascript",
  python: "python",
  java: "java",
  go: "go",
  ruby: "ruby",
  php: "php",
  sql: "sql",
  cpp: "cpp",
  c: "c",
};

export default function CodeEditor({
  value,
  onChange,
  language = "python",
  onLanguageChange,
  onRun,
  isRunning = false,
}: CodeEditorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onChange(value || "");
    },
    [onChange]
  );

  const handleLanguageSelect = (langId: string) => {
    if (onLanguageChange) {
      onLanguageChange(langId);
    }
    setIsDropdownOpen(false);
  };

  const currentLanguage = LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];
  const displayName = currentLanguage?.name || "Python";
  const monacoLanguage = MONACO_LANGUAGE_MAP[language] || "plaintext";

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 hover:bg-slate-700 transition"
          >
            <span className="font-medium">{displayName}</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => handleLanguageSelect(lang.id)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition ${
                    language === lang.id
                      ? "text-blue-400 bg-slate-700/50"
                      : "text-slate-200"
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Run Button */}
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-sm font-medium text-white hover:from-green-700 hover:to-green-600 transition shadow-lg shadow-green-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {isRunning ? "Running..." : "Run Code"}
        </button>
      </div>

      {/* MONACO EDITOR */}
      <div className="h-96">
        <Editor
          height="100%"
          language={monacoLanguage}
          value={value}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
}


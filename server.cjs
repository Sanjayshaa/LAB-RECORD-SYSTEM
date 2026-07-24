require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const manualRoutes = require("./routes/manualRoutes.cjs");
const gamificationRoutes = require("./routes/gamificationRoutes.cjs");
const adminRoutes = require("./routes/adminRoutes.cjs");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("./middleware/authMiddleware.cjs");

const app = express();
const PORT = Number(process.env.RUNNER_PORT || process.env.PORT || 7001);
if (String(process.env.TRUST_PROXY || "").toLowerCase() === "1") {
  app.set("trust proxy", 1);
}
const jobsDirFromEnv = process.env.JOBS_DIR || "./jobs";
const JOBS_DIR = path.isAbsolute(jobsDirFromEnv)
  ? jobsDirFromEnv
  : path.resolve(process.cwd(), jobsDirFromEnv);

/**
 * `docker run` timeout (ms). Default 3 minutes so first-time `docker pull` of language images
 * does not fail (10s was too short for PHP/Ruby/etc. on slow networks).
 */
const DOCKER_RUN_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.DOCKER_RUN_TIMEOUT_MS || 180000)
);

/**
 * Code execution: Docker (local/VPS) or cloud APIs (Piston / Judge0 — no Docker on host).
 * - docker: only shell `docker run` (needs Docker on host)
 * - piston: only Piston API
 * - judge0: only Judge0 CE API
 * - auto: try Docker first; if `docker` is missing, use cloud chain (default)
 */
const CODE_RUNNER = String(process.env.CODE_RUNNER || "auto").toLowerCase();
const PISTON_API_URL =
  String(process.env.PISTON_API_URL || "https://emkc.org/api/v2/piston/execute").replace(/\/$/, "");
/** Judge0 CE public instance — free tier; self-host or RapidAPI for production load */
const JUDGE0_API_URL = String(process.env.JUDGE0_API_URL || "https://ce.judge0.com").replace(/\/$/, "");

/** Piston language id, runtime version, and main filename (engineer-man/piston). */
const PISTON_LANG = {
  python: { language: "python", version: "3.10.0", file: "main.py" },
  javascript: { language: "javascript", version: "18.15.0", file: "main.js" },
  java: { language: "java", version: "15.0.2", file: "Main.java" },
  go: { language: "go", version: "1.16.2", file: "main.go" },
  ruby: { language: "ruby", version: "3.0.1", file: "main.rb" },
  php: { language: "php", version: "8.0.2", file: "main.php" },
  c: { language: "c", version: "9.2.0", file: "main.c" },
  cpp: { language: "cpp", version: "9.2.0", file: "main.cpp" },
};

/** Judge0 CE language_id (see https://ce.judge0.com/languages — may change with CE updates) */
const JUDGE0_LANG = {
  python: 71,
  javascript: 63,
  java: 62,
  c: 50,
  cpp: 54,
  go: 60,
  ruby: 72,
  php: 68,
};

function dockerMissingError(stderr, err) {
  const t = `${String(stderr || "")} ${String(err?.message || "")}`.toLowerCase();
  return t.includes("docker") && (t.includes("not found") || t.includes("no such file"));
}

/**
 * Run code via public Piston API (no Docker on server). Rate limits may apply.
 */
async function runWithPiston(language, code) {
  const lang = String(language || "").toLowerCase();
  if (lang === "sql") {
    throw new Error("SQL runner needs Docker; run locally or use a VPS with Docker.");
  }
  const cfg = PISTON_LANG[lang];
  if (!cfg) {
    throw new Error(`Unsupported language for cloud runner: ${lang}`);
  }
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ required for Piston runner (global fetch).");
  }
  const res = await fetch(PISTON_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: cfg.language,
      version: cfg.version,
      files: [{ name: cfg.file, content: String(code || "") }],
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Piston HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `Piston error (${res.status})`
    );
  }
  const run = data.run;
  if (!run) {
    throw new Error("Invalid Piston response (no run object)");
  }
  const stdout = String(run.stdout ?? "");
  const stderr = String(run.stderr ?? "");
  const exitCode = run.code;
  const failed = exitCode !== 0 && exitCode !== null && exitCode !== undefined;
  if (failed) {
    return {
      ok: false,
      stdout,
      stderr: stderr || `Exit code ${exitCode}`,
    };
  }
  return { ok: true, stdout, stderr };
}

/**
 * Judge0 CE — second free option when Piston is down / rate-limited (no API key on public CE).
 */
async function runWithJudge0(language, code, input = "") {
  const lang = String(language || "").toLowerCase();
  if (lang === "sql") {
    throw new Error("SQL runner needs Docker; run locally or use a VPS with Docker.");
  }
  const languageId = JUDGE0_LANG[lang];
  if (!languageId) {
    throw new Error(`Judge0: unsupported language: ${lang}`);
  }
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ required for Judge0 runner (global fetch).");
  }
  const stdinVal = input != null && String(input).length > 0 ? String(input) : "\n";
  const url = `${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: String(code || ""),
      language_id: languageId,
      stdin: stdinVal,
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Judge0 HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Judge0 error (${res.status})`
    );
  }
  const stdout = data.stdout != null ? String(data.stdout) : "";
  const stderrRun = data.stderr != null ? String(data.stderr) : "";
  const compileOut = data.compile_output != null ? String(data.compile_output) : "";
  const statusId = data.status && typeof data.status.id === "number" ? data.status.id : null;
  /** 3 = Accepted in Judge0 CE */
  const accepted = statusId === 3;
  const combinedErr = [compileOut, stderrRun].filter(Boolean).join("\n").trim();

  if (compileOut && !accepted) {
    return {
      ok: false,
      stdout: "",
      stderr: combinedErr || data.status?.description || "Compilation failed",
    };
  }
  if (!accepted && statusId != null && statusId !== 3) {
    return {
      ok: false,
      stdout,
      stderr: combinedErr || data.status?.description || `Status ${statusId}`,
    };
  }
  return { ok: true, stdout, stderr: combinedErr };
}

/**
 * Try Piston first; if it throws (network / HTTP / rate limit), try Judge0 CE.
 * If Piston returns ok:false for user code, that result is returned (no second run).
 */
async function runWithCloudChain(language, code, input = "") {
  try {
    return await runWithPiston(language, code, input);
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    console.warn("[run] Piston failed, trying Judge0:", msg);
    try {
      return await runWithJudge0(language, code, input);
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Cloud runners failed — Piston: ${msg} | Judge0: ${msg2}`);
    }
  }
}

function normalizeOrigin(origin) {
  return typeof origin === "string" ? origin.trim().replace(/\/$/, "") : "";
}

/** True for common local dev origins (Vite, etc.) — avoid brittle regex on ports. */
function isLocalDevOrigin(origin) {
  const o = normalizeOrigin(origin).toLowerCase();
  if (!o) return false;
  return (
    o.startsWith("http://localhost:") ||
    o.startsWith("https://localhost:") ||
    o === "http://localhost" ||
    o === "https://localhost" ||
    o.startsWith("http://127.0.0.1:") ||
    o.startsWith("https://127.0.0.1:") ||
    o.startsWith("http://[::1]:") ||
    o.startsWith("https://[::1]:")
  );
}

/** Comma-separated origins for production (e.g. https://app.vercel.app). Localhost always allowed. */
function parseAllowedOrigins() {
  const explicit = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  /** On Render, forgetting CORS_ORIGINS breaks Vercel in the browser; default the known production UI. */
  const renderDefault =
    explicit.length === 0 && String(process.env.RENDER || "").toLowerCase() === "true"
      ? ["https://lab-record-system.vercel.app"]
      : [];
  return new Set([...explicit, ...renderDefault]);
}

const corsAllowedSet = parseAllowedOrigins();
/** Vercel preview deploys use unique *.vercel.app hosts; listing each in CORS_ORIGINS is impractical. */
function isVercelAppOrigin(origin) {
  return typeof origin === "string" && /^https:\/\/[^/]+\.vercel\.app$/i.test(origin.trim());
}
/**
 * Allow any https://*.vercel.app by default so Preview deployments work without setting RENDER=true.
 * Set CORS_ALLOW_VERCEL_PREVIEWS=false to disable (tighten CORS to CORS_ORIGINS only).
 */
const allowVercelPreviewOrigins = process.env.CORS_ALLOW_VERCEL_PREVIEWS !== "false";

if (String(process.env.RENDER || "").toLowerCase() === "true" || allowVercelPreviewOrigins) {
  console.log(
    "[cors] allowed origins:",
    [...corsAllowedSet].join(", ") || "(none — only same-origin / no Origin header)",
    "| set CORS_ORIGINS to add more (comma-separated)",
    "| vercel.app previews:",
    allowVercelPreviewOrigins ? "allowed (set CORS_ALLOW_VERCEL_PREVIEWS=false to disable)" : "off"
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (isLocalDevOrigin(normalized)) {
        callback(null, true);
        return;
      }
      if (corsAllowedSet.has(normalized)) {
        callback(null, true);
        return;
      }
      if (allowVercelPreviewOrigins && isVercelAppOrigin(normalized)) {
        callback(null, true);
        return;
      }
      if (process.env.CORS_ALLOW_ALL === "true") {
        callback(null, true);
        return;
      }
      console.warn("[cors] blocked origin:", origin, "| set CORS_ORIGINS or FRONTEND_URL in .env");
      callback(null, false);
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Department-Scope"],
    optionsSuccessStatus: 204,
  })
);
const jsonBodyLimit = String(process.env.JSON_BODY_LIMIT || "1mb");
app.use(express.json({ limit: jsonBodyLimit }));

const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
});

const runLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_RUN_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_RUN_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
});

const aiEvaluateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AI_WINDOW_MS || 60 * 1000),
  max: Number(process.env.RATE_LIMIT_AI_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use("/api/manual", manualRoutes);
app.use("/api/gamification", gamificationRoutes);
app.use("/api/admin", adminRoutes);

app.post("/api/ai/local-evaluate", aiEvaluateLimiter, requireAuth, async (req, res) => {
  const ollamaBaseUrl = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const ollamaModel = String(process.env.OLLAMA_MODEL || "llama3.2:3b").trim();
  const {
    aim = "",
    procedure = "",
    program = "",
    output = "",
    result = "",
    experimentTitle = "",
  } = req.body || {};

  const prompt = [
    "You are a strict lab-record evaluator.",
    "Return ONLY valid JSON with keys:",
    "predicted_score (0-100 number), confidence (0-100 number), status (Good|Fair|Needs Improvement), breakdown (object with algorithm, program, output, result as 0-100 numbers).",
    "No markdown, no explanation text.",
    "",
    "Evaluation rubric:",
    "- algorithm: logical steps and clarity of procedure",
    "- program: correctness signals, structure, and implementation detail",
    "- output: evidence and relevance of output",
    "- result: conclusion quality and interpretation",
    "",
    `Experiment: ${String(experimentTitle || "").trim()}`,
    "Submission:",
    `AIM: ${String(aim || "").trim()}`,
    `PROCEDURE: ${String(procedure || "").trim()}`,
    `PROGRAM: ${String(program || "").trim()}`,
    `OUTPUT: ${String(output || "").trim()}`,
    `RESULT: ${String(result || "").trim()}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return res.status(502).json({
        success: false,
        error: `Ollama request failed (${response.status}). ${text.slice(0, 200)}`,
      });
    }

    const payload = await response.json();
    const raw = String(payload?.response || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Ollama returned non-JSON response.",
      });
    }

    const predictedScore = Math.max(0, Math.min(100, Number(parsed?.predicted_score || 0)));
    const confidence = Math.max(0, Math.min(100, Number(parsed?.confidence || 0)));
    const status = String(parsed?.status || "Needs Improvement").trim() || "Needs Improvement";
    const breakdownRaw = parsed?.breakdown && typeof parsed.breakdown === "object" ? parsed.breakdown : {};
    const breakdown = {
      algorithm: Math.max(0, Math.min(100, Number(breakdownRaw.algorithm || 0))),
      program: Math.max(0, Math.min(100, Number(breakdownRaw.program || 0))),
      output: Math.max(0, Math.min(100, Number(breakdownRaw.output || 0))),
      result: Math.max(0, Math.min(100, Number(breakdownRaw.result || 0))),
    };

    return res.json({
      success: true,
      predicted_score: predictedScore,
      confidence,
      status,
      breakdown,
      model: ollamaModel,
    });
  } catch (error) {
    const msg = String(error?.message || error || "");
    return res.status(500).json({
      success: false,
      error:
        msg.includes("abort") || msg.includes("timed out")
          ? "Local model request timed out."
          : `Local model evaluation failed: ${msg}`,
    });
  }
});

function listRoutes(app) {
  console.log("\n=== REGISTERED EXPRESS ROUTES ===");
  const rootStack =
    (Array.isArray(app?._router?.stack) && app._router.stack) ||
    (Array.isArray(app?.router?.stack) && app.router.stack) ||
    [];

  if (!rootStack.length) {
    console.log("(route stack unavailable in current Express runtime)");
    console.log("=================================\n");
    return;
  }

  rootStack.forEach((middleware) => {
    if (middleware?.route?.methods && middleware?.route?.path) {
      const method = Object.keys(middleware.route.methods)[0]?.toUpperCase() || "USE";
      console.log(method, middleware.route.path);
      return;
    }

    if (middleware?.name === "router" && Array.isArray(middleware?.handle?.stack)) {
      middleware.handle.stack.forEach((handler) => {
        if (handler?.route?.methods && handler?.route?.path) {
          const method = Object.keys(handler.route.methods)[0]?.toUpperCase() || "USE";
          console.log(method, handler.route.path);
        }
      });
    }
  });

  console.log("=================================\n");
}

// Ensure jobs folder exists
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

app.get("/", (req, res) => {
  res.json({ status: "Runner OK" });
});

app.post("/run", runLimiter, async (req, res) => {
  const { language, code, input } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: "language and code required" });
  }

  const maxCodeChars = Math.max(1000, Number(process.env.RUN_MAX_CODE_CHARS || 120000));
  if (String(code).length > maxCodeChars) {
    return res.status(413).json({
      error: `code exceeds maximum length (${maxCodeChars} characters)`,
    });
  }

  /** Judge0 CE only (free public API, no Docker). */
  if (CODE_RUNNER === "judge0") {
    try {
      const r = await runWithJudge0(language, code);
      return res.json({
        success: r.ok,
        output: r.stdout || "",
        error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
      });
    } catch (e) {
      return res.json({
        success: false,
        output: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Piston (+ Judge0 on Piston throw) — for hosts without Docker (e.g. Render Node). */
  if (CODE_RUNNER === "piston") {
    try {
      const r = await runWithCloudChain(language, code);
      return res.json({
        success: r.ok,
        output: r.stdout || "",
        error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
      });
    } catch (e) {
      return res.json({
        success: false,
        output: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const jobId = Date.now().toString();
  const jobDir = path.join(JOBS_DIR, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    let fileName, image, cmd;

    fs.writeFileSync(
      path.join(jobDir, "input.txt"),
      input != null && String(input).length > 0 ? String(input) : "\n"
    );

    const inputRedir = " < /code/input.txt";

    switch (language) {
      case "python":
        fileName = "main.py";
        image = "python:3.10";
        cmd = `sh -c 'python /code/main.py${inputRedir}'`;
        break;

      case "javascript":
        fileName = "main.js";
        image = "node:18";
        cmd = `sh -c 'node /code/main.js${inputRedir}'`;
        break;

      case "c":
        fileName = "main.c";
        image = "gcc";
        cmd = `sh -c 'gcc /code/main.c -o /code/main && /code/main${inputRedir}'`;
        break;

      case "cpp":
        fileName = "main.cpp";
        image = "gcc";
        cmd = `sh -c 'g++ /code/main.cpp -o /code/main && /code/main${inputRedir}'`;
        break;

      case "java":
        fileName = "Main.java";
        image = "eclipse-temurin:17";
        cmd = `sh -c 'javac /code/Main.java && java -cp /code Main${inputRedir}'`;
        break;

      case "go":
        fileName = "main.go";
        image = "golang:1.22-alpine";
        cmd = `sh -c 'go run /code/main.go${inputRedir}'`;
        break;

      case "ruby":
        fileName = "main.rb";
        image = "ruby:3.3";
        cmd = `sh -c 'ruby /code/main.rb${inputRedir}'`;
        break;

      case "php":
        fileName = "main.php";
        image = "php:8.3-cli-alpine";
        cmd = `sh -c 'php /code/main.php${inputRedir}'`;
        break;

      case "sql":
        fileName = "main.sql";
        image = "python:3.10";
        cmd = "python /code/run_sql.py";
        break;

      default:
        return res.status(400).json({ error: "Unsupported language" });
    }

    fs.writeFileSync(path.join(jobDir, fileName), code);
    if (language === "sql") {
      fs.writeFileSync(
        path.join(jobDir, "run_sql.py"),
        `import pathlib
import sqlite3
import sys

sql = pathlib.Path("/code/main.sql").read_text(encoding="utf-8")
conn = sqlite3.connect(":memory:")
cursor = conn.cursor()
output_lines = []

for statement in [part.strip() for part in sql.split(";") if part.strip()]:
  try:
    cursor.execute(statement)
    if statement.lower().startswith("select"):
      rows = cursor.fetchall()
      for row in rows:
        output_lines.append(" | ".join("" if item is None else str(item) for item in row))
    else:
      conn.commit()
  except Exception as error:
    print(f"SQL error: {error}", file=sys.stderr)
    sys.exit(1)

if output_lines:
  print("\\n".join(output_lines))
`
      );
    }

    const dockerCmd = `
docker run --rm \
-v "${jobDir}":/code \
${image} \
${cmd}
`;

    exec(dockerCmd, { timeout: DOCKER_RUN_TIMEOUT_MS }, async (err, stdout, stderr) => {
      fs.rmSync(jobDir, { recursive: true, force: true });

      const tryPiston =
        (CODE_RUNNER === "auto" || CODE_RUNNER === "") &&
        err &&
        dockerMissingError(stderr, err);

      if (tryPiston) {
        console.warn("[run] Docker unavailable, using Piston → Judge0 fallback for language=", language);
        try {
          const r = await runWithCloudChain(language, code);
          return res.json({
            success: r.ok,
            output: r.stdout || "",
            error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
          });
        } catch (e) {
          return res.json({
            success: false,
            output: "",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      if (err) {
        return res.json({ success: false, output: "", error: stderr || err.message });
      }

      res.json({ success: true, output: stdout || "", error: "" });
    });

  } catch (e) {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    res.status(500).json({ error: e.message });
  }
});

// ===== SECURE JAVA EXECUTION API =====
// POST /api/run-java
// Input: { "code": "Java source code", "input": "optional user input" }
// Uses Docker with security limits
app.post("/api/run-java", runLimiter, async (req, res) => {
  const { code, input } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({
      success: false,
      error: "Code is required"
    });
  }

  // Generate unique runId
  const runId = Date.now().toString();
  const tempDir = path.join(JOBS_DIR, `temp-${runId}`);

  // Check if input is provided
  const hasInput = input && typeof input === "string" && input.trim().length > 0;

  try {
    // Create temp folder
    fs.mkdirSync(tempDir, { recursive: true });

    // Save code as Main.java
    const javaFilePath = path.join(tempDir, "Main.java");
    fs.writeFileSync(javaFilePath, code);

    // Build Docker command with optional input
    const runCmd = hasInput
      ? `javac Main.java && echo "${input.replace(/"/g, '\\"')}" | java Main`
      : "javac Main.java && java Main";

    // Docker command with security limits
    const dockerCmd = `docker run --rm \
--memory=100m \
--cpus=0.5 \
--pids-limit=64 \
--network=none \
-v "${tempDir}":/app \
-w /app \
eclipse-temurin:17 \
timeout 5 sh -c "${runCmd}"`;

    // Execute Docker command
    exec(dockerCmd, { timeout: 10000 }, (error, stdout, stderr) => {
      // Clean up temp folder
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (error) {
        // Check if it's a timeout
        if (error.killed || error.signal === 'SIGTERM') {
          return res.json({
            success: false,
            error: "Execution timed out (5 second limit)"
          });
        }
        return res.json({
          success: false,
          error: stderr || error.message
        });
      }

      if (stderr) {
        return res.json({
          success: false,
          error: stderr
        });
      }

      res.json({
        success: true,
        output: stdout
      });
    });

  } catch (err) {
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const suppressListen =
  String(process.env.SUPPRESS_SERVER_LISTEN || "").toLowerCase() === "1" ||
  String(process.env.VITEST || "").toLowerCase() === "true";

if (!suppressListen) {
  const server = app.listen(PORT);
  let __agentServerListening = false;

  server.once("listening", () => {
    __agentServerListening = true;
    console.log(`Code Runner running on port ${PORT}`);
    console.log(
      `[run] CODE_RUNNER=${CODE_RUNNER} | Piston=${PISTON_API_URL} | Judge0=${JUDGE0_API_URL}`
    );
    listRoutes(app);
  });

  server.on("error", (error) => {
    console.error("Server listen error:", error);
    if (!__agentServerListening && error?.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop existing server process before starting a new one.`
      );
      process.exitCode = 1;
    }
  });
} else {
  console.log("[server] SUPPRESS_SERVER_LISTEN=1 — listening skipped (tests/imports).");
}

module.exports = app;

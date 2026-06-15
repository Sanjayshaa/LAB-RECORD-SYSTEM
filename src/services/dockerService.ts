export async function executeCode(language: string, code: string) {
  const base = String(import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001").replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        language: (language || "python").toLowerCase(),
        code: code || ""
      })
    });

    if (!response.ok) {
      let errorMessage = "Execution server error";
      try {
        const errorData = await response.json();
        if (typeof errorData?.error === "string" && errorData.error.trim().length > 0) {
          errorMessage =
            errorData.error === "Unsupported language"
              ? "Execution not supported for this language"
              : errorData.error;
        }
      } catch {
        // keep default message when response body is not JSON
      }
      throw new Error(errorMessage);
    }

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (data?.success === false) {
      return {
        output: "",
        error: typeof data.error === "string" ? data.error : "Execution failed",
      };
    }

    return {
      output: typeof data.output === "string" ? data.output : "",
      error: typeof data.error === "string" ? data.error : null
    };
  } catch (err) {
    console.error("Execution error:", err);
    const errorMessage =
      err instanceof Error && err.message
        ? err.message
        : "Execution server not running on localhost:7001";
    return {
      output: "",
      error: errorMessage
    };
  }
}


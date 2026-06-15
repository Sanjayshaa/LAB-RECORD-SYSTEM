const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
}

async function requireFaculty(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (data.role !== "faculty") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Role verification failed",
    });
  }
}

module.exports = { requireAuth, requireFaculty };

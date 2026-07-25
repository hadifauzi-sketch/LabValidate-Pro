/* Beta-program configuration, read from environment variables. */

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "hadi.fauzi@gmail.com")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 30);
export const ACCESS_DAYS = Number(process.env.ACCESS_DAYS || 365);

// Beta: require sign-in to use the app (no guest mode) — default ON.
export const REQUIRE_LOGIN = String(process.env.BETA_REQUIRE_LOGIN ?? "true") !== "false";
// Beta: if true, submitting feedback auto-grants the year; if false (default),
// a tester becomes "pending" and the admin approves them manually.
export const AUTO_APPROVE = String(process.env.BETA_AUTO_APPROVE ?? "false") === "true";

const DAY = 86400000;

export const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || "").toLowerCase());
export const daysFromNow = (days) => new Date(Date.now() + days * DAY).toISOString();
export const daysFrom = (iso, days) => new Date(Date.parse(iso) + days * DAY).toISOString();

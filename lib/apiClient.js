/* Thin client wrappers around the /api endpoints.
   Every call sends the session cookie (credentials: "include"). */

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = body?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const auth = {
  async me() {
    // Returns { user, requireLogin } — the client uses requireLogin for the sign-in wall.
    return jsonFetch("/api/auth/me");
  },
  async signup({ email, password, name }) {
    const { user } = await jsonFetch("/api/auth/signup", {
      method: "POST", body: JSON.stringify({ email, password, name }),
    });
    return user;
  },
  async login({ email, password }) {
    const { user } = await jsonFetch("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    return user;
  },
  async logout() {
    await jsonFetch("/api/auth/logout", { method: "POST" });
  },
  async updateAccount(patch) {
    const { user } = await jsonFetch("/api/auth/account", {
      method: "PATCH", body: JSON.stringify(patch),
    });
    return user;
  },
  async deleteAccount() {
    await jsonFetch("/api/auth/account", { method: "DELETE" });
  },
};

export const cloud = {
  async list() {
    const { studies } = await jsonFetch("/api/studies");
    return studies;
  },
  async get(id) {
    return jsonFetch(`/api/studies/${encodeURIComponent(id)}`);
  },
  async save({ id, name, study }) {
    return jsonFetch("/api/studies", {
      method: "POST", body: JSON.stringify({ id, name, study }),
    });
  },
  async rename(id, name) {
    return jsonFetch(`/api/studies/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({ name }),
    });
  },
  async remove(id) {
    await jsonFetch(`/api/studies/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const feedback = {
  // Submit a rating + comment + identity. Returns the updated user.
  async submit({ rating, comment, name, company, job, country }) {
    const { user } = await jsonFetch("/api/feedback", {
      method: "POST", body: JSON.stringify({ rating, comment, name, company, job, country }),
    });
    return user;
  },
  // Admin: all feedback + summary.
  async listAll() {
    return jsonFetch("/api/feedback");
  },
};

export const reports = {
  // Report a bug or an improvement idea (separate from feedback).
  async submit({ type, title, detail }) {
    return jsonFetch("/api/reports", {
      method: "POST", body: JSON.stringify({ type, title, detail }),
    });
  },
  // Admin: all reports.
  async listAll() {
    const { reports } = await jsonFetch("/api/reports");
    return reports;
  },
};

export const admin = {
  async listUsers() {
    const { users } = await jsonFetch("/api/admin/users");
    return users;
  },
  async updateUser(id, patch) {
    const { user } = await jsonFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    return user;
  },
  async deleteUser(id) {
    await jsonFetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

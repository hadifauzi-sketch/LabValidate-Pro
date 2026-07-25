import { getUser } from "../_lib/auth.js";
import { REQUIRE_LOGIN } from "../_lib/config.js";

export default async function handler(req, res) {
  try {
    const user = await getUser(req);
    // Always 200 so the client can simply check `user`; null means "guest".
    // `requireLogin` tells the client whether to show the sign-in wall.
    return res.status(200).json({ user: user || null, requireLogin: REQUIRE_LOGIN });
  } catch (err) {
    console.error("me error", err);
    return res.status(200).json({ user: null, requireLogin: REQUIRE_LOGIN });
  }
}

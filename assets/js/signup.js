// Staff self-signup. Creates the auth account only — the account lands in
// public.staff as 'pending' (via a DB trigger) and can do nothing until the
// owner approves it in admin.html.
import { SB } from "./supabase-client.js";

const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) el.hidden = !on; };

if (!SB.configured) {
  show($("setup"), true);
} else {
  show($("form-wrap"), true);

  $("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    show($("err"), false);

    const code = $("c").value.trim();
    const name = $("n").value.trim();
    const email = $("e").value.trim();
    const pw = $("p").value;

    if (pw !== $("p2").value) return fail("Those two passwords don't match.");
    if (pw.length < 8) return fail("Use at least 8 characters for the password.");

    $("submit").disabled = true;
    $("submit").textContent = "Sending…";
    try {
      // Checked here only to give a clear message; the real gate is a database
      // trigger, so skipping this check gains nothing.
      if (!(await SB.checkAccessCode(code))) {
        return fail("That access code isn't right. Ask the owner for the current one.");
      }
      const { error } = await SB.signUp(email, pw, name, code);
      if (error) throw error;
      // Signed-in but unapproved: sign straight back out so a pending account
      // can't sit on a live session.
      await SB.signOut();
      show($("form-wrap"), false);
      show($("done"), true);
    } catch (err) {
      const m = String(err.message || "");
      // The trigger's rejection surfaces as an opaque "Database error saving new
      // user", so translate anything code-shaped back into a useful sentence.
      fail(/invalid_access_code|Database error saving new user/i.test(m)
        ? "That access code isn't right. Ask the owner for the current one."
        : (m || "Couldn't create the account. Try again."));
    } finally {
      $("submit").disabled = false;
      $("submit").textContent = "Send request";
    }
  });
}

function fail(msg) {
  $("err").textContent = msg;
  show($("err"), true);
}

# The Message

A standalone social site with its own accounts (handle + password). Plain Node 18+. The only package (`pg`) is used only when you connect a database.
The same page also runs inside Claude, so there is one design to maintain.

## Run it on your computer
    node server.js
Open http://localhost:3000, create an account, then open it in a second browser or a private window to create a second one.
On a phone on the same wifi, open http://<your-computer-ip>:3000.

Opened without the server (or as a plain file), accounts and passwords live only in that one browser. Real accounts need the server.

## Put it on the internet
Follow **DEPLOY.md**. It walks through GitHub, a free Neon database and Render from zero.
- Start command: `npm start`. Needs Node 18 or newer.
- With `DATABASE_URL` set (a Postgres link), accounts, posts and photos are stored in the database.
  Use this on Render's free plan, whose disk is erased on every restart.
- Without it, everything is stored in `data.json` and `uploads/` inside `DATA_DIR`
  (point `DATA_DIR` at a persistent disk on a paid host).
- Use HTTPS (hosts do this for you). Login cookies become Secure automatically.

## What the server enforces
- Passwords are scrypt-hashed. Sessions are HttpOnly cookies. Login attempts are rate limited.
- You can only post, comment and like as yourself, and only delete your own posts and comments.
- Messages need an accepted request first. Requests and messages are only ever sent to the two people in them.
- Deleting your account (settings) needs your password and removes your posts, comments, likes, messages and uploaded images.
- Messages show who said what, yours on the right.
- Mentions: typing @ in a post or comment suggests people; the mentioned person gets a notification (worked out from the posts themselves, so the server needs no extra rules).
- Handles are unique. Image uploads must be real JPEGs under 1.5mb (the page shrinks photos before uploading).

## Limits
- One JSON file is fine for a small community. For thousands of users, move to a real database.
- No email, password reset or moderation tools yet. Videos are not supported yet.
- The page refreshes data every 3 seconds (no websockets), which is simple but not instant.

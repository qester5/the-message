# Put The Message on the internet (Render), step by step

You do not need to know how to code for any of this. Go slowly, one step at a time.
Total time: about 30 to 45 minutes the first time. Cost: $0.

## The big picture (read this first)

Four pieces work together:

1. **Your code** (this folder). It is the website.
2. **GitHub**. A free place to keep your code so Render can read it.
3. **Render**. A free company that runs your code 24/7 and gives it a web address.
4. **Neon**. A free database that remembers accounts, posts and photos.

Why Neon? Render's free plan **erases its own disk** every time the site restarts or goes to sleep.
Without a database, every account and post would vanish. Neon keeps them safe.
(If you would rather pay a little and skip Neon, see "Paid option" near the end.)

---

## Step 1. Try it on your own computer first (5 min)

1. Go to **nodejs.org** and download the **LTS** version. Install it (keep clicking Next).
2. Unzip `the-message.zip`. You get a folder called `the-message`.
3. Open a terminal **inside that folder**:
   - **Windows:** open the folder, click the address bar at the top, type `cmd`, press Enter.
   - **Mac:** right-click the folder and choose "New Terminal at Folder".
4. Type `node server.js` and press Enter. You should see: `the message running on port 3000`.
5. Open **http://localhost:3000** in your browser. Make an account. It works.
6. Go back to the terminal and press **Ctrl+C** to stop it.

If this works, the code is fine and anything that goes wrong later is just setup.

## Step 2. Put the code on GitHub (10 min)

1. Go to **github.com** and create a free account.
2. Click the **+** at the top right, then **New repository**.
3. Name it `the-message`. Choose **Private** (only you can see the code). Click **Create repository**.
4. On the next page click the link **uploading an existing file**.
5. Open your `the-message` folder on your computer. Select **everything inside it** and drag it into the GitHub page.
   - Drag the **contents** (`server.js`, `package.json`, `public`, ...), **not** the outer `the-message` folder itself.
   - If you see `node_modules`, `data.json` or `uploads`, do not upload those.
6. Wait for the uploads to finish, then click **Commit changes**.
7. Check: on your repository page you should see `server.js` and `package.json` listed **right away**, not inside another folder.

## Step 3. Make the free database on Neon (5 min)

1. Go to **neon.com** and sign up (no credit card needed).
2. Create a project. Name it `the-message`. Pick the region closest to you and to Render's region.
3. On the project page click **Connect**. You will see a long link that starts with `postgresql://`.
4. Click **Copy**. Paste it somewhere safe for a minute (a notes app).
   **Treat it like a password.** Anyone with it can read your data. Never put it on GitHub.

## Step 4. Create the site on Render (10 min)

1. Go to **render.com** and click **Get Started**. Sign up with your GitHub account (easiest).
2. Click **New +** at the top, then **Web Service**.
3. Choose **Build and deploy from a Git repository**. Pick your `the-message` repository.
   (If it is not listed, click "Configure account" and allow Render to see that repository.)
4. Fill in the form:
   - **Name:** `the-message` (this becomes part of your web address)
   - **Language:** Node
   - **Branch:** main
   - **Root Directory:** leave empty
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
5. Scroll to **Environment Variables** and click **Add Environment Variable**:
   - **Key:** `DATABASE_URL`
   - **Value:** paste the long link from Neon.
6. Click **Deploy Web Service**.
7. A black log window appears. Wait 2 to 5 minutes. When you see `the message running on port ...` and
   `storing data in the database`, it is live.
8. At the top of the page is your address, like `https://the-message-abcd.onrender.com`. Click it.

## Step 5. Check that your data really is saved (2 min)

1. Make an account on your live site and write a post.
2. Close the tab. Wait 20 minutes (Render puts free sites to sleep after 15).
3. Open your address again. The first load takes about a minute (it is waking up). Log in.
   Your account and post should still be there. If so, everything works.

## Step 6. Share it

Send friends the address. Tell them:
- The first visit after a quiet spell is slow (up to a minute). After that it is fast.
- **There is no "forgot password" yet.** If someone loses their password, they must make a new account.

---

## Changing the site later

1. On GitHub open the file you want to change and click the pencil icon, edit, then **Commit changes**.
   (Or use **Add file > Upload files** to replace files.)
2. Render notices and redeploys by itself in a few minutes.
3. Accounts and posts stay, because they live in Neon.

## What the free plan means (so nothing surprises you)

- Sleeps after 15 minutes with no visitors and wakes in about a minute.
- Neon free gives 0.5 GB of storage. Photos are shrunk before upload, so that is room for
  many hundreds. If you ever get close, you will need to delete old posts or pay for more.
- Render can restart the site at any time. That is fine, your data is in Neon.
- The free plan is meant for small projects. If you ever have thousands of users, move up.

## Paid option: no Neon, always awake (about $7.25 a month)

Render's paid plan can keep a **disk** that is not erased. Prices on Render's site right now:
Starter web service $7 a month, plus $0.25 a month for each GB of disk.

1. In Step 4 choose **Starter** instead of Free.
2. Do **not** add `DATABASE_URL`. Instead add `DATA_DIR` with the value `/var/data`.
3. Open **Advanced**, click **Add Disk**. Name `data`, Mount Path `/var/data`, Size `1` GB.
4. Deploy. The site stays awake and keeps everything on that disk.
   (Deploys pause the site for a few seconds, because a disk allows only one copy running.)

Do not use Neon and a disk together, pick one.

## Your own web address (optional)

Buy a domain (for example at Namecheap or Cloudflare). In Render open your service, go to
**Settings > Custom Domains**, add it, and copy the records Render shows into your domain's DNS settings.
Render gives you the https padlock for free. Extra domains may cost a little, check Render's pricing page.

## If something goes wrong

- **Build failed, "Cannot find package.json":** your files ended up inside a folder on GitHub.
  Either re-upload the contents without the outer folder, or in Render open **Settings**
  and set **Root Directory** to that folder's name.
- **"could not start: ..." in the logs:** the `DATABASE_URL` is wrong or has a space in it.
  Copy it again from Neon. If it ends with `&channel_binding=require`, delete that part.
- **"Cannot find module 'pg'":** `package.json` was not uploaded, or Build Command is not `npm install`.
- **The page says "Application failed to respond" or loads forever right after visiting:** it is waking up.
  Wait a minute and refresh. If it keeps happening, open **Logs** on Render and read the last red lines.
- **Everything disappears after a while:** `DATABASE_URL` is missing. The log line at start-up must say
  `storing data in the database`. If it says `storing data in /opt/render/...` add the variable
  (Render > your service > **Environment**) and redeploy.
- **Login does nothing:** make sure you are using the `https://` address, not `http://`.
- **Too many attempts:** the site blocks repeated wrong passwords for a few minutes. Wait and retry.

## Not built yet (be honest with your friends)

No password reset, no email, no way to report or remove other people's posts, no video.
Until there is moderation, only invite people you trust.

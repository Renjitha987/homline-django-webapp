# HOMLine free-tier beta deployment

Stack: Render Free web service (Django + Gunicorn + WhiteNoise) · Neon Postgres (Free) · Cloudflare R2 (private bucket). The site is a React (Vite + TypeScript) app talking to a Django REST Framework API under `/api/`. There is no separate frontend host: `build.sh` builds the React app into `static/app/`, and Django serves its `index.html` for every page route (WhiteNoise serves the assets).

## AWS EC2 + existing RDS (recommended for the supplied setup)

The supplied AWS setup has the application EC2 instance and the PostgreSQL RDS instance in the same VPC, while RDS internet access is disabled. Deploy the application on that EC2 instance and point it at the **existing RDS database**. Do not create a new database, run `flush`, restore over production, or replace `DATABASE_URL`.

The files in [`deploy/aws/`](deploy/aws/) are templates for systemd and Nginx. The commands below assume Ubuntu, the repository is deployed at `/var/www/homline`, and the EC2 security group allows HTTP/HTTPS from the internet. The RDS security group should allow TCP 5432 **only from the EC2 security group**, not from `0.0.0.0/0`.

### 1. Back up before the first deploy

From a machine that can reach RDS, take a PostgreSQL custom-format dump and keep it outside the EC2 application directory:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="homline-before-ec2-$(date +%F).dump"
```

Also make a copy of `/var/www/homline/media/` if existing documents are stored on the instance. Do not delete the old application or its media until the new deployment has passed the smoke tests.

### 2. Install the application on EC2

```bash
sudo apt update
sudo apt install -y git python3-venv nginx nodejs npm postgresql-client
sudo mkdir -p /var/www /etc/homline
sudo chown -R ubuntu:www-data /var/www
cd /var/www
git clone <repository-url> homline
cd homline
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cd frontend && npm ci && npm run build
cd ..
```

Create `/etc/homline/homline.env` with the existing RDS connection string and production secrets. Keep this file out of Git and restrict it to root:

```dotenv
DEBUG=False
SECRET_KEY=<new-long-random-secret>
ALLOWED_HOSTS=<public-ip-or-domain>
CSRF_TRUSTED_ORIGINS=https://<public-ip-or-domain>
DATABASE_URL=<existing-RDS-postgresql-connection-string>
R2_BUCKET_NAME=<existing-private-bucket>
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<bucket-scoped-key>
R2_SECRET_ACCESS_KEY=<bucket-scoped-secret>
```

`R2_*` is required in production because EC2 local storage is not a safe document store by itself. If existing records reference documents in `media/`, first set the R2 values while running the old application code and run:

```bash
./venv/bin/python manage.py migrate_media_to_storage --dry-run
./venv/bin/python manage.py migrate_media_to_storage
```

The command verifies every copied file and never deletes the local original.

### 3. Apply only forward migrations and start the service

```bash
sudo chmod 600 /etc/homline/homline.env
./venv/bin/python manage.py check --deploy
./venv/bin/python manage.py collectstatic --no-input
./venv/bin/python manage.py migrate
./venv/bin/python manage.py seed_data
sudo cp deploy/aws/homline.service /etc/systemd/system/homline.service
sudo systemctl daemon-reload
sudo systemctl enable --now homline
sudo systemctl status homline --no-pager
```

`migrate` changes the schema forward and does not delete existing rows. Review its output; if it fails, fix the migration problem rather than dropping or recreating the database.

### 4. Put Nginx in front of Gunicorn

Replace `example.com` in [`deploy/aws/nginx.conf`](deploy/aws/nginx.conf) with the actual hostname or public IP, then install it:

```bash
sudo cp deploy/aws/nginx.conf /etc/nginx/sites-available/homline
sudo ln -s /etc/nginx/sites-available/homline /etc/nginx/sites-enabled/homline
sudo nginx -t
sudo systemctl reload nginx
```

For a domain, issue a TLS certificate with Certbot and change `CSRF_TRUSTED_ORIGINS` to the HTTPS domain. Do not use an RDS public endpoint or open port 5432 to the internet.

### 5. Verify before switching traffic

```bash
curl -i http://127.0.0.1:8000/healthz/
curl -i http://<public-ip-or-domain>/healthz/
```

Confirm that existing staff accounts, requests, database records, and uploaded documents are present. Keep the previous deployment available until these checks and a restart test pass. Future releases should pull code, install dependencies, run `collectstatic`, run `migrate`, and restart `homline`; they must continue using the same `DATABASE_URL` and R2 bucket.

## 1. Create resources (manual — nothing is provisioned automatically)

1. **Neon**: create a project, copy the *pooled or direct* connection string (`postgresql://…?sslmode=require`). This is `DATABASE_URL`.
2. **Cloudflare R2**: create a **private** bucket (do not enable the public `r2.dev` URL or a custom public domain). Create an API token scoped to *Object Read & Write* on that bucket only. Note the account endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. **Render**: New → Blueprint → select the repo (uses `render.yaml`, plan `free`).

## 2. Environment variables (Render dashboard; never in Git)

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `SECRET_KEY` | yes | render.yaml (auto-generated) | Django signing key |
| `DEBUG` | yes | render.yaml (`False`) | Must be False in production |
| `ALLOWED_HOSTS` | yes | render.yaml | Hostnames served |
| `CSRF_TRUSTED_ORIGINS` | yes | render.yaml | `https://<service>.onrender.com` (exact, no wildcard) |
| `DATABASE_URL` | yes | dashboard | Neon Postgres; app refuses to start without it |
| `R2_BUCKET_NAME` | yes | dashboard | Private bucket name |
| `R2_ENDPOINT_URL` | yes | dashboard | R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | dashboard | Bucket-scoped token |
| `LOG_LEVEL` | no | dashboard | Default `INFO` (stdout) |
| `DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD` | no | dashboard | First admin, created at build; remove the password afterwards |
| `MEDIA_ROOT` | no | local only | Dev only; ignored when R2 is set |

The app **fails at startup** if `DEBUG=False` and `SECRET_KEY`, `DATABASE_URL` or any `R2_*` variable is missing, so it cannot silently fall back to SQLite or local disk. Set the variables **before** the first deploy.

## 3. Deploy

`build.sh` builds the React app (`cd frontend && npm ci && npm run build`, so the build host needs Node 20+), installs Python dependencies, runs `collectstatic`, `migrate`, `seed_data`. Render free has no pre-deploy command, so migrations run during the build (single build at a time; the seed is idempotent). Migrations here only add fields/indexes. Never drop or recreate the database to fix a failed migration; fix forward.

Create the first admin either with the `DJANGO_SUPERUSER_*` variables (then delete the password variable) or from the Render Shell (not available on free: use the variables).

## 4. Cold starts

Render Free spins down after 15 minutes without traffic; the next request takes about a minute. Forms lock their submit button and show a "server may take up to a minute" message to prevent duplicate submissions; nothing auto-retries POSTs. No keep-alive pinging is used.

## 5. Smoke tests (run against the deployed URL; none have been run yet)

1. `GET /healthz/` → 200 `{"status":"ok"}` (503 if DB is down).
2. Public pages and `/static/css/style.css` load.
3. Submit a valid request with a PDF → redirected to tracker with a request ID; invalid submission (bad file / empty file) rejected.
4. Sign in at `/login` as staff (you land in `/panel`) → open the request → document download works; attachment name equals the original.
5. Anonymous / non-staff `GET /staff/requests/<id>/document/` → redirect to login or 403.
6. Trigger a restart/redeploy in Render, repeat step 4: document and record still present.
7. Confirm `https://<bucket-endpoint>/…` is not publicly readable (bucket public access off); `/media/…` → 404.
8. Force an error (e.g. bad URL) → no stack trace or secrets shown.

## 6. Backups and recovery

- **Database**: Neon Free keeps a short restore window (6 hours / 1 GB at the time of checking) and one manual snapshot. Not a real backup. Take a manual dump regularly and store it off-Render, privately: `pg_dump "$DATABASE_URL" -Fc -f homline-$(date +%F).dump`. Restore into a **new/empty** Neon branch or database with `pg_restore`, never over production.
- **Documents**: live only in R2. R2 has no automatic versioning by default; deleting an object deletes it. Copy periodically with `rclone sync r2:bucket <private-location>`.
- **Bad deploy**: Render → Deploys → roll back to a previous deploy. Migrations are additive, so rollback is safe for the current set.
- **Provider migration**: change `DATABASE_URL` (restore dump first) and/or the `R2_*` variables (copy objects with rclone first; keys are stored relative to the bucket).
- **Existing local documents** (if any survive in `media/`): with R2 configured, run `python manage.py migrate_media_to_storage --dry-run`, then without the flag. It copies and verifies each file and never deletes originals.

## 7. Cost (checked on provider pages; re-verify before launch)

| Service | Free allowance | Type | First-bill triggers |
|---|---|---|---|
| Render Free web | 750 instance hours/month, sleeps after 15 min, ephemeral disk, outbound bandwidth cap | permanent free tier | Exceeding bandwidth if a payment method is on file; moving to a paid plan |
| Neon Free | 1 GB/project, 100 CU-hours/project/month, scale-to-zero, no card | permanent free tier | Nothing automatic: compute is suspended when limits are hit; paid plan needed to grow |
| Cloudflare R2 | 10 GB-month, 1M Class A, 10M Class B ops/month, free egress | limited free allowance | Over 10 GB or the op limits. Whether a payment method is required to enable R2 was **not verified** from the pages above |
| Domain | `*.onrender.com` free | — | Custom domain registration (optional) |

Render's own free Postgres is **not** used: it expires after 30 days. Nothing here is "permanently free" beyond the providers' current terms.

## 8. Known limitations

- Rate limiting is per-process (Django local-memory cache). Gunicorn runs with one worker so it behaves as one limiter, and it resets on every restart/spin-down. It is not distributed.
- Request tracking is secured only by the unguessable request ID; receipts need the same browser session, the owner login, or staff.
- Uploaded content is checked by extension, size, and file signature; there is no malware scanning.
- No email/password-reset flow exists in the app, so none was audited.

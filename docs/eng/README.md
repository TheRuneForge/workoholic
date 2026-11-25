# Workoholic

Applies for jobs on your behalf at StudentConsulting, at most ten per calendar month, and collects them in a text file. The app is a Cloudflare Worker with D1, R2, Workflows and Browser Rendering, organised as an npm workspace: `apps/web`, `packages/core` and `packages/studentconsulting`.

All environment-specific settings are `__NAME__` placeholders. With Cloudflare Workers Builds, the deploy step discovers resource IDs and other settings through the Worker's Build token, restores saved settings from KV, and fills in `wrangler.jsonc` before deployment. For local Wrangler deployments, use your own git-ignored values file. Your StudentConsulting sign-in and other secrets are entered in the app and stored encrypted.

## Run your own copy

There are three ways, and they all end in the same app. Pick one.

| Way | You need | Runs on |
|---|---|---|
| [Docker](#docker) | Docker | Your own machine or server |
| [From your computer](#from-your-computer) | Node.js 22.12 or newer, a Cloudflare account | Cloudflare |
| [Cloudflare Workers Builds](#cloudflare-workers-builds) | A GitHub or GitLab account, a Cloudflare account | Cloudflare, on every push to `main` |

A GitHub account is needed for Workers Builds. For Docker and local Wrangler, download the source as a ZIP file or clone it.

### Docker

```sh
ADMIN_PASSWORD='at-least-16-characters' docker compose up -d
```

Choose a password of your own in place of the example. Open <http://localhost:8787>, sign in with the password and fill in the settings. All data, including a generated encryption key, is kept in the `data` volume, so back that volume up. The job site is visited with a Chrome that the container downloads the first time it is needed; `compose.yaml` adds the `SYS_ADMIN` capability so that Chrome can run in its own sandbox. Set `PUBLIC_URL` if the app is reached on another address. Instead of typing the values on the command line you can put them in a file named `.env` next to `compose.yaml`; git ignores it.

The port is published on this machine only. To reach the app from other machines, put a reverse proxy with HTTPS in front of it; `BIND_ADDRESS=0.0.0.0` publishes the port on every network interface without encryption, so use that on a trusted network only. Use Docker Engine 28.3.3 or later; older versions let other hosts on the same network reach ports published on 127.0.0.1.

### Your values on Cloudflare

The values in `cloudflare.example.env` are used for local Wrangler deployments. Workers Builds automatically discovers resource values from Cloudflare during the deploy phase.

| Name | Value |
|---|---|
| `PUBLIC_HOST` | The host name the app is served on, for example `app.example.com`. The domain must be in your Cloudflare account. |
| `CF_ACCESS_TEAM_DOMAIN` | Your Cloudflare Access team domain, `your-team.cloudflareaccess.com`. |
| `CF_ACCESS_AUD` | The Application Audience (AUD) tag of the Access application in front of the app. Without it nobody can sign in, so `tools/deploy.sh` refuses to deploy while it is empty. |
| `D1_DATABASE_NAME`, `D1_DATABASE_ID` | Name and ID of your D1 database. |
| `SECRETS_STORE_ID` | ID of your Secrets Store, which holds the key that encrypts the stored settings. |
| `CONFIG_NAMESPACE` | A name that is mixed into that encryption. Choose it once and never change it. |
| `THEME_KEY_PREFIX` | Name used for the theme setting in the browser, for example `workoholic`. |
| `THEME_COOKIE_DOMAIN` | Optional. A parent domain to share the theme setting with your other sites. |
| `SITE_FAMILY` | Name shown for the default theme. |

The commands below need Node.js. Install the project dependencies once with `npm ci --legacy-peer-deps`; this also installs Wrangler. Each step can also be done in the Cloudflare dashboard.

Do this once, before the first deploy. The first and the third command print the IDs for the table above; an account has one Secrets Store, so if you already have one, use its ID from `npm exec -- wrangler secrets-store store list --remote` instead of creating it:

```sh
npm exec -- wrangler d1 create workoholic
```

```sh
npm exec -- wrangler r2 bucket create workoholic-evidence
```

```sh
npm exec -- wrangler secrets-store store create workoholic --remote
```

Create the encryption key in the store. The command asks for the value; use the output of `openssl rand -base64 32`, keep a copy and never change it:

```sh
npm exec -- wrangler secrets-store secret create YOUR_STORE_ID --name WORKOHOLIC_CONFIG_KEY --scopes workers --remote
```

Also add a self-hosted Access application for `PUBLIC_HOST` under Zero Trust → Access → Applications and copy its AUD tag, turn on Email Routing for the domain (the Worker has a `send_email` binding), and create an API token for deploying from the "Edit Cloudflare Workers" template with the permissions Account: D1: Edit and Account: Secrets Store: Edit added. The token is the value of `CLOUDFLARE_API_TOKEN` below.

After the first deploy, open the app and fill in the settings. The tables are created and updated by the files in `migrations/` on every deploy.

### From your computer

```sh
cp cloudflare.example.env .cloudflare.env
```

Fill in `.cloudflare.env` (git ignores every `*.env` file except the example), sign in once and deploy:

```sh
npm exec -- wrangler login
```

```sh
sh tools/deploy.sh .cloudflare.env
```

Run the last command again whenever you want to deploy a newer version. `tools/deploy.sh` fills the values into a temporary copy, applies new database migrations, deploys the copy and removes it. Extra arguments go to `wrangler deploy`; `sh tools/deploy.sh .cloudflare.env --dry-run` builds without touching the database or uploading. If `.cloudflare.env` also has the lines `CLOUDFLARE_API_TOKEN=...` and `CLOUDFLARE_ACCOUNT_ID=...`, they are used and `wrangler login` is not needed; if either of the two is already exported in your shell, that value wins over the file.

### Cloudflare Workers Builds

In the Cloudflare dashboard, create a Worker named `workoholic` from your repository (Workers & Pages → Create → Import a repository). Under Settings → Builds, use:

```sh
Build command: npm ci --legacy-peer-deps
Deploy command: node tools/setup.mjs --workers-build && npm exec -- wrangler deploy
```

Workers Builds has two separate phases. The Build command only installs the locked dependencies: `npm ci --legacy-peer-deps`. The Deploy command then runs `node tools/setup.mjs --workers-build && npm exec -- wrangler deploy`. In that phase, the script uses the Worker's selected Build token to discover resource IDs and other settings, creates any missing resources, stores non-secret settings in KV, and fills in `wrangler.jsonc`. D1 migrations are then applied and Wrangler deploys the completed configuration. No manually entered Workers Build variables or GitHub secrets are needed.

If no custom `PUBLIC_HOST` is configured, setup uses the account's workers.dev address. Password login is enabled by default; the first password is published to the `workoholic-config` KV namespace under the `first-login` key. Save it, then delete the key. If the first build says `Login secrets were not set this time`, the Worker may need to exist after its first deploy; the next build tries again.

No variable values are needed for the default setup. Saved settings are read from KV on every build and are not overwritten by defaults. To customize an installation, set `PUBLIC_HOST`, `D1_DATABASE_NAME`, `CONFIG_NAMESPACE`, `SITE_FAMILY`, `THEME_KEY_PREFIX` or `THEME_COOKIE_DOMAIN` as Workers Build variables. These values override saved settings. `D1_DATABASE_ID` and `SECRETS_STORE_ID` are discovered automatically and should not be entered manually.

The Build token must have access to the resources managed by this configuration. Cloudflare's automatically generated token normally includes Workers Scripts, KV, R2 and Routes, but not D1 or Secrets Store. Add **D1: Edit** and **Secrets Store: Edit** to the token selected under Settings → Builds → API token. No variable values need to be entered manually.

Under Settings → Build → Branch control, turn off Enable Preview Builds. Setup is intentionally limited to the production branch because it creates and migrates production resources.

## Develop

```sh
npm ci --legacy-peer-deps
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-test.txt
npm test
npm run typecheck
```

Run your own copy:

```sh
cp cloudflare.example.env my-values.env
node tools/render.mjs my-values.env build
(cd build && npm exec -- wrangler dev)
```

Secrets such as `ADMIN_PASSWORD` and `SMTP_PASSWORD` do not belong in the values file. The database is created by the files in `migrations/`. Sign-in goes through Cloudflare Access.

## Set up on Cloudflare

All you need is a temporary token and your domain name. A script creates the resources, fills in the configuration and deploys.

1. **Enable R2** once in the Cloudflare dashboard (R2). It cannot be done through the API.
2. **Create a temporary token** with [this prefilled link](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=Workoholic%20setup%20(temporary)). It must be a **user token** (under My Profile). The Workers Builds API does not accept account-owned tokens, so with one the script cannot set the build commands. The link only fills in the form, and entries that are not recognised are dropped without an error, so check that D1, R2, Workers Scripts and Workers KV Storage show up. Add **Secrets Store: Edit**, **Workers CI: Edit** (so the script can set the build commands) and, for a custom domain, **Workers Routes: Edit** (zone) yourself. The link sets the scope to all accounts and all zones. Under Account Resources, select only the account you use for Workoholic, then submit the form.
3. Run:

   ```sh
   cp setup.example.env setup.env      # fill in CLOUDFLARE_API_TOKEN and PUBLIC_HOST
   npm ci --legacy-peer-deps
   npm run setup:cloudflare -- --check       # shows what would be created, changes nothing
   npm run setup:cloudflare               # creates D1, R2 and the key, migrates and deploys
   ```

4. A generated sign-in password is written to `.setup-secrets` (readable by the owner only). Save it and delete the file. KV also holds a temporary copy (namespace `workoholic-config`, key `first-login`); delete that key too once all setup runs have finished. If the file is missing after an interrupted run, the password is in that KV key.
5. Connect the repo under Workers & Pages → workoholic → Settings → Builds and run `npm run setup:cloudflare` again (the token is still needed). The script then sets the build and deploy commands itself. The settings (no secrets) are stored in a KV namespace, `workoholic-config`, and the build reads them from there, so no build variables are needed. Without the **Workers CI: Edit** permission the script prints the two commands to fill in by hand instead. If the build cannot read KV, the same output has a fallback with build variables. **Delete the temporary token** in the dashboard only once this step is done.

The script is safe to run again: existing resources are reused, and the encryption key `WORKOHOLIC_CONFIG_KEY` is never replaced.

**Afterwards**
- **Running setup again:** for the first setup and for changing settings, for example switching login to Cloudflare Access (`AUTH=access` plus `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `setup.env`). A rerun needs a token with the setup permissions (D1, R2, Workers Scripts, Workers KV, Secrets Store and Workers CI). If you deleted the first one, create a new one with the link in step 2. Only one run at a time is allowed per checkout (`.setup-lock`). If you run the script from several checkouts, coordinate the runs yourself, otherwise two passwords can be generated and only the last one works.
- **Code changes and new migrations** on a running installation go through Workers Builds. If the build stops at the migration step, the default Workers Builds token may lack D1 access. Pick your own token with D1: Edit, Workers Scripts: Edit and Workers KV Storage: Read (the build reads the settings from KV) under Settings → Builds → API token.
- **Further secrets**, for example `STUDENTCONSULTING_EMAIL` and `STUDENTCONSULTING_PASSWORD`, go in the file `secrets.env` (`NAME=value` lines, git-ignored) and are sent with `npm run secrets:push`. Only the names are printed. A token with Workers Scripts: Edit as `CLOUDFLARE_API_TOKEN` in `setup.env` is enough.
- **Requirements:** Node 22.12 or newer (Node loads `setup.env` with `--env-file-if-exists`) and macOS, Linux or WSL. The scripts do not run directly on Windows.

`docker/entrypoint.sh` renders and starts the app from environment variables in a container, with data in `/data`.

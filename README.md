# IMF Backend

Production-grade Node.js + Express API with MySQL. Powers the IMF frontend (members, deposits, gallery, board, messages, settings, auth).

## Prerequisites

- Node.js 18+
- MySQL 8+ (or MariaDB)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and set your MySQL credentials, auth secret, CORS, and ImageKit keys:

   ```env
   PORT=8000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=imf_db

   # Auth
   JWT_SECRET=your-secret-key-change-in-production
   JWT_EXPIRES_IN=7d

   # ImageKit (so images still load even if this server sleeps)
   IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
   IMAGEKIT_PUBLIC_KEY=your_public_key
   IMAGEKIT_PRIVATE_KEY=your_private_key
   ```

3. **Create database and tables**

   ```bash
   npm run db:migrate
   ```

4. **Run the API**

   ```bash
   npm run dev
   ```

   API base URL: `http://localhost:8000`

## Frontend configuration

In the frontend (`imf_frontend-main`), set in `.env` or `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SKIP_AUTH=false
```

Use `NEXT_PUBLIC_SKIP_AUTH=true` only for local dev without backend. For real login, set it to `false` and ensure at least one Admin user exists in `members` (with `user_type = 'Admin'`).

## API overview

| Method | Path | Description |
|--------|------|-------------|
| **Auth** | | |
| POST | /api/web/v1/authentication/login/ | Login (body: email, password). Returns access_token, refresh_token. |
| **Users (members)** | | |
| GET | /api/web/v1/users/me/ | Current user profile (requires Bearer token). |
| GET | /api/web/v1/users/list/ | List members (query: limit, offset). |
| GET | /api/web/v1/users/:uuid/ | Get one member. |
| POST | /api/web/v1/users/ | Create member (JSON or multipart with profile_picture). |
| PATCH | /api/web/v1/users/:uuid/update/ | Update member. |
| DELETE | /api/web/v1/users/:uuid/ | Delete member. |
| **Deposits** | | |
| GET | /api/web/v1/deposits/list/ | List deposits (query: member_uuid?, limit, offset). |
| GET | /api/web/v1/deposits/stats/ | Dashboard stats (total, monthly, yearly). |
| GET | /api/web/v1/deposits/:uuid/ | Get one deposit. |
| POST | /api/web/v1/deposits/ | Create deposit. |
| PATCH | /api/web/v1/deposits/:uuid/ | Update deposit. |
| DELETE | /api/web/v1/deposits/:uuid/ | Delete deposit. |
| **Gallery** | | |
| GET | /api/web/v1/gallery/list/ | List gallery (query: category?, limit, offset). |
| GET | /api/web/v1/gallery/:uuid/ | Get one item. |
| POST | /api/web/v1/gallery/ | Create (multipart: image, title, category?, date?, alt?). |
| PATCH | /api/web/v1/gallery/:uuid/ | Update. |
| DELETE | /api/web/v1/gallery/:uuid/ | Delete. |
| **Board** | | |
| GET | /api/web/v1/board/list/ | List board members. |
| GET | /api/web/v1/board/:uuid/ | Get one. |
| POST | /api/web/v1/board/ | Create (multipart: profile_picture optional). |
| PATCH | /api/web/v1/board/:uuid/ | Update. |
| DELETE | /api/web/v1/board/:uuid/ | Delete. |
| **Messages** | | |
| POST | /api/web/v1/messages/ | Submit contact form (no auth). |
| GET | /api/web/v1/messages/list/ | List messages (query: limit, offset). |
| **Settings** | | |
| GET | /api/web/v1/settings/ | Get site settings (public). |
| PATCH | /api/web/v1/settings/ | Update settings (requires auth). |
| POST | /api/web/v1/settings/logo | Upload logo/favicon + text (multipart, requires auth). |

## Auth behavior

- **Login**: POST to `/api/web/v1/authentication/login/` with `{ email, password }`. Returns `{ access_token, refresh_token }`. Use `access_token` as `Authorization: Bearer <token>`.
- **Development**: Requests without a token are allowed so the frontend can use `NEXT_PUBLIC_SKIP_AUTH=true` or during development.
- **Production** (`NODE_ENV=production`): Protected routes require a valid Bearer token. GET `/api/web/v1/settings/` and POST `/api/web/v1/messages/` remain public.

## Initial admin from environment (production)

Set these in `.env` so the first run creates an admin user (only when **no** Admin exists yet):

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
ADMIN_NAME=Admin
```

- On startup, if there is no user with `user_type = 'Admin'`, the backend creates one with that email and password.
- If an Admin already exists, these env vars are ignored (no overwrite).
- The admin can later change their login email and password from **Dashboard → Settings → Security (Admin account)**.

## Creating an admin manually

Alternatively, use the frontend **Members** page (with skip-auth or as another admin) to add a member and set **User type** to **Admin**, or insert via SQL (hash the password with bcrypt first).

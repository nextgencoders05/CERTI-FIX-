# GitHub Chrome Web Upload Guide

This ZIP is prepared for **GitHub in Chrome**. It contains no hidden dot-files or dot-folders, so browser folder upload will not silently skip `.github`, `.env.example`, `.gitignore`, or `.dockerignore`.

## 1. Upload the project

1. Create an empty repository on GitHub.
2. Open the repository in Chrome.
3. Choose **Add file → Upload files**.
4. Extract this ZIP on your PC, open the extracted `CertiFix-AI` project folder, select its contents, and drag them into GitHub's upload area.
5. Wait for the upload to finish, enter a commit message, and click **Commit changes**.

Do not upload the ZIP itself; extract it first. Keep the project folder structure intact (`backend`, `frontend`, `docs`, `scripts`, and `github-workflows`).

## 2. Add the GitHub Pages deployment workflow (one manual hidden-path step)

GitHub Actions only discovers workflow files inside the exact hidden path `.github/workflows/`. The ZIP therefore keeps the workflow in the visible folder `github-workflows/` so Chrome can upload it.

1. In your repository, open `github-workflows/deploy-pages.yml`.
2. Click **Copy raw file** (or open the file and copy its complete contents).
3. Go back to the repository's main page. Choose **Add file → Create new file**.
4. In the filename field, enter exactly: `.github/workflows/deploy-pages.yml`
5. Paste the complete workflow content and click **Commit changes**.

Optional CI workflow: repeat the same steps using `github-workflows/ci.yml` and the destination filename `.github/workflows/ci.yml`.

## 3. Enable GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to finish.
4. Your site will be published at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/` (unless this is a `YOUR-USERNAME.github.io` user site).

The deployment workflow builds the React frontend. The FastAPI backend is **not hosted by GitHub Pages**; the Pages build uses the frontend's built-in browser/local demo backend. To use the full server API and persistent database, deploy the backend separately using the Docker or VM instructions in `docs/DEPLOYMENT.md`.

## 4. Environment and optional dot-files

- Example environment files are visible as `env.example`, `backend/env.example`, and `frontend/env.example`. When setting up locally, copy each to a file named `.env` in the same folder and edit the values. Never commit real secrets.
- `GITIGNORE_TEMPLATE.txt` contains the recommended root ignore rules. If desired, create a new repository file named `.gitignore` using **Add file → Create new file**, then paste its contents.
- The `DOCKERIGNORE_TEMPLATE.txt` files contain optional Docker build-context ignore rules. If you use Docker, create `.dockerignore` in the corresponding folder via **Add file → Create new file** and paste the matching template. Docker does not require these files for the app to run, but they keep build contexts smaller.

## Important

GitHub's web uploader can upload ordinary visible files and folders, but GitHub Actions requires the `.github/workflows/` path. There is no supported way to make GitHub Actions discover a workflow from a differently named visible folder. This package removes that hidden-path upload obstacle by making the workflow available as a normal visible file and giving you the one-time browser-only file-creation step.

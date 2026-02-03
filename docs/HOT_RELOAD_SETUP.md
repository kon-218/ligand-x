# Hot Reloading Setup for Frontend

This setup enables hot reloading for the frontend during development, so you don't need to rebuild the Docker image every time you make code changes.

## How It Works

- The frontend container runs Next.js in development mode (`npm run dev`)
- Your local `frontend/` directory is mounted as a volume into the container
- Changes to files are automatically detected and the page reloads

## Usage

### Start with Hot Reloading

```bash
docker compose up frontend
```

Or to start all services:

```bash
docker compose up
```

### Making Changes

1. Edit any file in the `frontend/` directory
2. Save the file
3. The browser will automatically reload (or show a "Fast Refresh" indicator)
4. No need to rebuild or restart!

### Switch Back to Production Build

To use the production build instead, change `docker-compose.yml`:

```yaml
frontend:
  build:
    dockerfile: Dockerfile.frontend  # Change from Dockerfile.frontend.dev
  # Remove the volumes section
```

Then rebuild:
```bash
docker compose build frontend
docker compose up
```

## Notes

- The first startup may take a moment as dependencies are installed
- Hot reloading works for:
  - React components (Fast Refresh)
  - CSS/SCSS files
  - TypeScript/JavaScript files
  - Configuration files (may require restart)
- Node modules are not mounted (uses container's version for consistency)
- `.next` build directory is excluded from volume mount

## Troubleshooting

If hot reloading doesn't work:

1. Check that volumes are mounted correctly:
   ```bash
   docker compose exec frontend ls -la /app
   ```

2. Ensure file permissions are correct (files should be readable)

3. Check Next.js dev server logs:
   ```bash
   docker compose logs -f frontend
   ```

4. Try restarting the container:
   ```bash
   docker compose restart frontend
   ```









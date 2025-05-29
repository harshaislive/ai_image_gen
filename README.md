# Minimalist OpenAI Image Generator

A minimalist, Replicate-style app for OpenAI text-to-image and image-to-image generation.

## Features
- Text-to-image: Enter a prompt, get an image.
- Image-to-image: Upload an image, enter a prompt, get an edited image.
- Minimalist, modern UI (React + Tailwind CSS).
- Backend proxy for OpenAI API (API key never exposed).

## Setup (Monorepo)

1. Copy `backend/.env.example` to `backend/.env` and add your OpenAI API key.
2. Install all dependencies for both backend and frontend:
   ```sh
   npm run install-all
   ```
3. Start both backend and frontend together:
   ```sh
   npm run dev
   ```

- The frontend will be available at `http://localhost:5173` (or your configured port).
- The backend will be available at `http://localhost:5000` (or your configured port).

You can still run each part individually from their own folders if needed.

## Notes
- The backend proxies all OpenAI requests; your API key is never sent to the frontend.
- For production, add proper rate limiting and security.

---

Built by [Your Name].

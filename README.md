# Minimalist OpenAI Image Generator

A minimalist, Replicate-style app for OpenAI text-to-image and image-to-image generation.

## Features
- Text-to-image: Enter a prompt, get an image.
- Image-to-image: Upload an image, enter a prompt, get an edited image.
- Minimalist, modern UI (React + Tailwind CSS).
- Backend proxy for OpenAI API (API key never exposed).

## Setup

### Backend
1. Copy `backend/.env.example` to `backend/.env` and add your OpenAI API key.
2. Install dependencies:
   ```sh
   cd backend
   npm install
   ```
3. Start the backend:
   ```sh
   npm run dev
   ```

### Frontend
1. Install dependencies:
   ```sh
   cd frontend
   npm install
   ```
2. Start the frontend:
   ```sh
   npm run dev
   ```

The app will be available at `http://localhost:5173` (frontend) and `http://localhost:5000` (backend).

## Notes
- The backend proxies all OpenAI requests; your API key is never sent to the frontend.
- For production, add proper rate limiting and security.

---

Built by [Your Name].

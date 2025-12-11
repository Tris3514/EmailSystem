# Email System

AI-powered email generation and sending system built with Next.js.

## Features

- Multiple account management with SMTP configuration
- AI-powered message generation using OpenAI
- Multiple conversation management
- Scheduled email sending with random delays
- Dark mode UI with custom font

## Deployment to GitHub Pages

This project is configured to deploy to GitHub Pages. However, **API routes must be hosted separately** since GitHub Pages only serves static files.

### Step 1: Deploy API Routes

The API routes (`/api/generate-message` and `/api/send-email`) need to be deployed to a platform that supports serverless functions:

**Option A: Vercel (Recommended)**
1. Create a new project on [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables:
   - `OPENAI_API_KEY` - Your OpenAI API key
4. Deploy - Vercel will automatically detect Next.js and deploy
5. Copy your Vercel deployment URL (e.g., `https://your-project.vercel.app`)

**Option B: Netlify**
1. Create a new site on [Netlify](https://netlify.com)
2. Connect your GitHub repository
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Add environment variables:
   - `OPENAI_API_KEY` - Your OpenAI API key
5. Deploy

### Step 2: Configure GitHub Pages

1. Go to your GitHub repository settings
2. Navigate to "Pages" section
3. Under "Source", select "GitHub Actions"
4. Add a GitHub secret:
   - Go to Settings → Secrets and variables → Actions
   - Add secret: `NEXT_PUBLIC_API_URL` with your API deployment URL (e.g., `https://your-project.vercel.app`)

### Step 3: Deploy

1. Push your code to the `main` branch
2. GitHub Actions will automatically build and deploy to GitHub Pages
3. Your site will be available at: `https://yourusername.github.io/repository-name/`

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```
OPENAI_API_KEY=your_openai_api_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

- `OPENAI_API_KEY` - Required for AI message generation
- `NEXT_PUBLIC_API_URL` - API base URL (only needed for GitHub Pages deployment)

## Project Structure

- `app/` - Next.js app directory
  - `api/` - API routes (must be deployed separately)
  - `page.tsx` - Main application page
- `components/` - React components
- `.github/workflows/` - GitHub Actions workflow for deployment

## Notes

- The frontend uses localStorage to persist accounts and conversations
- API routes require server-side execution and cannot run on GitHub Pages
- For production, ensure your API routes are properly secured and rate-limited


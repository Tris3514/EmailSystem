# Email System

AI-powered email generation and sending system built with Next.js.

## Features

- Multiple account management with SMTP configuration
- AI-powered message generation using OpenAI
- Multiple conversation management
- Scheduled email sending with random delays
- Dark mode UI with custom font

## Deployment Options

This project can be deployed to multiple platforms:

### Azure App Service (Recommended for Enterprise)

Full deployment guide available in [AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md)

**Quick Start:**
1. Create Azure App Service (Node.js 20 LTS)
2. Set environment variables in Azure Portal:
   - `OPENAI_API_KEY` (required)
   - `GOOGLE_SHEETS_CREDENTIALS` (optional)
   - `NEXT_PUBLIC_APP_PASSWORD` (optional)
3. Deploy via GitHub Actions or Azure CLI
4. Set startup command: `node server.js`

See [AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md) for detailed instructions.

### Vercel (Recommended for Quick Deploy)

This project is configured to deploy to Vercel, which supports full Next.js with API routes.

### Step 1: Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in with your GitHub account
2. Click "Add New Project"
3. Import your GitHub repository (`Tris3514/EmailSystem`)
4. Vercel will automatically detect Next.js
5. Add environment variables:
   - `OPENAI_API_KEY` - Your OpenAI API key (required for message generation)
   - `NEXT_PUBLIC_APP_PASSWORD` - Password to protect access to the application (optional, defaults to "password123")
6. Click "Deploy"
7. Your site will be live at: `https://your-project.vercel.app`

### Step 2: Configure Environment Variables

In your Vercel project settings:
1. Go to Settings → Environment Variables
2. Add:
   - `OPENAI_API_KEY` = your OpenAI API key
   - `NEXT_PUBLIC_APP_PASSWORD` = your secure password (optional, defaults to "password123")
3. Redeploy if needed for changes to take effect

### Step 3: Access Your Site

Once deployed, your site will be available at your Vercel URL. Vercel automatically:
- Deploys on every push to `main` branch
- Provides HTTPS
- Handles API routes serverlessly
- Supports custom domains (optional)

## Alternative: GitHub Pages Deployment

If you prefer GitHub Pages, you'll need to:
1. Deploy API routes separately (e.g., to Vercel)
2. Set `NEXT_PUBLIC_API_URL` environment variable
3. Use static export (see `next.config.js` for configuration)

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file:
```
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_APP_PASSWORD=your_secure_password_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

- `OPENAI_API_KEY` - **Required** for AI message generation. Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- `GOOGLE_SHEETS_CREDENTIALS` - **Optional** JSON string of service account credentials for Google Sheets integration
- `NEXT_PUBLIC_APP_PASSWORD` - **Optional** password to protect access (defaults to "password123")
- `NEXT_PUBLIC_API_URL` - **Optional** API base URL (only needed for static deployments like GitHub Pages)
- `AZURE_DEPLOYMENT` - **Optional** set to "true" when deploying to Azure App Service
- `NODE_ENV` - **Optional** set to "production" for production deployments

See [.env.example](./.env.example) for reference.

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


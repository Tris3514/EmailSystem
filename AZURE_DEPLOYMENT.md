# Azure App Service Deployment Guide

This guide will help you deploy the Email System webapp to Microsoft Azure App Service while maintaining OpenAI integration.

## Prerequisites

1. **Azure Account**: Sign up at [azure.com](https://azure.com) if you don't have one
2. **Azure CLI**: Install from [Azure CLI docs](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
3. **GitHub Account**: For CI/CD deployment
4. **OpenAI API Key**: Get from [platform.openai.com](https://platform.openai.com/api-keys)
5. **Google Sheets Credentials** (optional): If using Google Sheets integration

## Step 1: Create Azure App Service

### Option A: Using Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource"
3. Search for "Web App" and select it
4. Click "Create"
5. Fill in the form:
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new or use existing
   - **Name**: `email-system-app` (must be globally unique)
   - **Publish**: Code
   - **Runtime stack**: Node.js 20 LTS
   - **Operating System**: **Linux** (recommended) or Windows
   - **Region**: Choose closest to your users
   - **App Service Plan**: Create new (Basic B1 minimum recommended)
   
   **Note**: Linux is recommended for better performance and lower cost. Windows requires `web.config` (already included).
6. Click "Review + create", then "Create"
7. Wait for deployment to complete

### Option B: Using Azure CLI

```bash
# Login to Azure
az login

# Create resource group
az group create --name email-system-rg --location eastus

# Create App Service plan
az appservice plan create \
  --name email-system-plan \
  --resource-group email-system-rg \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --name email-system-app \
  --resource-group email-system-rg \
  --plan email-system-plan \
  --runtime "NODE:20-lts"
```

## Step 2: Configure Environment Variables

### In Azure Portal:

1. Navigate to your App Service
2. Go to **Configuration** → **Application settings**
3. Click **+ New application setting** and add:

   **Required:**
   - `OPENAI_API_KEY` = `your-openai-api-key-here`
   - `NODE_ENV` = `production`
   - `AZURE_DEPLOYMENT` = `true`

   **Optional:**
   - `NEXT_PUBLIC_APP_PASSWORD` = `your-secure-password` (defaults to "password123")
   - `GOOGLE_SHEETS_CREDENTIALS` = `{"type":"service_account",...}` (JSON string, if using Google Sheets)

4. Click **Save** (this will restart your app)

### Using Azure CLI:

```bash
az webapp config appsettings set \
  --name email-system-app \
  --resource-group email-system-rg \
  --settings \
    OPENAI_API_KEY="your-openai-api-key" \
    NODE_ENV="production" \
    AZURE_DEPLOYMENT="true" \
    NEXT_PUBLIC_APP_PASSWORD="your-password"
```

## Step 3: Configure Deployment

### Option A: GitHub Actions (Recommended)

1. **Get Publish Profile:**
   - In Azure Portal, go to your App Service
   - Click **Get publish profile** (downloads `.PublishSettings` file)
   - Open the file and copy its contents

2. **Add GitHub Secret:**
   - Go to your GitHub repository
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - Value: Paste the entire contents of the `.PublishSettings` file
   - Click **Add secret**

3. **Add Other Secrets:**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `GOOGLE_SHEETS_CREDENTIALS`: Your Google Sheets credentials JSON (if using)
   - `NEXT_PUBLIC_APP_PASSWORD`: Your app password (optional)

4. **Update Workflow:**
   - Edit `.github/workflows/azure-deploy.yml`
   - Update `AZURE_WEBAPP_NAME` to match your App Service name

5. **Deploy:**
   - Push to `main` branch or manually trigger workflow
   - Check Actions tab for deployment status

### Option B: Direct Git Deployment

```bash
# In Azure Portal:
# 1. Go to Deployment Center
# 2. Select Source: Local Git
# 3. Copy the Git clone URL

# In your local repository:
git remote add azure <your-azure-git-url>
git push azure main
```

### Option C: Azure CLI Deployment

```bash
# Build locally
npm run build

# Deploy using Azure CLI
az webapp up \
  --name email-system-app \
  --resource-group email-system-rg \
  --runtime "NODE:20-lts"
```

## Step 4: Configure Startup Command

### For Linux App Service (Recommended):

1. In Azure Portal, go to **Configuration** → **General settings**
2. Set **Startup Command** to one of:
   - `npm start` (uses server.js via package.json)
   - `node server.js` (direct)
   - `./azure-startup.sh` (includes build step if needed)
3. Click **Save**

**Note**: If deploying via GitHub Actions, the build happens during deployment, so `npm start` or `node server.js` is sufficient.

### For Windows App Service:

The `web.config` file is already included and will automatically use `server.js`.

Or manually set startup command:
```bash
az webapp config set \
  --name email-system-app \
  --resource-group email-system-rg \
  --startup-file "node server.js"
```

## Step 5: Verify Deployment

1. Visit your app URL: `https://your-app-name.azurewebsites.net`
2. You should see the Email System login page
3. Test OpenAI integration by creating a conversation and generating a message

## Troubleshooting

### App won't start
- Check **Log stream** in Azure Portal for errors
- Verify `NODE_ENV=production` is set
- Ensure `server.js` exists in root directory
- Check startup command is set correctly

### OpenAI API errors
- Verify `OPENAI_API_KEY` is set in Application settings
- Check API key is valid and has credits
- Review logs for specific error messages

### Build failures
- Check GitHub Actions logs if using CI/CD
- Verify Node.js version matches (20.x)
- Ensure all dependencies are in `package.json`

### 500 Internal Server Error
- Check Application Insights or Log stream
- Verify environment variables are set correctly
- Ensure Google Sheets credentials are valid JSON (if using)

## Monitoring

1. **Application Insights** (Recommended):
   - Enable in Azure Portal → Application Insights
   - Monitor performance, errors, and usage

2. **Log Stream**:
   - Azure Portal → Log stream
   - Real-time application logs

3. **Metrics**:
   - Azure Portal → Metrics
   - Monitor CPU, memory, requests, etc.

## Scaling

To scale your app:
1. Go to **Scale up** or **Scale out** in Azure Portal
2. **Scale up**: Upgrade to higher App Service Plan (more CPU/memory)
3. **Scale out**: Add more instances (horizontal scaling)

## Cost Optimization

- Use **Basic B1** plan for development (~$13/month)
- Use **Standard S1** for production (~$70/month)
- Enable **Auto-shutdown** for dev/test environments
- Use **Azure Dev/Test pricing** if eligible (50% discount)

## Security Best Practices

1. **Never commit secrets** to Git
2. Use **Azure Key Vault** for sensitive credentials
3. Enable **HTTPS only** in Configuration
4. Set up **Authentication/Authorization** if needed
5. Use **Managed Identity** for Azure resource access

## Next Steps

- Set up custom domain
- Configure SSL/TLS certificates
- Set up staging slots for testing
- Configure backup and disaster recovery
- Set up monitoring alerts

## Support

For issues:
- Check [Azure App Service docs](https://docs.microsoft.com/azure/app-service/)
- Review application logs
- Check [Next.js deployment docs](https://nextjs.org/docs/deployment)


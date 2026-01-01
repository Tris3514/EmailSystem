# Azure Deployment Quick Start

## Prerequisites Checklist
- [ ] Azure account created
- [ ] OpenAI API key obtained
- [ ] GitHub repository ready

## 5-Minute Deployment

### 1. Create Azure App Service (2 min)

```bash
# Login to Azure
az login

# Create resource group
az group create --name email-system-rg --location eastus

# Create App Service plan (Basic B1 - ~$13/month)
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

### 2. Set Environment Variables (1 min)

```bash
az webapp config appsettings set \
  --name email-system-app \
  --resource-group email-system-rg \
  --settings \
    OPENAI_API_KEY="sk-your-key-here" \
    NODE_ENV="production" \
    AZURE_DEPLOYMENT="true"
```

### 3. Configure Startup (30 sec)

```bash
az webapp config set \
  --name email-system-app \
  --resource-group email-system-rg \
  --startup-file "npm start"
```

### 4. Deploy (1 min)

**Option A: GitHub Actions (Recommended)**
1. Get publish profile: Azure Portal → App Service → Get publish profile
2. Add to GitHub Secrets: `AZURE_WEBAPP_PUBLISH_PROFILE`
3. Update `.github/workflows/azure-deploy.yml` with your app name
4. Push to `main` branch

**Option B: Direct Deploy**
```bash
# Build and deploy
npm run build
az webapp up \
  --name email-system-app \
  --resource-group email-system-rg
```

### 5. Verify (30 sec)

Visit: `https://email-system-app.azurewebsites.net`

## Common Issues

**App won't start?**
- Check Log stream in Azure Portal
- Verify `NODE_ENV=production` is set
- Ensure startup command is `npm start`

**OpenAI errors?**
- Verify `OPENAI_API_KEY` is set correctly
- Check API key has credits

**Need help?**
See [AZURE_DEPLOYMENT.md](./AZURE_DEPLOYMENT.md) for detailed guide.


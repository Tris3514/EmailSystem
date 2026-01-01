const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.WEBSITE_SITE_NAME 
  ? `${process.env.WEBSITE_SITE_NAME}.azurewebsites.net`
  : process.env.WEBSITE_HOSTNAME || 'localhost';
const port = process.env.PORT || 3000;

// For Azure App Service, use production mode
const isProduction = process.env.NODE_ENV === 'production' || process.env.AZURE_DEPLOYMENT === 'true';

const app = next({ 
  dev: !isProduction, 
  hostname, 
  port,
  // For Azure, ensure we're using the correct directory
  dir: process.cwd()
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${isProduction ? 'production' : 'development'}`);
  });
});


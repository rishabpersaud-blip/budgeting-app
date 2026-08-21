# Monthly Budget Planner

A mobile-friendly budgeting web app for tracking monthly income, setting category budgets, and monitoring expenses.

## Run locally

Open in a browser:

- http://localhost:8000

Or from the project folder:

```bash
python -m http.server 8000
```

## Host it publicly

This app is a static web app, so it can be deployed to any static host such as:

- Netlify
- Vercel
- GitHub Pages
- Cloudflare Pages

### Netlify steps

1. Push the project to GitHub.
2. Log in to Netlify.
3. Choose “Add new project” and import the repo.
4. Set the publish directory to the project root.
5. Deploy.

### Vercel steps

1. Push the project to GitHub.
2. Import the repo in Vercel.
3. Use the default settings.
4. Deploy.

## Features

- Monthly income tracking
- Add expenses by category and date
- Set spending limits for each category
- View remaining money and recent transactions
- Works as a PWA on mobile devices

## Files

- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js

# Deploy (Server API only)
cd ~
tar -xzf your-backend-directory*.tar.gz
cd your-backend-directory*

cp .env.production.local.TEMPLATE .env.production.local
nano .env.production.local
# Fill: FEED_PRIVATE_KEY, SESSION_SECRET, JWT_SECRET, ADMIN_ADDRESSES, POSTAGE_BATCH_ID, BEE_URLS, NEXT_PUBLIC_BEE_URL

# Generate JWT_SECRET with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm install
npm run build
npm start
# Visit http://localhost:3000/api/profile

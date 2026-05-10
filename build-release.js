const dotenv = require('dotenv');
dotenv.config();

const { execSync } = require('child_process');

if (!process.env.GH_TOKEN) {
  console.error('❌ Error: GH_TOKEN is not set in .env file');
  console.error('Please add your GitHub token to .env file: GH_TOKEN=your_token_here');
  process.exit(1);
}

console.log('✓ GH_TOKEN is set, proceeding with build and release...');

try {
  execSync('vite build && electron-builder --publish always', {
    stdio: 'inherit',
    env: { ...process.env }
  });
} catch (error) {
  process.exit(1);
}

import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  // 1. Light Mode Capture
  const contextLight = await browser.newContext({ colorScheme: 'light' });
  const pageLight = await contextLight.newPage();
  await pageLight.setViewportSize({ width: 1280, height: 800 });
  console.log('Navigating in light mode...');
  await pageLight.goto('http://localhost:5174/');
  await pageLight.waitForSelector('.game-row');
  await pageLight.waitForTimeout(2000);
  const pathLight = '/Users/zijie-machine/.gemini/antigravity/brain/9d380c39-e61c-4f27-afc4-16f485f5ef03/screenshot_final_day.png';
  await pageLight.screenshot({ path: pathLight });
  console.log('Light Mode screenshot saved to:', pathLight);
  
  // 2. Dark Mode Capture
  const contextDark = await browser.newContext({ colorScheme: 'dark' });
  const pageDark = await contextDark.newPage();
  await pageDark.setViewportSize({ width: 1280, height: 800 });
  console.log('Navigating in dark mode...');
  await pageDark.goto('http://localhost:5174/');
  await pageDark.waitForSelector('.game-row');
  await pageDark.waitForTimeout(2000);
  const pathDark = '/Users/zijie-machine/.gemini/antigravity/brain/9d380c39-e61c-4f27-afc4-16f485f5ef03/screenshot_final_dark.png';
  await pageDark.screenshot({ path: pathDark });
  console.log('Dark Mode screenshot saved to:', pathDark);
  
  await browser.close();
}

run().catch(console.error);

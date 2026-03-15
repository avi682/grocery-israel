import https from 'node:https';
import { execSync } from 'node:child_process';

const CHAINS = {
  OSHER_AD: { id: 'אושר עד', chainId: '7290103152017', username: 'osherad' },
  RAMI_LEVY: { id: 'רמי לוי', chainId: '7290058140886', username: 'RamiLevi' },
  SHUFERSAL: { id: 'שופרסל', chainId: '7290027600007', portal: 'https://prices.shufersal.co.il' }
};

async function discoverFtpUrl(chain) {
  console.log(`Testing ${chain.id} discovery...`);
  const ftpHost = 'url.retail.publishedprices.co.il';
  try {
    const cmd = `curl -s ftp://${ftpHost}/ --user ${chain.username}:`;
    const output = execSync(cmd).toString();
    const lines = output.split('\n');
    const priceFiles = lines
      .map(line => line.trim().split(/\s+/).pop())
      .filter(fname => fname && fname.toLowerCase().includes('pricefull') && fname.toLowerCase().includes(chain.chainId) && fname.endsWith('.gz'))
      .sort((a, b) => b.localeCompare(a));
    if (priceFiles.length > 0) {
      console.log(`SUCCESS: Found ${chain.id} URL: ftp://${ftpHost}/${priceFiles[0]}`);
      return true;
    }
  } catch (e) {
    console.error(`FAILED: ${chain.id} error:`, e.message);
  }
  return false;
}

async function discoverShufersalUrl() {
  console.log("Testing Shufersal discovery...");
  const updateUrl = `${CHAINS.SHUFERSAL.portal}/FileObject/UpdateCategory?catID=2`;
  return new Promise((resolve) => {
    https.get(updateUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/href="(.*?PriceFull.*?\.gz)"/);
        if (match) {
          console.log("SUCCESS: Found Shufersal URL:", match[1]);
          resolve(true);
        } else {
          console.warn("FAILED: Could not find Shufersal price file.");
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.error("FAILED: Shufersal error:", e.message);
      resolve(false);
    });
  });
}

async function test() {
  console.log("--- Starting Discovery Tests ---");
  const osher = await discoverFtpUrl(CHAINS.OSHER_AD);
  const rami = await discoverFtpUrl(CHAINS.RAMI_LEVY);
  const shufersal = await discoverShufersalUrl();
  console.log("--- Test Results ---");
  console.log(`Osher Ad: ${osher ? 'PASS' : 'FAIL'}`);
  console.log(`Rami Levy: ${rami ? 'PASS' : 'FAIL'}`);
  console.log(`Shufersal: ${shufersal ? 'PASS' : 'FAIL'}`);
}

test();

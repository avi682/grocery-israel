import { execSync } from 'node:child_process';

async function test() {
  const ftpHost = 'url.retail.publishedprices.co.il';
  const username = 'osherad';
  const cmd = `curl.exe -s ftp://${ftpHost}/ --user ${username}:`;
  
  try {
    console.log(`Running: ${cmd}`);
    const output = execSync(cmd).toString();
    console.log("Raw Output Start---");
    console.log(output);
    console.log("---Raw Output End");
    
    const lines = output.split('\n');
    console.log(`Total lines: ${lines.length}`);
    
    const files = lines
      .map(line => {
          const parts = line.trim().split(/\s+/);
          const fname = parts.pop();
          return { line: line.trim(), fname };
      });
      
    console.log("Parsed Files Sample:", files.slice(0, 5));
    
  } catch (e) {
    console.error("Exec Error:", e.message);
  }
}

test();

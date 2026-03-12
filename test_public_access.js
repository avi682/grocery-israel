import http from 'node:http';

const options = {
    hostname: 'url.publishedprices.co.il',
    path: '/',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
    }
};

http.get(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log('Body snippet:', body.substring(0, 500));
        process.exit(0);
    });
}).on('error', (e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
});

#!/bin/zsh
# CRF Comps — Mac SMS queue sender
# Double-click this file in Finder. It writes the Node.js sender to a temp file,
# runs it, then cleans up. This keeps stdin free for prompts.

TMP_SCRIPT=$(mktemp /tmp/crf-sms-sender.XXXXXX.js)
cat > "$TMP_SCRIPT" <<'CRF_COMPS_SENDER_SCRIPT'
import https from 'https';
import http from 'http';
import readline from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';

const API_BASE = process.env.CRF_API_BASE || 'https://crfcompsf2f-one.vercel.app';

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const isHttps = API_BASE.startsWith('https');
    const lib = isHttps ? https : http;
    const url = new URL(API_BASE + urlPath);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {}
    };
    if (body) options.headers['Content-Type'] = 'application/json';
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (err) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sendWithMessages(phone, message) {
  return new Promise((resolve, reject) => {
    const clean = String(phone).replace(/\s/g, '');
    const scriptPath = `/tmp/crf-sms-${Date.now()}-${Math.floor(Math.random() * 10000)}.scpt`;
    const script = `on run argv
  set phoneNumber to item 1 of argv
  set messageText to item 2 of argv
  try
    tell application "Messages"
      if not running then launch
      set targetService to first service
      set targetBuddy to buddy phoneNumber of targetService
      send messageText to targetBuddy
    end tell
    return "sent"
  on error errMsg
    return "error: " & errMsg
  end try
end run`;
    try {
      fs.writeFileSync(scriptPath, script, 'utf-8');
      const result = execSync(
        `osascript ${JSON.stringify(scriptPath)} ${JSON.stringify(clean)} ${JSON.stringify(message)}`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      try { fs.unlinkSync(scriptPath); } catch (e) {}
      resolve(result.trim());
    } catch (err) {
      try { fs.unlinkSync(scriptPath); } catch (e) {}
      reject(err.stderr || err.message);
    }
  });
}

async function main() {
  console.log('CRF Comps — Mac SMS queue sender');
  console.log('=================================\n');

  const queueId = await prompt('Paste queue code: ');
  if (!queueId) {
    console.log('No code entered. Exiting.');
    return;
  }

  console.log('\nFetching queue ' + queueId + '...');
  const getRes = await request('GET', '/api/sms-queue?id=' + encodeURIComponent(queueId));
  if (getRes.status !== 200 || !Array.isArray(getRes.body.items)) {
    console.error('Could not fetch queue:', getRes.body.error || getRes.status);
    return;
  }

  const items = getRes.body.items;
  const pending = items.filter(i => i.status === 'pending');
  console.log('Queue has ' + items.length + ' message(s), ' + pending.length + ' remaining.\n');

  if (!pending.length) {
    console.log('Nothing to send.');
    return;
  }

  const confirmed = await prompt('Send ' + pending.length + ' messages now? (y/n) ');
  if (confirmed.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.status !== 'pending') continue;

    process.stdout.write('[' + (i + 1) + '/' + items.length + '] ' + item.name + ' ... ');
    try {
      const result = await sendWithMessages(item.phone, item.message);
      if (result.startsWith('error')) throw new Error(result);

      await request('PATCH', '/api/sms-queue?id=' + encodeURIComponent(queueId), {
        lead_id: item.lead_id,
        status: 'sent'
      });
      console.log('sent');
      sent++;
    } catch (err) {
      console.log('FAILED: ' + err);
      failed++;
    }
  }

  console.log('\nDone. ' + sent + ' sent, ' + failed + ' failed.');
  console.log('Refresh CRF Comps to see updated statuses.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
CRF_COMPS_SENDER_SCRIPT

node "$TMP_SCRIPT"
rm -f "$TMP_SCRIPT"

echo ""
echo "Press Enter to close..."
read

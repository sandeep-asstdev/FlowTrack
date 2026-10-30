/**
 * FlowTrack CLI Utility: Test OTP Dispatch
 *
 * Usage:
 *   pnpm --filter @flowtrack/api run test:otp -- +919876543210
 */
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../../.env'));

import { ConsoleChannel } from '../src/modules/auth/channels/console.channel';
import { ReltigrowWhatsAppChannel } from '../src/modules/auth/channels/reltigrow-whatsapp.channel';

async function main() {
  const targetPhone = process.argv[2] || '+919876543210';
  const cleanPhone = targetPhone.startsWith('+') ? targetPhone : `+91${targetPhone.replace(/\D/g, '')}`;
  const testCode = Math.floor(100000 + Math.random() * 900000).toString();

  console.log(`[TEST-OTP] Target Phone: ${cleanPhone}`);
  console.log(`[TEST-OTP] Generated Code: ${testCode}`);

  const reltigrowKey = process.env.RELTIGROW_API_KEY;
  const hasReltigrowKey = Boolean(reltigrowKey && reltigrowKey !== 'placeholder_reltigrow_api_key' && reltigrowKey.length > 5);
  console.log(`[TEST-OTP] Reltigrow API Key Configured: ${hasReltigrowKey}`);

  let channel: any;
  if (hasReltigrowKey) {
    console.log('[TEST-OTP] Using ReltigrowWhatsAppChannel (Live WhatsApp Business API)');
    channel = new ReltigrowWhatsAppChannel();
  } else {
    console.log('[TEST-OTP] Using ConsoleChannel (Simulated dev channel)');
    channel = new ConsoleChannel();
  }

  console.log('[TEST-OTP] Dispatching test code...');
  const result = await channel.send(cleanPhone, testCode, 'TEST');

  console.log('\n--- Result Payload ---');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✓ Test OTP dispatched successfully!');
  } else {
    console.error(`\n✗ Test OTP failed: ${result.error} (Code: ${result.errorCode})`);
  }
}

main().catch((err) => {
  console.error('[TEST-OTP] Fatal error:', err);
  process.exit(1);
});

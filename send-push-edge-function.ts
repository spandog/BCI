// Supabase Edge Function: send-push
// Receives an event from the site, builds a notification, and sends it via
// Firebase Cloud Messaging to every subscribed device stored in
// bci_push_subscriptions. Deploy this via the Supabase Dashboard's Edge
// Functions editor (no CLI needed) — see the setup notes sent alongside this.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);
const PUSH_SHARED_SECRET = Deno.env.get('PUSH_SHARED_SECRET')!;
const FIREBASE_PROJECT_ID = FIREBASE_SERVICE_ACCOUNT.project_id;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-BCI-Push-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function clamp(s: string, max: number): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}

// ---------- turn a site event into a notification title/body ----------
// deno-lint-ignore no-explicit-any
function buildMessage(type: string, payload: any): { title: string; body: string } | null {
  if (type === 'hole-milestone') {
    const leaderName = payload.leader === 'baber' ? 'Baber' : payload.leader === 'weff' ? 'Weff' : null;
    const scoreText = leaderName ? `${leaderName} ${payload.score}` : 'All square';
    return {
      title: `Match ${payload.matchNo} — thru ${payload.thru}`,
      body: clamp(`${scoreText} · ${payload.baber} vs ${payload.weff}`, 180),
    };
  }
  if (type === 'matches-announced') {
    const count = Array.isArray(payload.matches) ? payload.matches.length : 0;
    return {
      title: `Day ${payload.day} lineup is set`,
      body: count === 1 ? '1 match now has players and a tee time' : `${count} matches now have players and tee times`,
    };
  }
  if (type === 'manual-announcement') {
    return { title: clamp(payload.title || 'Book Club Invitational', 80), body: clamp(payload.body || '', 200) };
  }
  return null;
}

// ---------- exchange the Firebase service account for a short-lived access token ----------
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: FIREBASE_SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${b64url(header)}.${b64url(claim)}`;

  const pem = FIREBASE_SERVICE_ACCOUNT.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${unsigned}.${encodedSig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Google access token: ' + JSON.stringify(data));
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  if (req.headers.get('X-BCI-Push-Secret') !== PUSH_SHARED_SECRET) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  try {
    const { type, payload } = await req.json();
    const message = buildMessage(type, payload || {});
    if (!message) return new Response('Unknown event type', { status: 400, headers: CORS_HEADERS });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase.from('bci_push_subscriptions').select('token');
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, total: 0 }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const accessToken = await getAccessToken();
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;

    let sent = 0;
    const deadTokens: string[] = [];

    await Promise.all(
      subs.map(async (s: { token: string }) => {
        const res = await fetch(fcmUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: s.token,
              notification: { title: message.title, body: message.body },
              webpush: { fcm_options: { link: 'https://bcinvitational.com/leaderboard.html' } },
            },
          }),
        });
        if (res.ok) {
          sent++;
        } else {
          const err = await res.json().catch(() => ({}));
          const status = err?.error?.status;
          if (status === 'NOT_FOUND' || status === 'INVALID_ARGUMENT' || status === 'UNREGISTERED') {
            deadTokens.push(s.token);
          }
        }
      })
    );

    if (deadTokens.length) {
      await supabase.from('bci_push_subscriptions').delete().in('token', deadTokens);
    }

    return new Response(
      JSON.stringify({ sent, total: subs.length, cleaned: deadTokens.length }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});

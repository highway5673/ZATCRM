import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_COOLDOWN_MS = 60 * 1000
const MAX_SENDS_PER_HOUR = 5

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { phone } = await req.json()
    if (!phone) return fail('缺少手机号')

    const normalized = phone.replace(/\D/g, '').replace(/^86/, '')
    if (normalized.length !== 11) return fail('手机号格式不正确')

    const recentCodes = await dbGet(
      `otp_codes?phone=eq.${normalized}&created_at=gte.${encodeURIComponent(
        new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      )}&order=created_at.desc`,
    )
    const latestCode = recentCodes[0]
    if (latestCode && Date.now() - new Date(latestCode.created_at).getTime() < SEND_COOLDOWN_MS) {
      return fail('验证码发送太频繁，请稍后再试')
    }
    if (recentCodes.length >= MAX_SENDS_PER_HOUR) {
      return fail('验证码发送次数过多，请一小时后再试')
    }

    // 本地生成6位验证码，通过 DYPNS 发送
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString()

    const result = await callDypns('SendSmsVerifyCode', {
      PhoneNumber: normalized,
      SignName: Deno.env.get('ALIYUN_SIGN_NAME')!,
      TemplateCode: Deno.env.get('ALIYUN_TEMPLATE_CODE')!,
      TemplateParam: JSON.stringify({ code: verifyCode, min: '5' }),
    })

    console.log('SendSmsVerifyCode response:', JSON.stringify(result))

    if (result.Code !== 'OK') {
      return fail(result.Message || `短信发送失败(${result.Code})`)
    }

    const codeHash = await sha256(verifyCode + normalized)

    await dbPatch(
      `otp_codes?phone=eq.${normalized}&used=eq.false`,
      { used: true },
    )
    await dbPost('otp_codes', {
      phone: normalized,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 0,
    })

    return ok({ message: '验证码已发送' })
  } catch (e) {
    console.error('send-otp error:', e)
    return fail('服务异常，请稍后重试')
  }
})

async function dbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`dbGet failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function callDypns(action: string, extraParams: Record<string, string>) {
  const params: Record<string, string> = {
    AccessKeyId: Deno.env.get('ALIYUN_ACCESS_KEY_ID')!,
    Action: action,
    Format: 'JSON',
    RegionId: 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID().replace(/-/g, ''),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
    ...extraParams,
  }

  const sortedKeys = Object.keys(params).sort()
  const canonicalQuery = sortedKeys.map(k => `${pct(k)}=${pct(params[k])}`).join('&')
  const stringToSign = `POST&${pct('/')}&${pct(canonicalQuery)}`
  const signature = await hmacSha1(Deno.env.get('ALIYUN_ACCESS_KEY_SECRET')! + '&', stringToSign)

  const body = new URLSearchParams({ ...params, Signature: signature })
  const res = await fetch('https://dypnsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return res.json()
}

async function dbPatch(path: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`dbPatch failed: ${res.status} ${await res.text()}`)
}

async function dbPost(table: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`dbPost failed: ${res.status} ${await res.text()}`)
}

function pct(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

async function hmacSha1(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function fail(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

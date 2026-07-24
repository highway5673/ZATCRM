import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_VERIFY_ATTEMPTS = 5

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { phone, code } = await req.json()
    if (!phone || !code) return fail('参数不完整')

    const normalized = phone.replace(/\D/g, '').replace(/^86/, '')
    if (normalized.length !== 11 || !/^\d{6}$/.test(code)) return fail('参数格式不正确')
    const codeHash = await sha256(code + normalized)

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/otp_codes?phone=eq.${normalized}&used=eq.false&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
      },
    )
    const rows = await res.json()
    const record = rows?.[0]

    if (!record) return fail('验证码不存在或已使用')
    if (new Date(record.expires_at) < new Date()) {
      await markOtp(record.id, { used: true })
      return fail('验证码已过期，请重新获取')
    }
    if ((record.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
      await markOtp(record.id, { used: true })
      return fail('验证码错误次数过多，请重新获取')
    }
    if (record.code_hash !== codeHash) {
      await markOtp(record.id, { attempts: (record.attempts ?? 0) + 1 })
      return fail('验证码不正确')
    }

    await markOtp(record.id, { used: true })

    const email = `${normalized}@crm.internal`
    const userId = await ensureAuthUser(email, normalized)

    // Issue a one-time random password for this login session
    const sessionPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: sessionPassword,
    })
    if (updateError) throw updateError

    return ok({ verified: true, email, sessionPassword })
  } catch (e) {
    console.error('verify-otp error:', e)
    return fail('服务异常')
  }
})

async function ensureAuthUser(email: string, phone: string): Promise<string> {
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { phone },
  })
  if (!createError && createData.user) return createData.user.id

  // User already exists — find by email via admin REST
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=50`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    },
  )
  const listData = await listRes.json()
  const existing = (listData.users ?? []).find((u: { email: string }) => u.email === email)
  if (existing?.id) return existing.id

  throw new Error(`Could not ensure auth user for ${email}: ${createError?.message}`)
}

async function markOtp(id: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`markOtp failed: ${res.status} ${await res.text()}`)
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

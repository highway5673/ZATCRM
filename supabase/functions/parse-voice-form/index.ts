import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VOLCENGINE_ASR_KEY = Deno.env.get('VOLCENGINE_ASR_KEY')
const VOLCENGINE_ASR_RESOURCE_ID = Deno.env.get('VOLCENGINE_ASR_RESOURCE_ID') ?? 'volc.bigasr.auc'
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
const DEEPSEEK_BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(/\/$/, '')
const DEEPSEEK_MODEL = Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-v4-flash'

const VOLCENGINE_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
const VOLCENGINE_QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'

const FORM_SCHEMAS = {
  customer: {
    required: ['name'],
    properties: {
      name: { type: ['string', 'null'] },
      company: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'] },
      wechat: { type: ['string', 'null'] },
      customer_type: { type: ['string', 'null'], enum: ['潜在伙伴', '客户', '伙伴', null] },
      notes: { type: ['string', 'null'] },
    },
  },
  tracking: {
    required: ['content'],
    properties: {
      customer_name: { type: ['string', 'null'] },
      method: { type: ['string', 'null'], enum: ['visit', 'phone', 'wechat', 'email', 'other', null] },
      content: { type: ['string', 'null'] },
    },
  },
  sales: {
    required: ['product_name'],
    properties: {
      customer_name: { type: ['string', 'null'] },
      product_name: { type: ['string', 'null'] },
      quantity: { type: ['number', 'null'] },
      unit_price: { type: ['number', 'null'] },
      amount: { type: ['number', 'null'] },
      notes: { type: ['string', 'null'] },
    },
  },
  task: {
    required: ['title'],
    properties: {
      customer_name: { type: ['string', 'null'] },
      title: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      reminder: { type: ['string', 'null'], enum: ['today', 'tomorrow', 'none', null] },
    },
  },
} as const

type FormType = keyof typeof FORM_SCHEMAS

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return fail('请求方法不支持', 405)
  if (!VOLCENGINE_ASR_KEY) return fail('服务未配置 VOLCENGINE_ASR_KEY', 500)
  if (!DEEPSEEK_API_KEY) return fail('服务未配置 DEEPSEEK_API_KEY', 500)

  try {
    const formData = await req.formData()
    const audio = formData.get('audio')
    const formType = formData.get('formType')

    if (!(audio instanceof File)) return fail('缺少录音文件')
    if (!isFormType(formType)) return fail('表单类型不正确')

    const transcript = await transcribe(audio)
    const fields = await parseTranscript(transcript, formType)

    return ok({ transcript, fields })
  } catch (error) {
    console.error('parse-voice-form error:', error)
    return fail(error instanceof Error ? error.message : '语音处理失败', 500)
  }
})

async function transcribe(audio: File): Promise<string> {
  const requestId = crypto.randomUUID()
  const format = inferAudioFormat(audio)
  const audioBase64 = base64Encode(new Uint8Array(await audio.arrayBuffer()))
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': VOLCENGINE_ASR_KEY!,
    'X-Api-Resource-Id': VOLCENGINE_ASR_RESOURCE_ID,
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': '-1',
  }

  const submitRes = await fetch(VOLCENGINE_SUBMIT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user: { uid: 'crm-voice-form' },
      audio: {
        data: audioBase64,
        format,
        language: 'zh-CN',
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        show_utterances: true,
      },
    }),
  })

  const submitCode = submitRes.headers.get('X-Api-Status-Code')
  if (submitCode !== '20000000') {
    throw new Error(formatVolcengineError(submitCode, submitRes.headers.get('X-Api-Message'), '语音识别任务提交失败'))
  }

  const result = await pollVolcengineResult(requestId)
  const text = String(result?.result?.text ?? '').trim()
  if (text) return text

  const utterances = result?.result?.utterances
  if (Array.isArray(utterances)) {
    return utterances.map((item) => String(item?.text ?? '').trim()).filter(Boolean).join('\n')
  }

  throw new Error('没有识别到有效语音')
}

async function parseTranscript(transcript: string, formType: FormType) {
  if (!transcript) throw new Error('没有识别到有效语音')

  const prompt = [
    '你是 CRM 表单语音录入助手。',
    `请从中文口语内容中提取字段，只返回这些字段的 JSON：${Object.keys(FORM_SCHEMAS[formType].properties).join('、')}。`,
    '没有听到的字段填 null，不要编造。',
    'method 映射：上门拜访/拜访=visit，电话=phone，微信=wechat，邮件=email，其他=other。',
    'customer_type 只允许：潜在伙伴、客户、伙伴。',
    'reminder 只允许：today、tomorrow、none。',
    `表单类型：${formType}`,
    `语音文本：${transcript}`,
  ].join('\n')

  const res = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你只输出 JSON，不输出解释。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(formatDeepSeekError(res.status, body, '字段解析失败'))

  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error('模型没有返回字段')
  return normalizeFields(JSON.parse(extractJson(content)), formType)
}

function isFormType(value: FormDataEntryValue | null): value is FormType {
  return typeof value === 'string' && value in FORM_SCHEMAS
}

async function pollVolcengineResult(requestId: string) {
  const startedAt = Date.now()
  let delayMs = 1800

  while (Date.now() - startedAt < 60_000) {
    await sleep(delayMs)

    const res = await fetch(VOLCENGINE_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': VOLCENGINE_ASR_KEY!,
        'X-Api-Resource-Id': VOLCENGINE_ASR_RESOURCE_ID,
        'X-Api-Request-Id': requestId,
        'X-Api-Sequence': '-1',
      },
      body: '{}',
    })
    const code = res.headers.get('X-Api-Status-Code')
    const message = res.headers.get('X-Api-Message')
    const body = await res.json().catch(() => null)

    if (code === '20000000' || body?.header?.code === 20000000) return body
    if (code !== '20000001' && code !== '20000002' && body?.header?.code !== 20000001 && body?.header?.code !== 20000002) {
      throw new Error(formatVolcengineError(code, message, '语音识别失败'))
    }

    delayMs = Math.min(delayMs + 700, 5000)
  }

  throw new Error('语音识别超时，请缩短录音后重试')
}

function normalizeFields(fields: Record<string, unknown>, formType: FormType) {
  const schemaFields = FORM_SCHEMAS[formType].properties
  const normalized: Record<string, unknown> = {}

  for (const key of Object.keys(schemaFields)) {
    const value = fields[key]
    normalized[key] = value === undefined || value === '' ? null : value
  }

  return normalized
}

function extractJson(content: string) {
  const text = content.trim()
  if (text.startsWith('{') && text.endsWith('}')) return text
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('模型返回的字段不是 JSON')
  return match[0]
}

function inferAudioFormat(audio: File) {
  const type = audio.type.toLowerCase()
  const name = audio.name.toLowerCase()
  if (type.includes('mpeg') || type.includes('mp3') || name.endsWith('.mp3')) return 'mp3'
  if (type.includes('wav') || name.endsWith('.wav')) return 'wav'
  if (type.includes('aac') || name.endsWith('.aac')) return 'aac'
  if (type.includes('ogg') || name.endsWith('.ogg')) return 'ogg'
  if (type.includes('amr') || name.endsWith('.amr')) return 'amr'
  if (type.includes('opus') || name.endsWith('.opus')) return 'opus'
  return 'm4a'
}

function base64Encode(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatVolcengineError(code: string | null, message: string | null, fallback: string) {
  if (code === '401' || code === '40000001') return '火山语音识别密钥无效，请检查 VOLCENGINE_ASR_KEY'
  if (code === '40000003') return '音频格式不支持，请重新录音后再试'
  return message ? `${fallback}: ${message}` : fallback
}

function formatDeepSeekError(status: number, body: unknown, fallback: string) {
  const message = typeof body === 'object' && body && 'error' in body
    ? (body as { error?: { message?: string } }).error?.message ?? ''
    : ''

  if (status === 401 || message.toLowerCase().includes('incorrect api key')) {
    return '字段分析服务密钥无效，请检查 DEEPSEEK_API_KEY'
  }
  if (status === 429) return '字段分析服务请求过于频繁，请稍后再试'
  return message || fallback
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function fail(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

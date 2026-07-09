import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-4o-mini-transcribe'
const PARSE_MODEL = Deno.env.get('OPENAI_PARSE_MODEL') ?? 'gpt-4o-mini'

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
  if (!OPENAI_API_KEY) return fail('服务未配置 OPENAI_API_KEY', 500)

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
  const data = new FormData()
  data.append('file', audio, audio.name || 'voice-form.m4a')
  data.append('model', TRANSCRIBE_MODEL)
  data.append('response_format', 'json')
  data.append('language', 'zh')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: data,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message ?? '转写失败')

  return String(body?.text ?? '').trim()
}

async function parseTranscript(transcript: string, formType: FormType) {
  if (!transcript) throw new Error('没有识别到有效语音')

  const schema = buildJsonSchema(formType)
  const prompt = [
    '你是 CRM 表单语音录入助手。',
    '请从中文口语内容中提取字段，只返回符合 schema 的 JSON。',
    '没有听到的字段填 null，不要编造。',
    'method 映射：上门拜访/拜访=visit，电话=phone，微信=wechat，邮件=email，其他=other。',
    'customer_type 只允许：潜在伙伴、客户、伙伴。',
    'reminder 只允许：today、tomorrow、none。',
    `表单类型：${formType}`,
    `语音文本：${transcript}`,
  ].join('\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: PARSE_MODEL,
      messages: [
        { role: 'system', content: 'Extract CRM form fields from Chinese speech.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: `${formType}_voice_fields`,
          strict: true,
          schema,
        },
      },
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message ?? '字段解析失败')

  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error('模型没有返回字段')
  return JSON.parse(content)
}

function buildJsonSchema(formType: FormType) {
  const fields = FORM_SCHEMAS[formType]
  const propertyNames = Object.keys(fields.properties)

  return {
    type: 'object',
    additionalProperties: false,
    properties: fields.properties,
    required: propertyNames,
  }
}

function isFormType(value: FormDataEntryValue | null): value is FormType {
  return typeof value === 'string' && value in FORM_SCHEMAS
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

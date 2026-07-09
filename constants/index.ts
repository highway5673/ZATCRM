export const OPPORTUNITY_STAGES = [
  { value: 'initial_contact', label: '初次接触' },
  { value: 'interested', label: '有意向' },
  { value: 'quoting', label: '报价中' },
  { value: 'negotiating', label: '谈判中' },
  { value: 'won', label: '已成交' },
  { value: 'lost', label: '已失败' },
] as const

export const FOLLOW_UP_METHODS = [
  { value: 'phone', label: '电话' },
  { value: 'wechat', label: '微信' },
  { value: 'email', label: '邮件' },
  { value: 'other', label: '其他' },
] as const

export const TASK_STATUSES = [
  { value: 'pending', label: '待处理' },
  { value: 'done', label: '已完成' },
  { value: 'postponed', label: '已延期' },
] as const

// 客户位置判断阈值（米）
export const LOCATION_THRESHOLD_METERS = 300

# CRM App 全面升级设计文档

**日期：** 2026-07-09  
**项目：** 销售CRM（Expo + Supabase）  
**状态：** 待实现

---

## 一、需求概览

| # | 需求 | 优先级 |
|---|---|---|
| 1 | 手机号验证码登录（无密码，自动注册） | P0 |
| 2 | 苹果风格 UI 全面美化 | P0 |
| 3 | 退出登录入口 | P0 |
| 4 | 每个表单支持语音输入（台词提示器 + AI解析） | P1 |
| 5 | 客户新增「客户类型」字段 | P1 |
| 6 | 跟踪记录（合并原拜访+跟进，含GPS地址） | P1 |
| 7 | 拜访时地址智能去重（300米阈值） | P1 |
| 8 | 商机 Tab 改造为跟踪记录 Tab | P1 |
| 9 | 新增销售记录（Tab + 客户详情内） | P1 |

---

## 二、整体架构

**技术栈（不变）：** Expo Router · Supabase · NativeWind (Tailwind) · TypeScript

**实现策略：** 渐进式改造，保留现有文件结构，逐模块替换。

### 文件结构变化

```
app/
  (auth)/
    login.tsx          ← 改造：OTP两步登录
    register.tsx       ← 删除（OTP自动注册）
  (tabs)/
    index.tsx          ← 改造：苹果风格首页 + 退出登录
    customers.tsx      ← 改造：新增客户类型字段
    tracking.tsx       ← 替换 opportunities.tsx：跟踪记录列表
    sales.tsx          ← 新增：销售记录列表
    tasks.tsx          ← 改造：苹果风格
    _layout.tsx        ← 改造：5个Tab + 苹果风格
  customers/
    [id].tsx           ← 改造：跟踪记录+销售记录合并展示

lib/
  supabase.ts          ← 不变
  session.tsx          ← 不变
  voice.ts             ← 新增：语音识别抽象层
  location.ts          ← 新增：GPS + 地址去重逻辑

components/
  VoiceInputModal.tsx  ← 新增：台词提示器 + 录音 UI

types/
  database.ts          ← 更新：新增类型定义
```

---

## 三、数据库变更

### 3.1 customers 表 — 新增字段

```sql
alter table customers
  add column customer_type text not null default '潜在伙伴'
  check (customer_type in ('潜在伙伴', '客户', '伙伴'));
```

### 3.2 新建 tracking_records 表（替代 visits + follow_ups）

```sql
create type tracking_method as enum (
  'visit',    -- 上门拜访（触发GPS）
  'phone',    -- 电话
  'wechat',   -- 微信
  'email',    -- 邮件
  'other'     -- 其他
);

create table tracking_records (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid references customers(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  method        tracking_method not null default 'phone',
  content       text not null,
  location_id   uuid references customer_locations(id) on delete set null,
  tracked_at    timestamptz default now() not null,
  created_at    timestamptz default now() not null
);

alter table tracking_records enable row level security;

create policy "用户只能访问自己的跟踪记录" on tracking_records
  for all using (auth.uid() = user_id);
```

> 注：原 `visits` 和 `follow_ups` 表保留（不删除），数据迁移可选。新记录全部写入 `tracking_records`。

### 3.3 新建 sales_records 表

```sql
create table sales_records (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid references customers(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  product_name  text not null,
  quantity      integer not null default 1,
  unit_price    numeric(12, 2),
  amount        numeric(12, 2),
  sale_date     date not null default current_date,
  notes         text,
  created_at    timestamptz default now() not null
);

alter table sales_records enable row level security;

create policy "用户只能访问自己的销售记录" on sales_records
  for all using (auth.uid() = user_id);
```

### 3.4 customer_locations 表（现有，复用）

字段已有：`id, customer_id, latitude, longitude, address, created_at`。无需改动。

---

## 四、功能模块设计

### 4.1 OTP 登录（`app/(auth)/login.tsx`）

**流程：**
1. 用户输入手机号 → 点击「获取验证码」
2. 调用 `supabase.auth.signInWithOtp({ phone: '+86XXXXX' })` → Supabase 发送短信
3. 用户输入6位验证码 → 调用 `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`
4. 成功后 session 自动建立，路由跳转到主界面
5. 新用户由 Supabase 自动创建账号（无需单独注册页面）

**UI（两步）：**
- Step 1：手机号输入框 + 「获取验证码」按钮（60秒倒计时）
- Step 2：6格OTP输入框 + 「验证登录」按钮

**删除：** `app/(auth)/register.tsx`（OTP自动注册，无需注册页）

---

### 4.2 苹果风格 UI 规范

| 设计要素 | 规范值 |
|---|---|
| 主色 | `#007AFF`（系统蓝） |
| 背景色 | `#F2F2F7`（iOS 浅灰） |
| 卡片背景 | `white` |
| 卡片圆角 | `rounded-2xl`（16px） |
| 大标题 | `text-3xl font-bold` |
| 分组标题 | `text-sm font-semibold text-gray-500 uppercase` |
| 分隔线 | `border-gray-100` |
| 按钮高度 | `py-3.5` |
| Tab 栏 | 系统原生风格，图标 + 标签 |

全局更新 `tailwind.config.js`：将 `primary` 色系替换为 `#007AFF`。

---

### 4.3 退出登录

位置：首页（`index.tsx`）右上角「设置」图标，点击弹出 ActionSheet，包含「退出登录」选项。

调用：`supabase.auth.signOut()` → 跳转到登录页。

---

### 4.4 语音输入系统

#### 4.4.1 架构

```
VoiceInputModal (UI层)
    ↓
lib/voice.ts (语音识别抽象层)
    ├── 优先：@react-native-voice/voice（设备本地）
    └── 降级：expo-av 录音 → 火山引擎 STT API
    ↓
Claude API（解析文字 → 结构化表单字段）
    ↓
回调给表单（填充字段值）
```

#### 4.4.2 环境变量

```
# .env 新增
EXPO_PUBLIC_VOLC_APP_ID=xxx         # 火山引擎 AppID
EXPO_PUBLIC_VOLC_ACCESS_TOKEN=xxx   # 火山引擎 Token
EXPO_PUBLIC_ANTHROPIC_API_KEY=xxx   # 已存在
```

凭证从项目 `.env` 文件读取（由 openclaw 环境提供实际值）。

#### 4.4.3 台词提示器 UI（`components/VoiceInputModal.tsx`）

- 全屏黑色半透明背景，白色内容区
- 顶部：当前表单说话格式提示（大字滚动显示，类似台词提示器）
- 中间：波形动画（录音中）/ 文字回显区（识别完成）
- 底部：开始/停止录音按钮、重新录音、确认使用

**提示语格式示例（新增客户）：**
```
请按照以下格式说话：

「客户姓名[名字]，
  公司[公司名]，
  手机号[号码]，
  微信[微信号]，
  客户类型[潜在伙伴/客户/伙伴]，
  备注[备注内容]」
```

#### 4.4.4 Claude 解析 Prompt 示例

```
你是一个CRM数据提取助手。从以下语音转写文字中提取表单字段，返回JSON。
字段：name, company, phone, wechat, customer_type, notes
可能的customer_type值：潜在伙伴、客户、伙伴
若某字段未提及，值为null。

转写文字：「...」
```

#### 4.4.5 每个表单的语音模板

| 表单 | 提示字段 |
|---|---|
| 新增客户 | 姓名、公司、手机、微信、客户类型、备注 |
| 新增跟踪记录 | 跟踪方式、跟踪内容 |
| 新增销售记录 | 产品名称、数量、单价、金额、备注 |
| 新增任务 | 任务标题、关联客户、截止时间、备注 |

---

### 4.5 客户类型

`customers` 表新增 `customer_type`，取值：`潜在伙伴` / `客户` / `伙伴`

**展示：**
- 客户列表卡片：姓名下方显示类型标签（彩色圆角标签）
  - 潜在伙伴 → 灰色
  - 客户 → 蓝色
  - 伙伴 → 绿色
- 新增/编辑表单：单选三个选项

---

### 4.6 跟踪记录（合并拜访+跟进）

**跟踪方式：**

| 方式 | 标识 | GPS |
|---|---|---|
| 上门拜访 | 🚗 | ✅ 自动获取 |
| 电话 | 📞 | ❌ |
| 微信 | 💬 | ❌ |
| 邮件 | 📧 | ❌ |
| 其他 | 📝 | ❌ |

**新增跟踪记录流程（当方式为"上门拜访"时）：**
1. 调用 `expo-location` 获取当前 GPS 坐标
2. 查询该客户所有 `customer_locations` 记录
3. 用 Haversine 公式逐一计算距离
4. 若有任一记录距离 ≤ 300m → `location_id = 该记录.id`（复用）
5. 若无 → 调用反向地理编码获取地址文字，插入新 `customer_locations` → 使用新 `location_id`
6. 插入 `tracking_records`，带上 `location_id`

**地址展示：** 跟踪记录列表中，上门记录显示地址文字（通过 `location_id` 关联查询）。

---

### 4.7 销售记录

**字段：** 产品名称、数量、单价、金额（可自动计算：数量×单价）、销售日期、备注

**入口：**
1. **客户详情页** → 「产品销售记录」卡片（该客户的历史销售）
2. **销售 Tab** → 所有客户的销售记录汇总，顶部显示总金额统计

---

### 4.8 底部导航（5个Tab）

```
首页 | 客户 | 跟踪 | 销售 | 任务
🏠      👥     📋     💰    ✅
```

---

### 4.9 类型定义更新（`types/database.ts`）

新增/更新：
- `CustomerType = '潜在伙伴' | '客户' | '伙伴'`
- `Customer` → 新增 `customer_type: CustomerType`
- `TrackingMethod = 'visit' | 'phone' | 'wechat' | 'email' | 'other'`
- `TrackingRecord` 接口（替代 `Visit` + `FollowUp`）
- `SalesRecord` 接口

---

## 五、实现顺序（阶段划分）

| 阶段 | 内容 | 依赖 |
|---|---|---|
| Phase 1 | 数据库变更（SQL迁移） | 无 |
| Phase 2 | OTP登录 + 退出登录 | Phase 1 |
| Phase 3 | 苹果风格UI（全局色彩 + 各页面） | Phase 2 |
| Phase 4 | 客户类型 + 类型定义更新 | Phase 3 |
| Phase 5 | 跟踪记录（含GPS去重） | Phase 4 |
| Phase 6 | 销售记录 | Phase 4 |
| Phase 7 | 语音输入系统 | Phase 5 & 6 |

---

## 六、依赖包变更

```bash
# 新增
npx expo install @react-native-voice/voice

# 已有（复用）
expo-av          # 录音降级方案
expo-location    # GPS
expo-speech      # （可选）
```

---

## 七、不在本期范围内

- 数据迁移（visits / follow_ups → tracking_records 历史数据）
- 推送通知
- 多用户/团队协作
- 离线支持

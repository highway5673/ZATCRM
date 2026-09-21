import type { ReactNode } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppSymbol, type AppSymbolName } from '../AppSymbol'

type AppHeaderProps = {
  title: string
  onBack?: () => void
  backLabel?: string
  actionLabel?: string
  actionIcon?: AppSymbolName
  onAction?: () => void
  actionLoading?: boolean
  actionDisabled?: boolean
  actionTone?: 'brand' | 'gold' | 'danger'
}
const ACTION_COLORS = {
  brand: 'text-brand-700',
  gold: 'text-accent-600',
  danger: 'text-red-500',
} as const

const ACTION_ICON_COLORS = {
  brand: '#0A3569',
  gold: '#A97714',
  danger: '#EF4444',
} as const

export function AppHeader({
  title,
  onBack,
  backLabel = '返回',
  actionLabel,
  actionIcon,
  onAction,
  actionLoading = false,
  actionDisabled = false,
  actionTone = 'brand',
}: AppHeaderProps) {
  return (
    <SafeAreaView edges={['top']} className="bg-canvas">
      <View className="h-[58px] flex-row items-center border-b border-line px-4">
        <View className="w-[92px] items-start">
          {onBack ? (
            <TouchableOpacity
              className="min-h-12 flex-row items-center justify-center rounded-xl px-2"
              onPress={onBack}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
            >
              <AppSymbol name="back" size={21} color="#0A3569" />
              <Text className="ml-1 text-base font-semibold text-brand-700">{backLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text className="flex-1 text-center text-xl font-bold text-brand-800" numberOfLines={1}>
          {title}
        </Text>

        <View className="w-[92px] items-end">
          {onAction ? (
            <TouchableOpacity
              className="min-h-12 flex-row items-center justify-center rounded-xl px-2"
              onPress={onAction}
              disabled={actionDisabled || actionLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color={ACTION_ICON_COLORS[actionTone]} />
              ) : (
                <>
                  {actionIcon ? (
                    <AppSymbol name={actionIcon} size={19} color={ACTION_ICON_COLORS[actionTone]} />
                  ) : null}
                  {actionLabel ? (
                    <Text className={`${actionIcon ? 'ml-1.5' : ''} text-base font-semibold ${ACTION_COLORS[actionTone]}`}>
                      {actionLabel}
                    </Text>
                  ) : null}
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  actionIcon?: AppSymbolName
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}

export function PageHeader({
  title,
  subtitle,
  actionIcon,
  actionLabel,
  onAction,
  children,
}: PageHeaderProps) {
  return (
    <SafeAreaView edges={['top']} className="bg-canvas">
      <View className="px-5 pb-5 pt-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-3xl font-bold tracking-tight text-brand-800">{title}</Text>
            {subtitle ? (
              <Text className="mt-1 text-sm text-gray-500">{subtitle}</Text>
            ) : null}
          </View>
          {onAction ? (
            <TouchableOpacity
              className="min-h-12 min-w-12 flex-row items-center justify-center rounded-2xl bg-accent-500 px-3 shadow-card"
              onPress={onAction}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              {actionIcon ? <AppSymbol name={actionIcon} size={23} color="#FFFFFF" /> : null}
              {actionLabel ? (
                <Text className={`${actionIcon ? 'ml-2' : ''} text-base font-semibold text-white`}>
                  {actionLabel}
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
        {children ? <View className="mt-4">{children}</View> : null}
      </View>
    </SafeAreaView>
  )
}

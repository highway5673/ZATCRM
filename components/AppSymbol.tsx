import { SymbolView } from 'expo-symbols'
import type { StyleProp, ViewStyle } from 'react-native'

const SYMBOLS = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  customers: { ios: 'person.2.fill', android: 'group', web: 'group' },
  tracking: { ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' },
  sales: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  tasks: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  phone: { ios: 'phone.fill', android: 'call', web: 'call' },
  clock: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  navigate: { ios: 'location.fill', android: 'navigation', web: 'navigation' },
  building: { ios: 'building.2.fill', android: 'business', web: 'business' },
  customer: { ios: 'person.fill', android: 'person', web: 'person' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  target: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  delete: { ios: 'trash.fill', android: 'delete', web: 'delete' },
  microphone: { ios: 'mic.fill', android: 'mic', web: 'mic' },
} as const

export type AppSymbolName = keyof typeof SYMBOLS

export function AppSymbol({
  name,
  size = 22,
  color = '#0A3569',
  style,
}: {
  name: AppSymbolName
  size?: number
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  return (
    <SymbolView
      name={SYMBOLS[name] as never}
      size={size}
      tintColor={color}
      weight="semibold"
      style={style}
    />
  )
}

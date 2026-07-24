import type { PropsWithChildren } from 'react'
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html'

export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, headNodes, htmlAttributes } = useServerDocumentContext()

  return (
    <html {...htmlAttributes} lang="zh-CN">
      <head>
        {headNodes}
        <title>客户管理</title>
      </head>
      <body {...bodyAttributes}>
        {children}
        <ScrollViewStyleReset />
        {bodyNodes}
      </body>
    </html>
  )
}

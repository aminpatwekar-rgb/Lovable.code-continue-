import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

export interface NoticeProps {
  preview: string
  heading: string
  lines: string[]
  ctaLabel?: string
  ctaUrl?: string
}

/** Shared ONYX layout for app notification emails. */
export function OnyxNotice({ preview, heading, lines, ctaLabel, ctaUrl }: NoticeProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>ONYX</Text>
          <Heading style={h1}>{heading}</Heading>
          {lines.map((l, i) => (
            <Text key={i} style={text}>{l}</Text>
          ))}
          {ctaUrl && ctaLabel ? (
            <Button href={ctaUrl} style={button}>{ctaLabel}</Button>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}

export const appUrl = (path: string) =>
  `${(typeof process !== 'undefined' && process.env?.['ONYX_APP_URL']) || 'https://workonyx.org'}${path}`

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = { fontSize: '13px', fontWeight: 'bold' as const, letterSpacing: '3px', color: '#1f5bc4', margin: '0 0 16px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#14181f', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#55575d', lineHeight: '1.5', margin: '0 0 14px' }
const button = {
  backgroundColor: '#1f5bc4', color: '#ffffff', fontSize: '15px', borderRadius: '8px',
  padding: '12px 20px', textDecoration: 'none', marginTop: '8px',
}

/**
 * PDF Export Security Tests
 *
 * Validates XSS sanitization in PDF export functionality.
 * Reference: Plan 03-02 - PDF export must sanitize all user-controlled inputs.
 */

import { describe, expect, it } from 'vitest'
import { sanitizeForPdf } from '@/utils/exportPdf'

describe('PDF Export Security - Sanitization', () => {
  it('sanitizes projectName with script tag', () => {
    const input = '<script>alert("xss")</script>Legit Name'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Legit Name')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('xss')
  })

  it('strips HTML tags but keeps content', () => {
    const input = '<b>Bold</b> <i>Italic</i> Text'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Bold Italic Text')
    expect(result).not.toContain('<b>')
    expect(result).not.toContain('<i>')
    expect(result).not.toContain('</b>')
    expect(result).not.toContain('</i>')
  })

  it('removes event handlers from text', () => {
    const input = '<div onclick="alert(1)">Click Me</div>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Click Me')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('<div>')
  })

  it('handles javascript: protocol in projectName', () => {
    const input = '<a href="javascript:alert(1)">Link</a>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Link')
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('href')
    expect(result).not.toContain('<a>')
  })

  it('preserves legitimate text with special characters', () => {
    const input = 'Project & Storage <> 2024'
    const result = sanitizeForPdf(input)

    // DOMPurify HTML-encodes special characters for safety
    expect(result).toBe('Project &amp; Storage &lt;&gt; 2024')
  })

  it('handles nested HTML tags', () => {
    const input = '<div><span><b>Nested</b></span> Tags</div>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Nested Tags')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('handles SVG-based XSS attempts', () => {
    const input = '<svg onload="alert(1)">SVG Text</svg>'
    const result = sanitizeForPdf(input)

    // DOMPurify removes SVG tags entirely for security (including content)
    expect(result).toBe('')
    expect(result).not.toContain('svg')
    expect(result).not.toContain('onload')
    expect(result).not.toContain('alert')
  })

  it('handles IMG tag with onerror XSS', () => {
    const input = '<img src=x onerror="alert(1)">Image Text</img>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Image Text')
    expect(result).not.toContain('img')
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('src')
  })

  it('handles iframe injection', () => {
    const input = '<iframe src="evil.com">Iframe Content</iframe>'
    const result = sanitizeForPdf(input)

    // DOMPurify removes iframe tags entirely for security (including content)
    expect(result).toBe('')
    expect(result).not.toContain('iframe')
    expect(result).not.toContain('evil.com')
  })

  it('handles data: URL XSS attempts', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">Link</a>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Link')
    expect(result).not.toContain('data:')
    expect(result).not.toContain('script')
    expect(result).not.toContain('href')
  })

  it('handles style tag with expression injection', () => {
    const input = '<style>body{background:url("javascript:alert(1)")}</style>Text'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Text')
    expect(result).not.toContain('style')
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('background')
  })

  it('handles empty string', () => {
    const input = ''
    const result = sanitizeForPdf(input)

    expect(result).toBe('')
  })

  it('preserves plain text unchanged', () => {
    const input = 'Simple Project Name 123'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Simple Project Name 123')
  })

  it('handles multiple script tags', () => {
    const input = '<script>evil1()</script>Good<script>evil2()</script>Text'
    const result = sanitizeForPdf(input)

    expect(result).toBe('GoodText')
    expect(result).not.toContain('script')
    expect(result).not.toContain('evil')
  })

  it('handles malformed HTML', () => {
    const input = '<b>Unclosed tag <i>Content</b>'
    const result = sanitizeForPdf(input)

    expect(result).toBe('Unclosed tag Content')
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })
})

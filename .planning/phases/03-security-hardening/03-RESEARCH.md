# Phase 3: Security Hardening - Research

**Researched:** 2026-01-18
**Domain:** Client-side React SPA security
**Confidence:** HIGH

## Summary

Security hardening for a client-side React SPA differs significantly from traditional full-stack applications. Without a backend, all validation must occur after URL state deserialization, and traditional "server-side validation" becomes "post-deserialization validation" in the calculation engines. The project already uses many secure patterns (React's auto-escaping, jsPDF 4.0.0 with path traversal fix, Snyk for scanning), but lacks systematic input validation after URL hash decompression.

The standard approach is layered defense:
1. **CSP headers** to prevent XSS as a second line of defense
2. **Input validation** after LZ-string decompression with bounds checking and enum guards
3. **PDF sanitization** for user-controlled text fields
4. **Dependency scanning** in CI/CD with both npm audit and Snyk
5. **Error boundaries** to prevent information leakage through stack traces

**Primary recommendation:** Implement Zod schemas for runtime validation of deserialized URL state, configure CSP headers via deployment platform, and add React error boundary around calculation dashboard.

## Standard Stack

The established libraries/tools for React SPA security:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 3.24+ | Runtime schema validation | TypeScript-first, zero dependencies, type inference, 10M+ weekly downloads |
| DOMPurify | 3.3.1+ | HTML sanitization | Industry standard for XSS prevention, works client/server-side |
| react-error-boundary | 4.1+ | Declarative error boundaries | Avoids class components, built-in reset logic, 1M+ weekly downloads |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @braintree/sanitize-url | 7.1+ | URL validation | Prevents javascript: scheme attacks in href attributes |
| isomorphic-dompurify | 2.19+ | SSR-compatible sanitization | When using Next.js or SSR (not needed for Raidy) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod | Yup | Better Formik integration, but weaker TypeScript support |
| Zod | Joi | More features, but Node-only (no browser support) |
| react-error-boundary | Custom class | More control, but verbose and error-prone |

**Installation:**
```bash
npm install zod dompurify react-error-boundary
npm install --save-dev @types/dompurify
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── utils/
│   ├── validators.ts        # Existing topology validators
│   ├── schemas.ts            # NEW: Zod schemas for URL state
│   └── sanitizers.ts         # NEW: Input sanitization helpers
├── store/
│   └── urlStorage.ts         # MODIFY: Add validation after decompression
└── components/
    └── ErrorBoundary.tsx     # NEW: App-level error boundary
```

### Pattern 1: URL State Validation Schema
**What:** Define Zod schema matching Zustand store shape for runtime validation after LZ-string decompression
**When to use:** Every URL hash load (on app init, shared link navigation)
**Example:**
```typescript
// src/utils/schemas.ts
import { z } from 'zod'

// Enum validation with TypeScript type guard
const TopologyTypeSchema = z.enum(['standard', 'zfs', 's2d', 'ceph', 'vsan_esa', 'vsan_osa', 'powerflex', 'proprietary'])

// Numeric bounds validation
const DriveCountSchema = z.number().int().min(1).max(1000)

// Configuration state schema
export const ConfigStateSchema = z.object({
  driveId: z.string(),
  driveCount: DriveCountSchema,
  topology: z.object({
    type: TopologyTypeSchema,
    level: z.string()
  }),
  serverCount: z.number().int().min(1).max(100).optional(),
  // ... other fields
})

// Runtime validation function
export function validateUrlState(data: unknown): ConfigState | null {
  const result = ConfigStateSchema.safeParse(data)
  if (result.success) {
    return result.data
  } else {
    console.error('Invalid URL state:', result.error.format())
    return null
  }
}
```

### Pattern 2: CSP Configuration for Static Hosting
**What:** Configure Content Security Policy headers via deployment platform config files
**When to use:** All production deployments

**Netlify (_headers file in public/ directory):**
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

**Vercel (vercel.json):**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

**GitHub Pages (limitation - meta tag only):**
```html
<!-- In public/index.html <head> section -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
```

**Note:** GitHub Pages does NOT support HTTP headers via config files. Meta tag approach cannot enforce frame-ancestors or report-uri directives. Consider Netlify/Vercel for production.

### Pattern 3: React Error Boundary with User-Friendly Messages
**What:** Catch calculation engine errors and render fallback UI without exposing stack traces
**When to use:** Wrap calculation dashboard and PDF export components
**Example:**
```typescript
// src/components/ErrorBoundary.tsx
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="error-container">
      <h2>Calculation Error</h2>
      <p>Unable to process configuration. Please check your inputs and try again.</p>
      {/* NEVER show error.stack or error.message in production */}
      <button onClick={resetErrorBoundary}>Reset Configuration</button>
    </div>
  )
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        // Log to monitoring service (not console.error in production)
        console.error('Calculation engine error:', error, info.componentStack)
      }}
      onReset={() => {
        // Clear URL hash state
        window.location.hash = ''
        window.location.reload()
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}
```

### Anti-Patterns to Avoid
- **Showing stack traces to users:** Leaks implementation details, helps attackers understand code structure
- **Client-only validation mindset:** In SPAs without backend, validation after deserialization IS the security layer
- **Trusting URL hash data:** LZ-string decompression returns strings - must validate before type coercion
- **Using unsafe-eval in CSP:** Allows eval() attacks, defeats CSP purpose
- **Bypassing CSP with meta tag on GitHub Pages:** Incomplete protection, missing critical directives

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime type validation | Custom if/else chains | Zod schemas | Handles edge cases (NaN, Infinity, type coercion), provides error paths, composable |
| HTML sanitization | Regex-based stripping | DOMPurify | Handles nested tags, attribute-based XSS, SVG/MathML vectors, constantly updated |
| URL scheme validation | String startsWith() | @braintree/sanitize-url or URL constructor | Prevents javascript:, data:, vbscript: schemes, handles edge cases |
| Error boundaries | Custom class components | react-error-boundary | Built-in reset logic, TypeScript support, hooks integration |
| Enum validation | Manual includes() checks | Zod enum schemas | Type inference, exhaustive checking, error messages |

**Key insight:** Security vulnerabilities often hide in edge cases. Library maintainers handle 100+ edge cases you haven't considered (e.g., DOMPurify handles `<svg><script href="data:,alert(1)"/>` injection).

## Common Pitfalls

### Pitfall 1: jsPDF Path Traversal (CVE-2025-68428)
**What goes wrong:** Passing user-controlled file paths to jsPDF methods (addImage, html, addFont, loadFile) in Node.js builds allows reading arbitrary files
**Why it happens:** jsPDF ≤3.0.4 didn't sanitize paths; attackers could pass `"../../../etc/passwd"` to embed file contents in PDF
**How to avoid:**
- Use jsPDF ≥4.0.0 (Raidy currently uses 4.0.0 ✓)
- Never pass user-controlled paths to file-loading methods
- Raidy only uses jsPDF for text/table rendering (not file loading), so safe
**Warning signs:** If adding image upload features in future, validate paths strictly

### Pitfall 2: LZ-String Decompression Without Validation
**What goes wrong:** `decompressFromEncodedURIComponent()` returns strings; parsing JSON from untrusted source without validation allows injection of malformed data (NaN, Infinity, negative drive counts)
**Why it happens:** Developers assume URL state is "their own data" and safe; attackers can craft malicious URLs
**How to avoid:**
```typescript
// BAD: Direct deserialization
const state = JSON.parse(decompressed)
config.driveCount = state.driveCount // Could be -999, NaN, "hacked"

// GOOD: Validate with Zod schema
const result = ConfigStateSchema.safeParse(JSON.parse(decompressed))
if (!result.success) {
  showUserNotification('Invalid configuration link')
  return null
}
```
**Warning signs:** Calculation engines returning NaN, negative capacities, missing validation in urlStorage.ts

### Pitfall 3: CSP Breaking Inline Styles/Scripts
**What goes wrong:** Strict CSP blocks Tailwind's utility classes or React's inline event handlers; app appears broken
**Why it happens:** CSP `script-src 'self'` blocks inline `<script>` tags; `style-src 'self'` blocks inline styles
**How to avoid:**
- Use `'unsafe-inline'` for script-src and style-src during migration (Raidy pattern)
- Long-term: Use nonces or hashes for specific inline scripts
- Test CSP in report-only mode first (`Content-Security-Policy-Report-Only`)
**Warning signs:** Blank page after CSP deployment, console errors "Refused to execute inline script"

### Pitfall 4: Information Leakage Through Error Messages
**What goes wrong:** Showing raw error.message or stack traces to users reveals internal paths, library versions, logic flow
**Why it happens:** Developers use error.message for debugging and forget to sanitize for production
**How to avoid:**
```typescript
// BAD: Leaks internal details
catch (error) {
  alert(error.message) // "Cannot read property 'capacity_raw' of undefined at volumetry.ts:234"
}

// GOOD: Generic user message, detailed logging
catch (error) {
  showUserMessage('Unable to calculate capacity. Please check configuration.')
  console.error('Volumetry calculation failed:', error) // Only in dev tools
}
```
**Warning signs:** Users reporting error messages with file paths, stack traces visible in screenshots

### Pitfall 5: Relying Only on Client-Side Validation
**What goes wrong:** In SPAs, there IS no server-side validation; all security depends on post-deserialization validation
**Why it happens:** Developers think "client-side validation is just UX" and skip thorough validation
**How to avoid:**
- Treat URL deserialization as "untrusted input boundary"
- Validate ALL fields after JSON.parse() before passing to calculation engines
- Use TypeScript strict mode + Zod for defense in depth
**Warning signs:** Calculation engines accepting invalid inputs (0 drives, negative capacity), no validation tests

### Pitfall 6: GitHub Pages CSP Limitations
**What goes wrong:** Using GitHub Pages with meta tag CSP, assuming full protection; missing critical directives like frame-ancestors
**Why it happens:** GitHub Pages doesn't support HTTP headers; meta tags only support subset of CSP directives
**How to avoid:**
- Use Netlify or Vercel for production (free tier supports HTTP headers)
- If stuck with GitHub Pages, use Cloudflare Workers proxy to inject headers
- Document CSP limitations in deployment guide
**Warning signs:** CSP frame-ancestors not working, report-uri not receiving violations

## Code Examples

Verified patterns from official sources:

### Bounds Checking with Zod
```typescript
// Source: https://github.com/colinhacks/zod (official Zod docs)
import { z } from 'zod'

// Min/max with custom error messages
const DriveCountSchema = z.number()
  .int('Drive count must be an integer')
  .min(1, 'At least 1 drive required')
  .max(1000, 'Maximum 1000 drives supported')
  .finite('Drive count must be finite') // Rejects NaN, Infinity

// Refinements for complex validation
const ServerCountSchema = z.number().int().min(1).refine(
  (val) => val >= 3 || topology === 'simple',
  'Redundant topologies require minimum 3 servers'
)
```

### Enum Validation with Type Guards
```typescript
// Source: https://www.webdevtutor.net/blog/typescript-validate-enum-type
const TOPOLOGY_TYPES = ['standard', 'zfs', 's2d', 'ceph'] as const
type TopologyType = typeof TOPOLOGY_TYPES[number]

function isValidTopologyType(value: unknown): value is TopologyType {
  return typeof value === 'string' && TOPOLOGY_TYPES.includes(value as TopologyType)
}

// Usage in validation
if (!isValidTopologyType(data.topology.type)) {
  throw new Error(`Invalid topology type: ${data.topology.type}`)
}
```

### URL State Validation Pipeline
```typescript
// Source: Raidy codebase + Zod best practices
// Modified src/store/urlStorage.ts
import { ConfigStateSchema } from '@/utils/schemas'

export const urlHashStorage: StateStorage = {
  getItem: (key: string): string | null => {
    const hash = window.location.hash.slice(1)
    if (!hash) return null

    try {
      const searchParams = new URLSearchParams(hash)
      const compressed = searchParams.get(key)
      if (!compressed) return null

      // Step 1: Decompress
      const decompressed = decompressFromEncodedURIComponent(compressed)
      if (!decompressed) {
        showUserNotification('Unable to load configuration from URL')
        return null
      }

      // Step 2: Parse JSON
      const parsed = JSON.parse(decompressed)

      // Step 3: Validate with Zod
      const validation = ConfigStateSchema.safeParse(parsed)
      if (!validation.success) {
        console.error('Invalid URL state:', validation.error.format())
        showUserNotification('Configuration link is invalid or corrupted')
        return null
      }

      // Step 4: Return validated JSON string
      return JSON.stringify(validation.data)
    } catch (error) {
      console.error('URL state parsing failed:', error)
      showUserNotification('Unable to load configuration')
      return null
    }
  }
}
```

### PDF Export Sanitization
```typescript
// Source: jsPDF security advisory + DOMPurify docs
import DOMPurify from 'dompurify'

export function exportToPdf(config: ExportConfig): void {
  const { projectName = 'Storage Configuration' } = config

  // Sanitize user-controlled text fields
  const safeProjectName = DOMPurify.sanitize(projectName, {
    ALLOWED_TAGS: [], // Strip all HTML
    KEEP_CONTENT: true // Keep text content
  })

  // jsPDF 4.0.0+ is safe for text rendering (no file paths)
  doc.text(safeProjectName, pageWidth / 2, y, { align: 'center' })

  // NEVER pass user input to these methods:
  // doc.addImage(userInput) ❌
  // doc.html(userInput) ❌
  // doc.loadFile(userInput) ❌
}
```

### Error Boundary with Reset
```typescript
// Source: https://github.com/bvaughn/react-error-boundary
import { useErrorBoundary } from 'react-error-boundary'

function CalculationDashboard() {
  const { showBoundary } = useErrorBoundary()

  useEffect(() => {
    try {
      const results = calculateVolumetry(config)
      setResults(results)
    } catch (error) {
      // Trigger error boundary
      showBoundary(error)
    }
  }, [config])
}

// App.tsx
<ErrorBoundary
  FallbackComponent={ErrorFallback}
  onReset={() => {
    window.location.hash = ''
    window.location.reload()
  }}
>
  <CalculationDashboard />
</ErrorBoundary>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Yup for validation | Zod for validation | 2021-2022 | Better TypeScript inference, zero dependencies |
| Class-based error boundaries | react-error-boundary library | 2020 | Functional components, hooks integration |
| Custom CSP nonce generation | Platform-managed nonces (Netlify CSP integration) | 2023-2024 | Simplified deployment, automatic rotation |
| jsPDF ≤3.0.4 | jsPDF ≥4.0.0 | Jan 2026 | Fixes CVE-2025-68428 path traversal |
| Feature-Policy header | Permissions-Policy header | 2020 | Renamed header, same functionality |
| Client-side validation only | Post-deserialization validation in SPAs | Ongoing | Recognize URL state as untrusted input |

**Deprecated/outdated:**
- **Feature-Policy header**: Replaced by Permissions-Policy (still supported but use new name)
- **jsPDF <4.0.0**: Critical vulnerability CVE-2025-68428 in Node.js builds
- **Formik + Yup pattern**: Still valid but Zod gaining dominance in TypeScript projects
- **GitHub Pages for security-critical apps**: CSP limitations make it unsuitable for production

## Open Questions

Things that couldn't be fully resolved:

1. **Deployment Platform Choice**
   - What we know: Project targets GitHub Pages (per CLAUDE.md: "Deployment: GitHub Pages at /raidy/ base path")
   - What's unclear: Whether production deployment could use Netlify/Vercel for proper CSP headers
   - Recommendation: Test with GitHub Pages meta tag CSP, document limitations; recommend Netlify for production

2. **jsPDF Browser vs Node Build**
   - What we know: Vite bundles browser build (`dist/jspdf.es.js`), CVE-2025-68428 only affects Node builds
   - What's unclear: Whether any server-side PDF generation is planned
   - Recommendation: Document that browser build is safe; if adding SSR later, audit file input methods

3. **Inline Script/Style Requirements**
   - What we know: Tailwind generates utility classes, React may need inline event handlers
   - What's unclear: Exact CSP directives needed without breaking functionality
   - Recommendation: Start with `'unsafe-inline'` in report-only mode, refine based on violation reports

4. **Monte Carlo Worker Security**
   - What we know: Web Workers run in isolated scope, can't access DOM
   - What's unclear: Whether worker script injection is possible via URL state manipulation
   - Recommendation: Validate worker message payloads with Zod schemas

5. **URL State Versioning for Breaking Changes**
   - What we know: STATE.md mentions future URL versioning strategy (#v=2.0 param)
   - What's unclear: Whether validation should support legacy URL formats
   - Recommendation: Implement version detection before validation; reject unsupported versions gracefully

## Sources

### Primary (HIGH confidence)
- [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html) - Error message best practices
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) - Client vs server validation
- [jsPDF Security Advisory GHSA-f8cm-6447-x5h2](https://github.com/parallax/jsPDF/security/advisories/GHSA-f8cm-6447-x5h2) - CVE-2025-68428 details
- [Netlify CSP Documentation](https://docs.netlify.com/manage/security/content-security-policy/) - CSP configuration
- [Vercel Security Headers Documentation](https://vercel.com/docs/headers/security-headers) - CSP for static sites
- [Zod GitHub Repository](https://github.com/colinhacks/zod) - Runtime validation library
- [DOMPurify GitHub Repository](https://github.com/cure53/DOMPurify) - HTML sanitization
- [react-error-boundary GitHub](https://github.com/bvaughn/react-error-boundary) - Error boundary library

### Secondary (MEDIUM confidence)
- [StackHawk React XSS Guide](https://www.stackhawk.com/blog/react-xss-guide-examples-and-prevention/) - React security patterns
- [Snyk React Security Best Practices](https://snyk.io/blog/10-react-security-best-practices/) - 10 security guidelines
- [Pragmatic Web Security: React XSS Part 1](https://pragmaticwebsecurity.com/articles/spasecurity/react-xss-part1.html) - URL validation
- [Better Stack: Yup vs Zod](https://betterstack.com/community/guides/scaling-nodejs/yup-vs-zod/) - Validation library comparison
- [NearForm: npm audit vs Snyk](https://nearform.com/insights/comparing-npm-audit-with-snyk/) - Dependency scanning tools
- [Snyk Support: npm audit comparison](https://support.snyk.io/hc/en-us/articles/360010452717-Snyk-Vs-NPM-Audit) - Feature differences
- [GitHub Discussion: GitHub Pages CSP](https://github.com/orgs/community/discussions/54257) - Platform limitations

### Tertiary (LOW confidence)
- Multiple Medium articles on React security (varying quality, dates)
- Blog posts on CSP configuration (implementation details vary by platform version)
- Community discussions on TypeScript validation patterns (best practices evolving)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zod, DOMPurify, react-error-boundary are industry standard (official docs verified)
- Architecture: HIGH - Patterns verified against official documentation and CVE advisories
- Pitfalls: HIGH - Based on real CVE (jsPDF), OWASP guidelines, and common SPA mistakes
- CSP configuration: MEDIUM - Platform-specific syntax verified, but testing needed per deployment
- URL validation: MEDIUM - Pattern is sound but Raidy-specific schema needs design
- GitHub Pages limitations: MEDIUM - Confirmed via GitHub discussions, but workarounds exist

**Research date:** 2026-01-18
**Valid until:** 30 days (2026-02-17) - Security landscape changes rapidly; revalidate jsPDF, Zod, DOMPurify versions before implementation

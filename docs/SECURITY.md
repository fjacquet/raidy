# Security Configuration

**Project:** Raidy Storage Simulator
**Last Updated:** 2026-01-18

## Overview

Raidy implements security hardening for client-side SPA applications:
- URL state validation prevents malicious hash injection
- Input sanitization protects PDF export
- Error boundaries prevent information leakage
- Content Security Policy headers mitigate XSS attacks
- Automated dependency scanning catches vulnerabilities

## Content Security Policy (CSP)

### Deployment Platforms

**Netlify (Recommended for Production)**
- Configuration: `public/_headers`
- Headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Full CSP support including frame-ancestors directive

**Vercel**
- Configuration: `vercel.json`
- Headers: Same as Netlify
- Full CSP support

**GitHub Pages (Limited)**
- Configuration: `index.html` meta tag
- Limitation: Meta tag CSP does NOT support:
  - `frame-ancestors` directive (clickjacking protection missing)
  - `report-uri` directive (violation reporting unavailable)
- Recommendation: Use Netlify or Vercel for production deployments

### CSP Directives Explained

- `default-src 'self'`: Only load resources from same origin
- `script-src 'self' 'unsafe-inline'`: Allow inline scripts (required for React)
- `style-src 'self' 'unsafe-inline'`: Allow inline styles (required for Tailwind)
- `frame-ancestors 'none'`: Prevent iframe embedding (not supported in meta tag)

**Why 'unsafe-inline':**
Tailwind CSS utility classes and React event handlers require inline styles/scripts. This is standard for React SPAs. Future enhancement: use nonces or hashes for stricter CSP.

### Testing CSP

1. Deploy to Netlify/Vercel test environment
2. Open browser DevTools Console
3. Check for CSP violation errors
4. Test that app functions correctly (no blocked resources)

## Dependency Security

### Scanning Tools

1. **npm audit** (built-in)
   - Scans dependencies against npm security advisory database
   - Run: `npm audit --audit-level=high`
   - Automatic fixes: `npm audit fix`

2. **Snyk** (third-party)
   - More comprehensive vulnerability database
   - Run: `npx snyk test --severity-threshold=high`
   - Requires authentication: Set `SNYK_TOKEN` environment variable

### CI/CD Integration

Security scans run automatically on every push:
- GitHub Actions workflow: `.github/workflows/ci.yml`
- Fails build if high/critical vulnerabilities found
- Snyk requires `SNYK_TOKEN` secret in repository settings

### Known Vulnerabilities (Current)

- All dependencies: Clean scan as of 2026-01-18 ✓
- npm audit: 0 vulnerabilities found ✓

### Fixing Vulnerabilities

When scan finds issues:
1. `npm audit fix` (try automatic fix first)
2. Review changelog for breaking changes
3. Run `npm test` to verify no breakage
4. If no fix available: document accepted risk or workaround

## Input Validation

### URL State Validation

**Protection:** Malicious URL hash cannot inject invalid values (negative counts, NaN, wrong enums)

**Implementation:**
- File: `src/utils/schemas.ts`
- Library: Zod 3.24+
- Validation after LZ-string decompression in `src/store/urlStorage.ts`

**Test:**
Load URL: `http://localhost:5173/#config=<malicious_payload>`
Expected: User sees notification "Configuration link is invalid"

### PDF Export Sanitization

**Protection:** User-controlled text fields (projectName) cannot inject XSS vectors

**Implementation:**
- File: `src/utils/exportPdf.ts`
- Library: DOMPurify 3.3+
- Sanitization before jsPDF rendering

**Test:**
Export PDF with projectName: `<script>alert('xss')</script>Test`
Expected: PDF shows "Test" without script tags

### Validation Enforcement

**Protection:** Invalid configurations (RAID5 with 2 drives) cannot trigger calculations

**Implementation:**
- File: `src/utils/validators.ts`
- Function: `hasBlockingErrors()` prevents calculation execution
- Error boundary: `src/components/ErrorBoundary.tsx` catches crashes

## Responsible Disclosure

If you discover a security vulnerability:
1. **Do NOT** create public GitHub issue
2. Email: security@raidy.dev (update with actual contact)
3. Include: reproduction steps, impact assessment, suggested fix
4. Expected response: 48 hours

## Security Checklist for Deployment

- [ ] Run `npm audit --audit-level=high` (zero vulnerabilities)
- [ ] Run `npx snyk test --severity-threshold=high` (scan passes)
- [ ] Verify CSP headers in deployment platform
- [ ] Test URL validation with malicious inputs
- [ ] Test PDF export with XSS vectors
- [ ] Verify error boundary shows fallback (not stack traces)
- [ ] Check that invalid configs are blocked from calculation

## References

- OWASP Input Validation: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- CSP Documentation: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- React Security Best Practices: https://snyk.io/blog/10-react-security-best-practices/

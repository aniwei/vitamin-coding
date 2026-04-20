#!/usr/bin/env python3
"""
Batch migrate src/components/**/*.tsx from Next.js-specific APIs
to standard React + react-router-dom APIs.

Changes:
  1. next/navigation  → react-router-dom (useRouter→useNavigate, usePathname→useLocation, etc.)
  2. next/link        → react-router-dom Link (href → to)
  3. next-intl        → @/hooks/use-translations
  4. next/dynamic     → React.lazy + Suspense
  5. next/form        → plain <form>
  6. server-action paths → @/lib/compat/server-actions/*
"""

import re
import os
import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # ── 1. next-intl ──────────────────────────────────────────────────────
    content = content.replace(
        "import { useTranslations } from 'next-intl'",
        "import { useTranslations } from '@/hooks/use-translations'"
    )
    # next-intl/server (async server-only) – remove entirely (not used client-side)
    content = re.sub(
        r"import \{[^}]+\} from 'next-intl/server'[;\n]?",
        '',
        content
    )

    # ── 2. next/link ──────────────────────────────────────────────────────
    content = content.replace(
        "import Link from 'next/link'",
        "import { Link } from 'react-router-dom'"
    )
    # Change <Link href=  →  <Link to=  (only for Link component, not <a>)
    content = re.sub(r'(<Link\b[^>]*?)\bhref=', r'\1to=', content)
    # Remove prefetch prop from Link
    content = re.sub(r'\s+prefetch=\{(?:false|true|null)\}', '', content)
    content = re.sub(r'\s+prefetch="[^"]*"', '', content)

    # ── 3. next/navigation ────────────────────────────────────────────────
    # Handle combined imports from 'next/navigation'
    def rewrite_navigation_import(m):
        raw = m.group(1)
        names = [s.strip() for s in raw.split(',')]
        rr_names = []
        for name in names:
            if name == 'useRouter':
                rr_names.append('useNavigate')
            elif name == 'usePathname':
                rr_names.append('useLocation')
            elif name in ('useSearchParams', 'useParams'):
                rr_names.append(name)  # same name in react-router-dom
            elif name in ('redirect', 'notFound', 'unauthorized'):
                pass  # drop – server-only, not needed in client components
            else:
                rr_names.append(name)

        if not rr_names:
            return ''
        return f"import {{ {', '.join(rr_names)} }} from 'react-router-dom'"

    content = re.sub(
        r"import \{([^}]+)\} from 'next/navigation'",
        rewrite_navigation_import,
        content
    )

    # useRouter() → useNavigate()
    content = re.sub(r'\buseRouter\(\)', 'useNavigate()', content)
    content = re.sub(r'\bconst router\s*=\s*useNavigate\(\)', 'const navigate = useNavigate()', content)
    # In case it was already named navigate elsewhere
    content = re.sub(r'\bconst (\w+)\s*=\s*useNavigate\(\)', r'const \1 = useNavigate()', content)

    # router.push(…) → navigate(…)
    content = re.sub(r'\brouter\.push\(', 'navigate(', content)

    # router.replace('url') → navigate('url', { replace: true })
    # Handle string literals
    content = re.sub(
        r"\brouter\.replace\(('(?:[^'\\]|\\.)*')\)",
        r"navigate(\1, { replace: true })",
        content
    )
    # Handle template literals
    content = re.sub(
        r'\brouter\.replace\((`(?:[^`\\]|\\.)*`)\)',
        r'navigate(\1, { replace: true })',
        content
    )
    # Handle variable references
    content = re.sub(
        r'\brouter\.replace\((\w+)\)',
        r'navigate(\1, { replace: true })',
        content
    )

    # router.back() → navigate(-1)
    content = re.sub(r'\brouter\.back\(\)', 'navigate(-1)', content)

    # router.refresh() → (no-op - SWR handles revalidation)
    content = re.sub(r'\brouter\.refresh\(\)\s*\n?', '', content)
    content = re.sub(r'\brouter\.refresh\(\)', '', content)

    # useToRef(router.push) → useToRef(navigate) (thread-dropdown pattern)
    content = re.sub(r'useToRef\(router\.push\)', 'useToRef(navigate)', content)

    # Dependency arrays [router] → [navigate]
    content = re.sub(r'\[router\]', '[navigate]', content)
    content = re.sub(r',\s*router\b', ', navigate', content)
    content = re.sub(r'\brouter\b,', 'navigate,', content)

    # usePathname() → useLocation()  +  adjust variable usage
    content = re.sub(r'\busePathname\(\)', 'useLocation()', content)
    # const pathname = useLocation() → const { pathname } = useLocation()
    content = re.sub(
        r'\bconst (\w+)\s*=\s*useLocation\(\)',
        lambda m: (
            f"const {{ pathname: {m.group(1)} }} = useLocation()"
            if m.group(1) != 'pathname'
            else "const { pathname } = useLocation()"
        ),
        content
    )

    # useSearchParams() — react-router returns a tuple
    # const searchParams = useSearchParams() → const [searchParams] = useSearchParams()
    content = re.sub(
        r'\bconst (\w+)\s*=\s*useSearchParams\(\)',
        r'const [\1] = useSearchParams()',
        content
    )

    # ── 4. next/dynamic → React.lazy + Suspense ───────────────────────────
    if "from 'next/dynamic'" in content:
        content = content.replace(
            "import dynamic from 'next/dynamic'",
            "import { lazy, Suspense } from 'react'"
        )
        # Remove 'import { ..., Suspense, ... } from 'react'' duplication handled later
        # dynamic(() => import(path)) → lazy(() => import(path))
        # Pattern: dynamic(() => import('...').then(mod => mod.Name), { ... })
        # → const Name = lazy(() => import('...').then(mod => ({ default: mod.Name })))
        # Simpler pattern: dynamic(() => import('./path')) → lazy(() => import('./path'))
        content = re.sub(
            r"\bdynamic\(\s*\(\)\s*=>\s*import\((['\"].*?['\"])\)\s*,\s*\{[^}]*\}\s*\)",
            r"lazy(() => import(\1))",
            content
        )
        content = re.sub(
            r"\bdynamic\(\s*\(\)\s*=>\s*import\((['\"].*?['\"])\)\s*\)",
            r"lazy(() => import(\1))",
            content
        )
        # Pattern with .then(mod => mod.Name) and options
        content = re.sub(
            r"\bdynamic\(\s*\(\)\s*=>\s*import\((['\"].*?['\"])\)\.then\(\(mod\)\s*=>\s*mod\.(\w+)\)\s*,\s*\{[^}]*\}\s*\)",
            r"lazy(() => import(\1).then((mod) => ({ default: mod.\2 })))",
            content
        )
        content = re.sub(
            r"\bdynamic\(\s*\(\)\s*=>\s*import\((['\"].*?['\"])\)\.then\(\(mod\)\s*=>\s*mod\.(\w+)\)\s*\)",
            r"lazy(() => import(\1).then((mod) => ({ default: mod.\2 })))",
            content
        )

    # ── 5. next/form → plain form ─────────────────────────────────────────
    if "from 'next/form'" in content:
        content = re.sub(r"import Form from 'next/form'\s*\n", '', content)
        content = content.replace('<Form ', '<form ').replace('</Form>', '</form>')

    # ── 6. Server action imports → compat shims ───────────────────────────
    content = content.replace(
        "from '@/app/api/archive/actions'",
        "from '@/lib/compat/server-actions/archive'"
    )
    content = content.replace(
        "from '@/app/api/auth/actions'",
        "from '@/lib/compat/server-actions/auth'"
    )
    content = content.replace(
        "from '@/app/api/chat/actions'",
        "from '@/lib/compat/server-actions/chat'"
    )
    content = content.replace(
        "from '@/app/api/mcp/actions'",
        "from '@/lib/compat/server-actions/mcp'"
    )
    content = content.replace(
        "from '@/app/api/user/actions'",
        "from '@/lib/compat/server-actions/user'"
    )
    content = content.replace(
        "from '@/app/api/admin/actions'",
        "from '@/lib/compat/server-actions/admin'"
    )
    # Validation types can still be imported from original location (types only, no server deps)

    # ── 7. Fix Suspense duplication (if lazy was added) ───────────────────
    # If we added lazy and React already imports Suspense, deduplicate
    # This is complex to do perfectly; leave for tsc to catch

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False


def main():
    base = 'src/components'
    changed = []
    unchanged = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d != 'ui']  # skip ui/ (no next imports)
        for fname in files:
            if fname.endswith('.tsx') or fname.endswith('.ts'):
                fpath = os.path.join(root, fname)
                if process_file(fpath):
                    changed.append(fpath)
                else:
                    unchanged.append(fpath)

    print(f"Changed: {len(changed)} files")
    for f in changed:
        print(f"  ✓ {f}")
    print(f"Unchanged: {len(unchanged)} files")


if __name__ == '__main__':
    main()

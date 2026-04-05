import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Handles the OAuth callback and email confirmation redirect.
 * Supabase redirects here after Google login or email link click.
 *
 * Add this URL to:
 *  - Supabase Dashboard > Auth > URL Configuration > Redirect URLs:
 *    http://localhost:3000/auth/callback
 *    https://<your-production-domain>/auth/callback
 *  - Google Cloud Console > OAuth 2.0 > Authorized redirect URIs:
 *    https://utsbalwypdpemjcvnowz.supabase.co/auth/v1/callback
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Validate `next` is a relative path to prevent open redirect attacks
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — redirect to login with an error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

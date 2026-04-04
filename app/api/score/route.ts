import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY })

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { detail } = body

  if (!detail) {
    return Response.json({ error: 'detail required' }, { status: 400 })
  }

  const reviewsText = detail.reviews.length > 0
    ? detail.reviews.map((r: any, i: number) =>
        `Review ${i + 1} (${r.rating}/5 stars, ${r.relativeTime}): ${r.text}`
      ).join('\n\n')
    : 'No reviews available.'

  const prompt = `You are an accessibility expert analyzing a public location for people with disabilities.

Location: ${detail.name}
Address: ${detail.address}
Google Rating: ${detail.rating ?? 'N/A'} (${detail.userRatingsTotal} reviews)
Location Types: ${detail.types.slice(0, 5).join(', ')}
Wheelchair Accessible Entrance (per Google): ${detail.wheelchairAccessibleEntrance === true ? 'Yes' : detail.wheelchairAccessibleEntrance === false ? 'No' : 'Unknown'}

Recent reviews:
${reviewsText}

Based on the above, provide an accessibility assessment. Look for mentions of: wheelchair ramps, elevators, accessible parking, ADA compliance, wide doorways, accessible restrooms, step-free access, hearing loops, braille signage, staff helpfulness for disabled visitors.

Respond with ONLY valid JSON in this exact format:
{
  "grade": "A",
  "tags": ["Wheelchair", "Elevator", "ADA", "Parking"],
  "summary": "One sentence summary of accessibility for disabled visitors."
}

Grade scale: A+ (exceptional), A (excellent), A- (very good), B+ (good), B (decent), B- (adequate), C+ (fair), C (limited), C- (poor), D (very poor), F (inaccessible/unknown).
Tags must only be from: Wheelchair, Elevator, ADA, Parking, Ramp, RestRoom, Braille, HearingLoop, StepFree.
Include only tags that are explicitly mentioned or strongly implied. Return 0-4 tags.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return Response.json({ error: 'Failed to parse score' }, { status: 502 })
  }

  const score = JSON.parse(jsonMatch[0])
  return Response.json({ score })
}

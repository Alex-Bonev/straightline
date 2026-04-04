import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'data', 'annotations.json')

interface Annotation {
  id: string
  placeId: string
  position: { x: number; y: number; z: number }
  note: string
  label: string
  createdAt: string
}

interface DB {
  annotations: Annotation[]
}

async function readDB(): Promise<DB> {
  const raw = await readFile(DB_PATH, 'utf-8')
  return JSON.parse(raw)
}

async function writeDB(db: DB): Promise<void> {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf-8')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId')
  const db = await readDB()
  const filtered = placeId
    ? db.annotations.filter((a) => a.placeId === placeId)
    : db.annotations
  return Response.json({ annotations: filtered })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { placeId, position, note, label } = body

  if (!placeId || !position || !note) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const annotation: Annotation = {
    id: crypto.randomUUID(),
    placeId,
    position,
    note,
    label: label || '',
    createdAt: new Date().toISOString(),
  }

  const db = await readDB()
  db.annotations.push(annotation)
  await writeDB(db)

  return Response.json({ annotation })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, position } = body

  if (!id || !position) {
    return Response.json({ error: 'Missing id or position' }, { status: 400 })
  }

  const db = await readDB()
  const annotation = db.annotations.find((a) => a.id === id)
  if (!annotation) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  annotation.position = position
  await writeDB(db)

  return Response.json({ annotation })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }

  const db = await readDB()
  db.annotations = db.annotations.filter((a) => a.id !== id)
  await writeDB(db)

  return Response.json({ success: true })
}

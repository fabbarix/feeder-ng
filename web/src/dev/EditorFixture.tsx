// Dev-only fixture (route /_editor-fixture, stripped from production builds like /_gallery): the photo editor as the Photo tab hosts it,
// on a picture generated on the fly, so scripts/check-shell-layout.mjs can measure the real layout in Chrome. ?w=2268&h=3226 sets the size.
import { useEffect, useState } from 'react'
import { PhotoEditorPanel } from '../features/import/components/PhotoEditorPanel'
import { Button, initialEdit, Tile, type ImageEdit } from '../ui'
import '../features/import/import.css'

/** A grid picture of the given size as an object URL (a canvas, so no file ships). */
function makePicture(width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  g.fillStyle = '#c9b99a'
  g.fillRect(0, 0, width, height)
  g.fillStyle = '#222'
  for (let y = 0; y < height; y += 200) g.fillRect(0, y, width, 6)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(URL.createObjectURL(b!)), 'image/jpeg', 0.5))
}

export function EditorFixture() {
  const params = new URLSearchParams(location.search)
  const width = Number(params.get('w') ?? 2268)
  const height = Number(params.get('h') ?? 3226)
  const [src, setSrc] = useState<string | null>(null)
  const [draft, setDraft] = useState<ImageEdit>(() => initialEdit({ width, height }, 'free'))
  useEffect(() => {
    let url: string | null = null
    void makePicture(width, height).then((u) => {
      url = u
      setSrc(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [width, height])
  if (!src) return <p>Loading the picture</p>
  return (
    <main data-fixture="image-editor" style={{ padding: 16 }}>
      {/* Hosted as the Read step hosts it: inside a Tile (Tile.css restyles every button in it). */}
      <Tile as="section" overline="Step 1">
      <PhotoEditorPanel
        session={{ id: 'p1' as never, draft, isNew: true }}
        number={1}
        src={src}
        size={{ width, height }}
        small={false}
        canRetake
        onChange={setDraft}
        onUse={() => {}}
        onCancel={() => {}}
        onRetake={() => {}}
      />
      <p>Finish editing the photo first.</p>
      <Button variant="primary" data-fixture-below="">Read recipe</Button>
      </Tile>
    </main>
  )
}

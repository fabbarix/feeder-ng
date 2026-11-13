// The shared ImageFileInput's capture prop is how a feature asks for the camera: not a violation, on one line or several.
import { ImageFileInput } from '../../ui'
export const Camera = ({ onPhone }: { onPhone: boolean }) => (
  <div>
    <ImageFileInput capture={onPhone} onFiles={() => {}} />
    <ImageFileInput
      capture={onPhone}
      onFiles={(files) => files.length}
    />
  </div>
)

declare module '@mkkellogg/gaussian-splats-3d' {
  export enum SceneRevealMode {
    Default = 0,
    Gradual = 1,
    Instant = 2,
  }

  export interface ViewerOptions {
    cameraUp?: number[]
    initialCameraPosition?: number[]
    initialCameraLookAt?: number[]
    selfDrivenMode?: boolean
    useBuiltInControls?: boolean
    rootElement?: HTMLElement
    sceneRevealMode?: SceneRevealMode
  }

  export interface SplatSceneOptions {
    progressiveLoad?: boolean
    onProgress?: (progress: number) => void
  }

  export class Viewer {
    constructor(options?: ViewerOptions)
    addSplatScene(url: string, options?: SplatSceneOptions): Promise<void>
    start(): void
    dispose(): void
    camera: import('three').PerspectiveCamera
    renderer: import('three').WebGLRenderer
    splatMesh: import('three').Mesh
  }
}

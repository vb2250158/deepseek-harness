/** Composition of one navigation provider and its presentation. */
import type { BrowserPresentation } from '../view/BrowserPresentation.ts'
import type { BrowserFrame } from './BrowserFrame.ts'
import type { BrowserTabState } from './BrowserPersistence.ts'

/** Provider construction inputs; persistence does not enter the live navigation interface. */
export interface BrowserPageOptions {
  readonly initial: BrowserTabState | undefined
  readonly persist: (state: BrowserTabState) => void
  readonly openRequested: (url: string) => void
}

/** The owning controller disposes frame; UI mounts only presentation. */
export interface BrowserPage {
  readonly frame: BrowserFrame
  readonly presentation: BrowserPresentation
  /** Optional current iframe lease; obtaining it does not inspect cross-origin content. */
  readonly messageTarget?: () => BrowserMessageTarget | undefined
}

/** A physical iframe lease becomes invalid when its element is replaced or hidden. */
export interface BrowserMessageTarget {
  readonly source: Window
  /** @returns whether this exact physical iframe remains connected and visible. */
  isVisible(): boolean
  /** Send a bridge challenge only while this physical iframe is visible. @param value - challenge, never credentials. */
  send(value: unknown): void
}

/** Construct an idle provider without attaching DOM; saved navigation waits for an explicit frame command. */
export type BrowserPageFactory = (options: BrowserPageOptions) => BrowserPage

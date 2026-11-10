/** Production user content for component units; registry integration uses SlotTestRuntime. */
import { createElement, type ComponentProps } from 'react'
import type { PropsLocale, PropsRenderFactories, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTextInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createUserTextFixture } from '../../ui-conversation/tests/user-text-component-fixture.client.tsx'
import type { UserContentInput, UserRowInput } from '../src/client/contract/slots.ts'
import { UserContent } from '../src/client/chat/UserContent.tsx'
import { UserRowBody } from '../src/client/chat/UserRow.tsx'

/**
 * Draw the production default row inside a component fixture.
 * @param input - prepared content and actual admission state.
 * @param renderFactorySlot - fixture Factory dispatcher.
 * @param t - Chat translation seat.
 * @param renderSlotChain - source-decoration fixture renderer.
 * @returns the production row with explicit fixture seats.
 */
export function renderUserRowFixture(input: UserRowInput,
  renderFactorySlot: PropsRenderFactories['renderFactorySlot'], t: PropsLocale<'chat'>['t'],
  renderSlotChain: PropsRenderSlots<'conversation.chat.user.before'>['renderSlotChain'] = () => null,
) {
  return createElement(UserRowBody, { ...input, renderFactorySlot, renderSlotChain, t } as ComponentProps<typeof UserRowBody>)
}

/**
 * Bind real text parsing and business renderers for one component-test lifetime.
 * @param actions - reference operations supplied by the test's node-injection fixture.
 * @returns renderer accepting prepared content, the user-image Slot seat, and Chat locale.
 */
export function createUserContentFixture(actions?: Parameters<typeof createUserTextFixture>[0]) {
  const renderUserText = createUserTextFixture(actions)
  return (
    input: UserContentInput,
    renderSlot: PropsRenderSlots<'conversation.chat.user.images'>['renderSlot'],
    t: PropsLocale<'chat'>['t'],
  ) => {
    const renderFactory: PropsRenderFactories['renderFactorySlot'] = (name, owner) => {
      if (name !== 'conversation.user.text') throw new Error(`Unexpected user content Factory: ${name}`)
      return renderUserText(owner as UserTextInput)
    }
    return createElement(UserContent, { ...input, renderSlot, renderFactorySlot: renderFactory, t } as ComponentProps<typeof UserContent>)
  }
}

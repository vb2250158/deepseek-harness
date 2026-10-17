/** `goal` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'phase.active': '进行中的目标',
  'phase.active.disarmed': '已暂停的目标',
  'phase.paused': '已暂停的目标',
  'phase.blocked': '受阻的目标',
  'objective.aria': '目标内容',
  'commandInput.aria': '指令输入',
  'dialog.title': '编辑目标',
  'dialog.description': '目标会作为长期指令持续影响这个会话，直到你清除它。',
  'action.save': '保存',
  'action.saving': '保存中',
  'action.cancel': '取消',
  'action.close': '关闭',
  'action.pause': '暂停目标',
  'action.resume': '恢复目标',
  'action.edit': '编辑目标',
  'action.clear': '清除目标',
  'error.save': '目标保存失败',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.active.disarmed': 'Inactive Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'dialog.title': 'Edit goal',
  'dialog.description': 'The goal keeps steering this session as a standing instruction until you clear it.',
  'action.save': 'Save',
  'action.saving': 'Saving',
  'action.cancel': 'Cancel',
  'action.close': 'Close',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
  'error.save': 'Could not save the goal',
} satisfies Record<GoalKey, string>

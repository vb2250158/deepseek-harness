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

/** Japanese copy, checked against the English keys. */
export const ja = {
  'dialog.title': '目標を編集',
  'dialog.description': '目標を解除するまで、このセッションへの継続的な指示として適用されます。',
  'action.saving': '保存中',
  'action.close': '閉じる',
  'error.save': '目標を保存できませんでした',
  'phase.active': '進行中の目標',
  'phase.active.disarmed': '非アクティブな目標',
  'phase.paused': '一時停止中の目標',
  'phase.blocked': 'ブロックされた目標',
  'objective.aria': '目標の目的',
  'commandInput.aria': 'コマンド入力',
  'action.save': '目標を保存',
  'action.cancel': '編集をキャンセル',
  'action.pause': '目標を一時停止',
  'action.resume': '目標を再開',
  'action.edit': '目標を編集',
  'action.clear': '目標をクリア',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'dialog.title': 'Editar objetivo',
  'dialog.description': 'El objetivo seguirá guiando esta sesión como instrucción permanente hasta que lo borres.',
  'action.saving': 'Guardando',
  'action.close': 'Cerrar',
  'error.save': 'No se pudo guardar el objetivo',
  'phase.active': 'Meta en curso',
  'phase.active.disarmed': 'Meta inactiva',
  'phase.paused': 'Objetivo en pausa',
  'phase.blocked': 'Meta bloqueada',
  'objective.aria': 'Objetivo de meta',
  'commandInput.aria': 'Entrada de comando',
  'action.save': 'Guardar gol',
  'action.cancel': 'Cancelar edición',
  'action.pause': 'Pausar objetivo',
  'action.resume': 'Reanudar objetivo',
  'action.edit': 'Editar objetivo',
  'action.clear': 'Objetivo claro',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'dialog.title': 'Modifier l’objectif',
  'dialog.description': 'L’objectif continue de guider cette session comme une instruction permanente jusqu’à sa suppression.',
  'action.saving': 'Enregistrement',
  'action.close': 'Fermer',
  'error.save': 'Impossible d’enregistrer l’objectif',
  'phase.active': 'Objectif continu',
  'phase.active.disarmed': 'Objectif inactif',
  'phase.paused': 'Objectif suspendu',
  'phase.blocked': 'Objectif bloqué',
  'objective.aria': 'Objectif du but',
  'commandInput.aria': 'Entrée de commande',
  'action.save': "Sauvegarder l'objectif",
  'action.cancel': 'Annuler la modification',
  'action.pause': "Suspendre l'objectif",
  'action.resume': "Reprendre l'objectif",
  'action.edit': "Modifier l'objectif",
  'action.clear': 'Objectif clair',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'dialog.title': 'Ziel bearbeiten',
  'dialog.description': 'Das Ziel steuert diese Sitzung als dauerhafte Anweisung, bis du es löschst.',
  'action.saving': 'Wird gespeichert',
  'action.close': 'Schließen',
  'error.save': 'Das Ziel konnte nicht gespeichert werden',
  'phase.active': 'Fortlaufendes Ziel',
  'phase.active.disarmed': 'Inaktives Ziel',
  'phase.paused': 'Pausiertes Ziel',
  'phase.blocked': 'Blockiertes Ziel',
  'objective.aria': 'Zielziel',
  'commandInput.aria': 'Befehlseingabe',
  'action.save': 'Ziel speichern',
  'action.cancel': 'Bearbeitung abbrechen',
  'action.pause': 'Ziel pausieren',
  'action.resume': 'Ziel fortsetzen',
  'action.edit': 'Ziel bearbeiten',
  'action.clear': 'Klares Ziel',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'dialog.title': 'Изменить цель',
  'dialog.description': 'Цель продолжает направлять этот сеанс как постоянная инструкция, пока вы её не удалите.',
  'action.saving': 'Сохранение',
  'action.close': 'Закрыть',
  'error.save': 'Не удалось сохранить цель',
  'phase.active': 'Текущая цель',
  'phase.active.disarmed': 'Неактивная цель',
  'phase.paused': 'Приостановленная цель',
  'phase.blocked': 'Заблокированная цель',
  'objective.aria': 'Цель Цель',
  'commandInput.aria': 'Ввод команды',
  'action.save': 'Сохранить цель',
  'action.cancel': 'Отменить редактирование',
  'action.pause': 'Приостановить цель',
  'action.resume': 'Возобновить цель',
  'action.edit': 'Изменить цель',
  'action.clear': 'Четкая цель',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'dialog.title': 'Editar objetivo',
  'dialog.description': 'O objetivo continua a orientar esta sessão como instrução permanente até ser removido.',
  'action.saving': 'A guardar',
  'action.close': 'Fechar',
  'error.save': 'Não foi possível guardar o objetivo',
  'phase.active': 'Meta contínua',
  'phase.active.disarmed': 'Meta inativa',
  'phase.paused': 'Meta pausada',
  'phase.blocked': 'Meta bloqueada',
  'objective.aria': 'Objetivo da meta',
  'commandInput.aria': 'Entrada de comando',
  'action.save': 'Salvar meta',
  'action.cancel': 'Cancelar edição',
  'action.pause': 'Pausar meta',
  'action.resume': 'Retomar meta',
  'action.edit': 'Editar meta',
  'action.clear': 'Objetivo claro',
} satisfies Record<keyof typeof en, string>

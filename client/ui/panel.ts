// Clay — Contextual property panel. The UI *becomes* the object (Figma insight):
// it is generated entirely from the SemanticObject's param schema + groups.

import type { Param, SemanticObject } from '../semantic/types'
import { groupParams } from '../semantic/types'

export type OnParamChange = (key: string, value: Param['value']) => void

function fmt(p: Param): string {
  if (p.type === 'number') {
    const v = Number(p.value)
    return p.unit === 'm' ? `${v.toFixed(2)} m` : String(v)
  }
  return String(p.value)
}

export function renderPanel(
  root: HTMLElement,
  obj: SemanticObject,
  onChange: OnParamChange
): void {
  root.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'panel-header'
  header.innerHTML = `<span class="type-badge">${obj.type}</span><h2>${obj.label}</h2>`
  root.appendChild(header)

  const groups = groupParams(obj.params)
  for (const [groupName, params] of Object.entries(groups)) {
    const section = document.createElement('section')
    section.className = 'param-group'
    const title = document.createElement('h3')
    title.textContent = groupName
    section.appendChild(title)

    for (const p of params) {
      section.appendChild(buildRow(p, onChange))
    }
    root.appendChild(section)
  }
}

function buildRow(p: Param, onChange: OnParamChange): HTMLElement {
  const row = document.createElement('div')
  row.className = 'param-row'

  const label = document.createElement('label')
  label.textContent = p.label
  const valOut = document.createElement('span')
  valOut.className = 'param-value'
  valOut.textContent = fmt(p)
  label.appendChild(valOut)
  row.appendChild(label)

  if (p.type === 'number') {
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(p.min ?? 0)
    input.max = String(p.max ?? 1)
    input.step = String(p.step ?? 0.01)
    input.value = String(p.value)
    input.addEventListener('input', () => {
      const v = Number(input.value)
      valOut.textContent = fmt({ ...p, value: v })
      onChange(p.key, v)
    })
    row.appendChild(input)
  } else if (p.type === 'enum') {
    const select = document.createElement('select')
    for (const opt of p.options ?? []) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      if (opt === p.value) o.selected = true
      select.appendChild(o)
    }
    select.addEventListener('change', () => {
      valOut.textContent = select.value
      onChange(p.key, select.value)
    })
    row.appendChild(select)
  } else if (p.type === 'bool') {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = Boolean(p.value)
    input.addEventListener('change', () => onChange(p.key, input.checked))
    row.appendChild(input)
  }

  return row
}

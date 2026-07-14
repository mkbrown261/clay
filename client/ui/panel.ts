// Clay — Contextual property panel. The UI *becomes* the object (Figma insight):
// it is generated entirely from the SemanticObject's param schema + groups.
// Drivers are editable; DERIVED params are read-only read-outs that update live.

import type { Param, SemanticObject } from '../semantic/types'
import { groupParams } from '../semantic/types'
import { formatDerived } from '../semantic/constraints'

export type OnParamChange = (key: string, value: Param['value']) => void

function fmt(p: Param): string {
  if (p.derived) return formatDerived(p.key, Number(p.value))
  if (p.type === 'number') {
    const v = Number(p.value)
    if (p.unit === 'm') return `${v.toFixed(2)} m`
    if (p.unit === 'cm') return `${v.toFixed(2)} cm`
    return String(v)
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
    if (groupName === '__hidden') continue
    const section = document.createElement('section')
    section.className = 'param-group' + (groupName === 'Derived' ? ' derived-group' : '')
    const title = document.createElement('h3')
    title.textContent = groupName
    if (groupName === 'Derived') {
      const tag = document.createElement('span')
      tag.className = 'derived-tag'
      tag.textContent = 'auto'
      title.appendChild(tag)
    }
    section.appendChild(title)

    for (const p of params) {
      section.appendChild(p.derived ? buildDerivedRow(p) : buildRow(p, onChange))
    }
    root.appendChild(section)
  }
}

// Read-only derived read-out (no control, just a live value).
function buildDerivedRow(p: Param): HTMLElement {
  const row = document.createElement('div')
  row.className = 'param-row derived-row'
  row.dataset.key = p.key
  const label = document.createElement('label')
  label.textContent = p.label
  const valOut = document.createElement('span')
  valOut.className = 'param-value derived-value'
  valOut.textContent = fmt(p)
  label.appendChild(valOut)
  row.appendChild(label)
  return row
}

function buildRow(p: Param, onChange: OnParamChange): HTMLElement {
  const row = document.createElement('div')
  row.className = 'param-row'
  row.dataset.key = p.key

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

  // "affects" relationship chip — every driver knows what it affects.
  if (p.affects && p.affects.length) {
    const affects = document.createElement('div')
    affects.className = 'affects'
    affects.innerHTML = `<i class="fa-solid fa-arrow-down-long"></i> affects ${p.affects
      .map((a) => `<span>${a}</span>`)
      .join('')}`
    row.appendChild(affects)
  }

  return row
}

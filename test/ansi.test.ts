import { describe, it, expect } from 'vitest'
import { ansiToHtml, stripAnsi, hasAnsi } from '../src/utils/ansi'

const ESC = '\u001b'

describe('stripAnsi', () => {
  it('supprime les séquences SGR', () => {
    expect(stripAnsi(`${ESC}[2m  - waiting${ESC}[22m`)).toBe('  - waiting')
  })

  it('supprime les déplacements de curseur et les titres OSC', () => {
    expect(stripAnsi(`a${ESC}[2Kb${ESC}]0;titre${ESC}\\c`)).toBe('abc')
  })

  it('laisse un texte ordinaire intact', () => {
    expect(stripAnsi('netstat -ano | grep LISTENING')).toBe('netstat -ano | grep LISTENING')
  })
})

describe('ansiToHtml', () => {
  it('rend un passage grisé', () => {
    expect(ansiToHtml(`${ESC}[2mwaiting${ESC}[22m ok`)).toBe('<span class="ansi-dim">waiting</span> ok')
  })

  it('échappe le HTML de la source', () => {
    const html = ansiToHtml(`${ESC}[31m<a href="x">${ESC}[0m`)
    expect(html).toBe('<span class="ansi-fg-red">&lt;a href=&quot;x&quot;&gt;</span>')
  })

  it('échappe aussi le texte non stylé', () => {
    expect(ansiToHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('cumule les attributs et remet à zéro sur 0', () => {
    expect(ansiToHtml(`${ESC}[1m${ESC}[31mgras rouge${ESC}[0mnormal`)).toBe('<span class="ansi-fg-red ansi-bold">gras rouge</span>normal')
  })

  it('ramène les couleurs vives sur la teinte de base', () => {
    expect(ansiToHtml(`${ESC}[92mok${ESC}[39m`)).toBe('<span class="ansi-fg-green">ok</span>')
  })

  it('ignore les couleurs 256 et truecolor hors des 16 de base', () => {
    expect(ansiToHtml(`${ESC}[38;5;208mx${ESC}[0m`)).toBe('x')
    expect(ansiToHtml(`${ESC}[38;2;10;20;30my${ESC}[0m`)).toBe('y')
    expect(ansiToHtml(`${ESC}[38;5;1mz${ESC}[0m`)).toBe('<span class="ansi-fg-red">z</span>')
  })

  it('interprète ESC[m comme une remise à zéro', () => {
    expect(ansiToHtml(`${ESC}[31ma${ESC}[mb`)).toBe('<span class="ansi-fg-red">a</span>b')
  })

  it('inverse la vidéo en échangeant les deux plans', () => {
    expect(ansiToHtml(`${ESC}[7minv${ESC}[27m`)).toBe('<span class="ansi-fg-black ansi-bg-white">inv</span>')
  })

  it('supprime les retours chariot que HTML ne sait pas rejouer', () => {
    expect(ansiToHtml('50%\r100%')).toBe('50%100%')
    expect(ansiToHtml('a\r\nb')).toBe('a\r\nb')
  })
})

describe('hasAnsi', () => {
  it('repart de zéro entre deux appels malgré le drapeau global', () => {
    const s = `${ESC}[2mx${ESC}[22m`
    expect(hasAnsi(s)).toBe(true)
    expect(hasAnsi(s)).toBe(true)
  })

  it('est faux sur du texte nu', () => {
    expect(hasAnsi('rien à signaler')).toBe(false)
  })
})

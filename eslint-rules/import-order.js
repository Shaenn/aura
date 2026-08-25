import { builtinModules } from 'node:module'

const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]))

/**
 * @typedef {'builtin' | 'external' | 'parent' | 'sibling' | 'index'} ImportGroup
 */

/** @type {ImportGroup[]} */
const GROUP_ORDER = ['builtin', 'external', 'parent', 'sibling', 'index']

/**
 * @param {string} source
 * @returns {ImportGroup}
 */
function getGroup(source) {
  if (builtins.has(source)) {
    return 'builtin'
  }
  if (source === '.' || source === './' || source === './index') {
    return 'index'
  }
  if (source.startsWith('./')) {
    return 'sibling'
  }
  if (source.startsWith('../')) {
    return 'parent'
  }
  return 'external'
}

/**
 * @param {string} source
 * @returns {number}
 */
function groupRank(source) {
  return GROUP_ORDER.indexOf(getGroup(source))
}

/**
 * @param {import('estree').ImportDeclaration} a
 * @param {import('estree').ImportDeclaration} b
 * @returns {number}
 */
function compareImports(a, b) {
  const srcA = /** @type {string} */ (a.source.value)
  const srcB = /** @type {string} */ (b.source.value)
  const rankDiff = groupRank(srcA) - groupRank(srcB)
  if (rankDiff !== 0) {
    return rankDiff
  }
  return srcA.localeCompare(srcB)
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce import ordering by group (builtin, external, parent, sibling, index) then alphabetically within each group',
    },
    fixable: 'code',
    schema: [],
    messages: {
      outOfOrder: "'{{ current }}' ({{ currentGroup }}) should come before '{{ previous }}' ({{ previousGroup }}).",
    },
  },

  create(context) {
    return {
      Program(node) {
        /** @type {import('estree').ImportDeclaration[]} */
        const imports = node.body.filter((/** @type {import('estree').Statement} */ s) => s.type === 'ImportDeclaration')

        if (imports.length < 2) {
          return
        }

        for (let i = 1; i < imports.length; i++) {
          if (compareImports(imports[i - 1], imports[i]) > 0) {
            const prev = /** @type {string} */ (imports[i - 1].source.value)
            const curr = /** @type {string} */ (imports[i].source.value)

            context.report({
              node: imports[i],
              messageId: 'outOfOrder',
              data: {
                current: curr,
                currentGroup: getGroup(curr),
                previous: prev,
                previousGroup: getGroup(prev),
              },
              fix(fixer) {
                const sourceCode = context.sourceCode
                const sorted = [...imports].sort(compareImports)

                /** @type {[number, number]} */
                const originalRange = [imports[0].range[0], imports[imports.length - 1].range[1]]

                const sortedText = sorted.map((imp) => sourceCode.getText(imp)).join('\n')

                return fixer.replaceTextRange(originalRange, sortedText)
              },
            })
            break
          }
        }
      },
    }
  },
}

export default rule

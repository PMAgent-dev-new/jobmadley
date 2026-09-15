/** RFC 4180形式の引用符とフィールド内改行を扱うTSVパーサー。 */
export function parseCatalogTsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const finishField = () => {
    row.push(field)
    field = ''
  }
  const finishRow = () => {
    finishField()
    if (row.some((value) => value.length > 0)) rows.push(row)
    row = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      if (field.length > 0) throw new Error('TSVの引用符がフィールド先頭以外にあります')
      quoted = true
    } else if (char === '\t') {
      finishField()
    } else if (char === '\n') {
      finishRow()
    } else if (char !== '\r') {
      field += char
    }
  }
  if (quoted) throw new Error('TSVの引用符が閉じていません')
  if (field.length > 0 || row.length > 0) finishRow()
  return rows
}

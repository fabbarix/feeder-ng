import { Fragment } from 'react'
import { emailBreak, nameBreak } from '../lib/textBreaks'
import '../access.css'

/** The pieces as plain text with a <wbr> between them (inside `white-space: nowrap`, a line may end only at a <wbr>). */
function Pieces({ pieces }: { pieces: string[] }) {
  return (
    <>
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {piece}
        </Fragment>
      ))}
    </>
  )
}

/** An email that wraps only before "@" and after "." (SET-03), never mid-word or at a hyphen. The title carries it whole.
 *  `parenthesised` keeps "(" and ")" on the address, so neither is left alone at a line's end or start. */
export function EmailText({ email, parenthesised }: { email: string; parenthesised?: boolean }) {
  return (
    <span className="break-text" title={email}>
      {parenthesised ? '(' : null}
      <Pieces pieces={emailBreak(email)} />
      {parenthesised ? ')' : null}
    </span>
  )
}

/** A name that wraps only after its spaces: a hyphenated part ("Rossi-Verdi") never breaks at its hyphen. */
export function NameText({ name }: { name: string }) {
  // A break goes after each run of spaces, so a wrapped line never starts with a space.
  const pieces = nameBreak(name).reduce<string[]>((out, p) => {
    if (/^\s+$/.test(p) && out.length > 0) out[out.length - 1] += p
    else out.push(p)
    return out
  }, [])
  return (
    <span className="break-text">
      <Pieces pieces={pieces} />
    </span>
  )
}

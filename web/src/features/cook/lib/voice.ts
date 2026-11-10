// Voice commands for Cook Mode. Plain TypeScript, no React.

export type VoiceCommand = 'next' | 'back' | 'repeat' | 'startTimer' | 'pauseTimer'

const PHRASES: Record<string, VoiceCommand> = {
  next: 'next',
  'next step': 'next',
  back: 'back',
  'go back': 'back',
  previous: 'back',
  'previous step': 'back',
  repeat: 'repeat',
  again: 'repeat',
  'say again': 'repeat',
  'start timer': 'startTimer',
  'start the timer': 'startTimer',
  'pause timer': 'pauseTimer',
  'pause the timer': 'pauseTimer',
}

/**
 * Maps what the speech recogniser heard to a command, or null. Case,
 * surrounding space and trailing punctuation are ignored. Accepted phrases:
 * next / next step -> next; back / go back / previous / previous step -> back;
 * repeat / again / say again -> repeat; start timer / start the timer -> startTimer;
 * pause timer / pause the timer -> pauseTimer. A phrase that merely contains a
 * command word inside a longer sentence ("I will go back to the shop") is not a command.
 */
export function parseCommand(transcript: string): VoiceCommand | null {
  const phrase = transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!phrase) return null
  return Object.prototype.hasOwnProperty.call(PHRASES, phrase) ? PHRASES[phrase]! : null
}
